import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Link as LinkIcon, CheckCircle2, PauseCircle, XCircle, Clock, KeyRound } from 'lucide-react';

/**
 * Ficha do terapeuta em pop-up -- mesmo padrão de FichaAlunoResumo.tsx
 * (lista → ícone de olho → Dialog com a ficha completa). Um componente só
 * com dois níveis de detalhe:
 *  - modo="admin": tudo que antes ficava espalhado na linha de
 *    TerapeutasTab.tsx (bio, whatsapp, Pix editável, foto editável,
 *    status do split MP, todos os links de planos, aprovar/pausar/
 *    reprovar) -- busca direto diva_terapeutas/parceiros/parceiros_produtos.
 *  - modo="vendedor": só identidade + links dos planos pra copiar, sem
 *    Pix/bio/status interno -- busca a view diva_terapeutas_links_vendedor
 *    (que já expõe só colunas seguras, nunca essas sensíveis).
 */

type StatusTerapeuta = 'em_analise' | 'aprovado' | 'pausado' | 'reprovado';

interface TerapeutaCompleto {
  id: string; nome: string; especialidade: string | null; bio: string | null;
  whatsapp: string | null; email: string | null; chave_pix: string | null;
  foto_url: string | null; status: StatusTerapeuta; parceiro_id: string | null;
}
interface ProdutoLink { id: string; nome: string; preco: number; }
interface LinkSimples { produto_id: string; produto_nome: string; preco: number; }
interface LinksVendedor { nome: string; especialidade: string | null; foto_url: string | null; links: LinkSimples[]; }

const SUPABASE_FUNCTIONS_URL = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1';

const STATUS_CONFIG: Record<StatusTerapeuta, { label: string; className: string }> = {
  em_analise: { label: 'Em análise', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  aprovado:   { label: 'Aprovado (aparece em /diva)', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  pausado:    { label: 'Pausado', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  reprovado:  { label: 'Reprovado', className: 'bg-red-100 text-red-700 border-red-200' },
};

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success('Link copiado.');
    return;
  } catch { /* cai pro fallback abaixo */ }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = texto;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (ok) { toast.success('Link copiado.'); return; }
  } catch { /* cai pro aviso manual abaixo */ }

  toast.error(`Não consegui copiar automático. Link: ${texto}`, { duration: 15000 });
}

export function FichaTerapeutaDialog({ terapeutaId, modo, onClose, onAtualizado }: {
  terapeutaId: string;
  modo: 'admin' | 'vendedor';
  onClose: () => void;
  onAtualizado?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [terapeuta, setTerapeuta] = useState<TerapeutaCompleto | null>(null);
  const [mpConectado, setMpConectado] = useState(false);
  const [produtos, setProdutos] = useState<ProdutoLink[]>([]);
  const [pixRascunho, setPixRascunho] = useState('');
  const [editandoPix, setEditandoPix] = useState(false);
  const [fotoRascunho, setFotoRascunho] = useState('');
  const [editandoFoto, setEditandoFoto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [linksVendedor, setLinksVendedor] = useState<LinksVendedor | null>(null);
  const [pinGerado, setPinGerado] = useState<string | null>(null);
  const [gerandoPin, setGerandoPin] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      setErro(null);

      if (modo === 'vendedor') {
        const { data, error } = await supabase
          .from('diva_terapeutas_links_vendedor' as never)
          .select('terapeuta_id, nome, especialidade, foto_url, produto_id, produto_nome, preco')
          .eq('terapeuta_id', terapeutaId);
        if (cancelado) return;
        const linhas = (data as unknown as Array<{ nome: string; especialidade: string | null; foto_url: string | null; produto_id: string; produto_nome: string; preco: number }>) ?? [];
        if (error || linhas.length === 0) { setErro(error?.message ?? 'Sem planos ativos pra esse terapeuta.'); setLoading(false); return; }
        setLinksVendedor({
          nome: linhas[0].nome, especialidade: linhas[0].especialidade, foto_url: linhas[0].foto_url,
          links: linhas.map(l => ({ produto_id: l.produto_id, produto_nome: l.produto_nome, preco: l.preco })),
        });
        setLoading(false);
        return;
      }

      const { data: t, error: terapeutaError } = await supabase
        .from('diva_terapeutas')
        .select('id, nome, especialidade, bio, whatsapp, email, chave_pix, foto_url, status, parceiro_id')
        .eq('id', terapeutaId)
        .maybeSingle();
      if (cancelado) return;
      if (terapeutaError || !t) { setErro(terapeutaError?.message ?? 'Terapeuta não encontrado.'); setLoading(false); return; }

      const terapeutaTyped = t as TerapeutaCompleto;
      setTerapeuta(terapeutaTyped);
      setPixRascunho(terapeutaTyped.chave_pix ?? '');
      setFotoRascunho(terapeutaTyped.foto_url ?? '');

      if (terapeutaTyped.parceiro_id) {
        const [{ data: parceiro }, { data: prods }] = await Promise.all([
          supabase.from('parceiros').select('mp_connected_at').eq('id', terapeutaTyped.parceiro_id).maybeSingle(),
          supabase.from('parceiros_produtos').select('id, nome, preco').eq('parceiro_id', terapeutaTyped.parceiro_id).order('preco'),
        ]);
        if (cancelado) return;
        setMpConectado(!!(parceiro as { mp_connected_at: string | null } | null)?.mp_connected_at);
        setProdutos((prods as ProdutoLink[]) ?? []);
      } else {
        setMpConectado(false);
        setProdutos([]);
      }
      setLoading(false);
    })();
    return () => { cancelado = true; };
  }, [terapeutaId, modo]);

  const mudarStatus = async (status: StatusTerapeuta) => {
    if (!terapeuta) return;
    await supabase.from('diva_terapeutas').update({ status }).eq('id', terapeuta.id);
    setTerapeuta({ ...terapeuta, status });
    onAtualizado?.();
  };

  const salvarPix = async () => {
    if (!terapeuta) return;
    setSalvando(true);
    await supabase.from('diva_terapeutas').update({ chave_pix: pixRascunho.trim() || null }).eq('id', terapeuta.id);
    setSalvando(false);
    setTerapeuta({ ...terapeuta, chave_pix: pixRascunho.trim() || null });
    setEditandoPix(false);
    onAtualizado?.();
  };

  const salvarFoto = async () => {
    if (!terapeuta) return;
    setSalvando(true);
    await supabase.from('diva_terapeutas').update({ foto_url: fotoRascunho.trim() || null }).eq('id', terapeuta.id);
    setSalvando(false);
    setTerapeuta({ ...terapeuta, foto_url: fotoRascunho.trim() || null });
    setEditandoFoto(false);
    onAtualizado?.();
  };

  const gerarPin = async () => {
    if (!terapeuta || gerandoPin) return;
    setGerandoPin(true);
    const { data, error } = await supabase.rpc('diva_terapeuta_pin_gerar' as never, { p_terapeuta_id: terapeuta.id } as never);
    setGerandoPin(false);
    if (error || !data) { toast.error('Não foi possível gerar o PIN: ' + (error?.message ?? 'erro desconhecido')); return; }
    setPinGerado(data as unknown as string);
  };

  const nomeExibido = modo === 'vendedor' ? linksVendedor?.nome : terapeuta?.nome;

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{loading ? 'Carregando…' : (nomeExibido ?? 'Ficha do terapeuta')}</DialogTitle>
          <DialogDescription>
            {modo === 'vendedor' ? 'Links de venda — Divã IDM' : 'Ficha completa — Divã IDM'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center h-32"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : erro ? (
          <p className="text-sm text-muted-foreground text-center py-8">{erro}</p>
        ) : modo === 'vendedor' && linksVendedor ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {linksVendedor.foto_url ? (
                <img src={linksVendedor.foto_url} alt={linksVendedor.nome} className="h-12 w-12 rounded-full object-cover border border-border/60" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-sm text-muted-foreground">{linksVendedor.nome.charAt(0).toUpperCase()}</div>
              )}
              <div>
                <p className="font-medium text-sm">{linksVendedor.nome}</p>
                {linksVendedor.especialidade && <p className="text-xs text-muted-foreground">{linksVendedor.especialidade}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              {linksVendedor.links.map(l => (
                <div key={l.produto_id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <span>{l.produto_nome.replace(/^Divã IDM — /, '')} — R${Number(l.preco).toFixed(0)}</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => void copiar(`${window.location.origin}/comprar/${l.produto_id}`)}>
                    <LinkIcon className="h-3 w-3" /> Copiar link
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : terapeuta && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                {terapeuta.foto_url ? (
                  <img src={terapeuta.foto_url} alt={terapeuta.nome} className="h-12 w-12 rounded-full object-cover border border-border/60" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-sm text-muted-foreground">{terapeuta.nome.charAt(0).toUpperCase()}</div>
                )}
                <div>
                  <p className="font-medium text-sm">{terapeuta.nome}</p>
                  {terapeuta.especialidade && <p className="text-xs text-muted-foreground">{terapeuta.especialidade}</p>}
                </div>
              </div>
              <Badge variant="outline" className={STATUS_CONFIG[terapeuta.status].className}>{STATUS_CONFIG[terapeuta.status].label}</Badge>
            </div>

            {terapeuta.bio && <p className="text-sm text-muted-foreground">{terapeuta.bio}</p>}

            <section className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">WhatsApp</p>
                {terapeuta.whatsapp ? (
                  <a href={`https://wa.me/${terapeuta.whatsapp}`} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{terapeuta.whatsapp}</a>
                ) : <span className="text-muted-foreground">não informado</span>}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Chave PIX</p>
                {editandoPix ? (
                  <div className="flex items-center gap-1.5">
                    <Input className="h-7 text-xs" value={pixRascunho} onChange={e => setPixRascunho(e.target.value)} autoFocus />
                    <Button size="sm" className="h-7 px-2" disabled={salvando} onClick={() => void salvarPix()}>Salvar</Button>
                  </div>
                ) : (
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => setEditandoPix(true)}>{terapeuta.chave_pix || 'definir...'}</button>
                )}
              </div>
            </section>

            <section>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Foto</p>
              {editandoFoto ? (
                <div className="flex items-center gap-1.5">
                  <Input className="h-7 text-xs" placeholder="URL da foto" value={fotoRascunho} onChange={e => setFotoRascunho(e.target.value)} autoFocus />
                  <Button size="sm" className="h-7 px-2" disabled={salvando} onClick={() => void salvarFoto()}>Salvar</Button>
                </div>
              ) : (
                <button type="button" className="text-sm underline-offset-2 hover:underline" onClick={() => setEditandoFoto(true)}>{terapeuta.foto_url ? 'trocar...' : 'definir...'}</button>
              )}
            </section>

            <section>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Split (Mercado Pago) e links de venda</p>
              {mpConectado ? (
                <div className="space-y-1.5">
                  <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 mb-1">Conectado</Badge>
                  {produtos.map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs">
                      <span>{p.nome.replace(/^Divã IDM — /, '')} — R${Number(p.preco).toFixed(0)}</span>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => void copiar(`${window.location.origin}/comprar/${p.id}`)}>Copiar link</Button>
                    </div>
                  ))}
                </div>
              ) : (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => void copiar(`${SUPABASE_FUNCTIONS_URL}/diva-terapeuta-conectar-mp?terapeuta_id=${terapeuta.id}`)}>
                  <LinkIcon className="h-3 w-3" /> Copiar link de conexão
                </Button>
              )}
            </section>

            <section>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Painel de agenda (login com WhatsApp + PIN)</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => void copiar(`${window.location.origin}/diva/terapeuta/${terapeuta.id}`)}>
                  <LinkIcon className="h-3 w-3" /> Copiar link do painel
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={gerandoPin} onClick={() => void gerarPin()}>
                  <KeyRound className="h-3 w-3" /> {pinGerado ? 'Gerar novo PIN' : 'Gerar PIN de acesso'}
                </Button>
              </div>
              {pinGerado && (
                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 space-y-1.5">
                  <p className="text-xs text-emerald-800">
                    PIN gerado: <span className="font-mono font-bold tracking-widest text-sm">{pinGerado}</span>
                    {' '}— só aparece essa vez, copia a mensagem e manda pro terapeuta pelo WhatsApp.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 bg-white"
                    onClick={() => void copiar(
                      `Oi, ${terapeuta.nome.split(' ')[0]}! Seu painel do Divã IDM (sessões vendidas + sua agenda) já tá pronto:\n\n${window.location.origin}/diva/terapeuta/${terapeuta.id}\n\nPra entrar, usa o seu WhatsApp + esse PIN: ${pinGerado}\n\nGuarda esse PIN, ele é só seu.`,
                    )}
                  >
                    <LinkIcon className="h-3 w-3" /> Copiar mensagem pronta (link + PIN)
                  </Button>
                </div>
              )}
            </section>
          </div>
        )}

        {modo === 'admin' && terapeuta ? (
          <DialogFooter className="flex-wrap gap-1.5">
            {terapeuta.status !== 'aprovado' && <Button size="sm" variant="outline" onClick={() => void mudarStatus('aprovado')}>Aprovar</Button>}
            {terapeuta.status !== 'pausado' && <Button size="sm" variant="outline" onClick={() => void mudarStatus('pausado')}>Pausar</Button>}
            {terapeuta.status !== 'reprovado' && <Button size="sm" variant="outline" className="text-destructive" onClick={() => void mudarStatus('reprovado')}>Reprovar</Button>}
            <Button variant="outline" onClick={onClose} className="ml-auto">Fechar</Button>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Fechar</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
