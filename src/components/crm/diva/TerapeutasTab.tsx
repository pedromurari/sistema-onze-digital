import { useEffect, useState } from 'react';
import { Plus, CheckCircle2, PauseCircle, XCircle, Clock, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SectionBar } from '@/components/crm/ui/premium';

type StatusTerapeuta = 'em_analise' | 'aprovado' | 'pausado' | 'reprovado';

interface Terapeuta {
  id: string; nome: string; especialidade: string | null; bio: string | null;
  whatsapp: string | null; email: string | null; chave_pix: string | null;
  foto_url: string | null; status: StatusTerapeuta; aluno_id: string | null;
  parceiro_id: string | null;
}

interface ProdutoSplit { id: string; nome: string; preco: number; }

const SUPABASE_FUNCTIONS_URL = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1';

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

const STATUS_CONFIG: Record<StatusTerapeuta, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  em_analise: { label: 'Em análise', className: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  aprovado:   { label: 'Aprovado (aparece em /diva)', className: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  pausado:    { label: 'Pausado', className: 'bg-gray-100 text-gray-700 border-gray-200', icon: PauseCircle },
  reprovado:  { label: 'Reprovado', className: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
};

export function TerapeutasTab() {
  const [terapeutas, setTerapeutas] = useState<Terapeuta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [bio, setBio] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [chavePix, setChavePix] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [pixEditando, setPixEditando] = useState<string | null>(null);
  const [pixRascunho, setPixRascunho] = useState('');
  const [fotoEditando, setFotoEditando] = useState<string | null>(null);
  const [fotoRascunho, setFotoRascunho] = useState('');
  const [mpConectado, setMpConectado] = useState<Record<string, boolean>>({});
  const [produtosPorParceiro, setProdutosPorParceiro] = useState<Record<string, ProdutoSplit[]>>({});
  const [splitAberto, setSplitAberto] = useState<string | null>(null);

  const carregar = async () => {
    setCarregando(true);
    const { data } = await supabase.from('diva_terapeutas').select('*').order('created_at', { ascending: false });
    const lista = (data as Terapeuta[]) ?? [];
    setTerapeutas(lista);

    const parceiroIds = lista.map(t => t.parceiro_id).filter((id): id is string => !!id);
    if (parceiroIds.length > 0) {
      const [{ data: parceirosData }, { data: produtosData }] = await Promise.all([
        supabase.from('parceiros').select('id, mp_connected_at').in('id', parceiroIds),
        supabase.from('parceiros_produtos').select('id, parceiro_id, nome, preco').in('parceiro_id', parceiroIds).order('preco'),
      ]);
      const conectado: Record<string, boolean> = {};
      (parceirosData as { id: string; mp_connected_at: string | null }[] ?? []).forEach(p => { conectado[p.id] = !!p.mp_connected_at; });
      setMpConectado(conectado);
      const porParceiro: Record<string, ProdutoSplit[]> = {};
      (produtosData as (ProdutoSplit & { parceiro_id: string })[] ?? []).forEach(p => {
        (porParceiro[p.parceiro_id] ??= []).push({ id: p.id, nome: p.nome, preco: p.preco });
      });
      setProdutosPorParceiro(porParceiro);
    }
    setCarregando(false);
  };

  useEffect(() => { void carregar(); }, []);

  const adicionar = async () => {
    if (!nome.trim() || salvando) return;
    setSalvando(true);
    await supabase.from('diva_terapeutas').insert({
      nome: nome.trim(),
      especialidade: especialidade.trim() || null,
      bio: bio.trim() || null,
      whatsapp: whatsapp.trim() || null,
      email: email.trim() || null,
      chave_pix: chavePix.trim() || null,
      foto_url: fotoUrl.trim() || null,
      status: 'em_analise',
    });
    setNome(''); setEspecialidade(''); setBio(''); setWhatsapp(''); setEmail(''); setChavePix(''); setFotoUrl('');
    setSalvando(false);
    await carregar();
  };

  const mudarStatus = async (id: string, status: StatusTerapeuta) => {
    await supabase.from('diva_terapeutas').update({ status }).eq('id', id);
    await carregar();
  };

  const salvarPix = async (id: string) => {
    await supabase.from('diva_terapeutas').update({ chave_pix: pixRascunho.trim() || null }).eq('id', id);
    setPixEditando(null);
    await carregar();
  };

  const salvarFoto = async (id: string) => {
    await supabase.from('diva_terapeutas').update({ foto_url: fotoRascunho.trim() || null }).eq('id', id);
    setFotoEditando(null);
    await carregar();
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <SectionBar title={`Terapeutas (${carregando ? '—' : terapeutas.length})`} />
          {carregando ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : terapeutas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum terapeuta cadastrado ainda.</p>
          ) : (
            <div className="space-y-2">
              {terapeutas.map(t => {
                const cfg = STATUS_CONFIG[t.status];
                return (
                  <div key={t.id} className="rounded-lg border border-border/60 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {t.foto_url ? (
                          <img src={t.foto_url} alt={t.nome} className="h-9 w-9 rounded-full object-cover border border-border/60" />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
                            {t.nome.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <span className="font-medium text-sm">{t.nome}</span>
                          {t.especialidade && <span className="text-xs text-muted-foreground"> — {t.especialidade}</span>}
                        </div>
                      </div>
                      <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>
                    </div>
                    {t.bio && <p className="text-xs text-muted-foreground">{t.bio}</p>}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">Chave PIX:</span>
                      {pixEditando === t.id ? (
                        <>
                          <Input
                            className="h-7 w-48 text-xs"
                            value={pixRascunho}
                            onChange={e => setPixRascunho(e.target.value)}
                            autoFocus
                          />
                          <Button size="sm" className="h-7 px-2" onClick={() => void salvarPix(t.id)}>Salvar</Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setPixEditando(null)}>Cancelar</Button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="font-medium underline-offset-2 hover:underline"
                          onClick={() => { setPixEditando(t.id); setPixRascunho(t.chave_pix ?? ''); }}
                        >
                          {t.chave_pix || 'definir...'}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">Foto:</span>
                      {fotoEditando === t.id ? (
                        <>
                          <Input
                            className="h-7 w-64 text-xs"
                            placeholder="URL da foto"
                            value={fotoRascunho}
                            onChange={e => setFotoRascunho(e.target.value)}
                            autoFocus
                          />
                          <Button size="sm" className="h-7 px-2" onClick={() => void salvarFoto(t.id)}>Salvar</Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setFotoEditando(null)}>Cancelar</Button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="font-medium underline-offset-2 hover:underline"
                          onClick={() => { setFotoEditando(t.id); setFotoRascunho(t.foto_url ?? ''); }}
                        >
                          {t.foto_url ? 'trocar...' : 'definir...'}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">Split (Mercado Pago):</span>
                      {mpConectado[t.parceiro_id ?? ''] ? (
                        <>
                          <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200">Conectado</Badge>
                          <button
                            type="button"
                            className="font-medium underline-offset-2 hover:underline"
                            onClick={() => setSplitAberto(splitAberto === t.id ? null : t.id)}
                          >
                            {splitAberto === t.id ? 'ocultar links' : 'ver links dos planos'}
                          </button>
                        </>
                      ) : (
                        <Button
                          size="sm" variant="outline" className="h-7 text-xs gap-1"
                          onClick={() => void copiar(`${SUPABASE_FUNCTIONS_URL}/diva-terapeuta-conectar-mp?terapeuta_id=${t.id}`)}
                        >
                          <LinkIcon className="h-3 w-3" /> Copiar link de conexão
                        </Button>
                      )}
                    </div>
                    {splitAberto === t.id && t.parceiro_id && (
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-2 space-y-1">
                        {(produtosPorParceiro[t.parceiro_id] ?? []).map(p => (
                          <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                            <span>{p.nome.replace(/^Divã IDM — /, '')} — R${Number(p.preco).toFixed(0)}</span>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => void copiar(`${window.location.origin}/comprar/${p.id}`)}>Copiar link</Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {t.status !== 'aprovado' && <Button size="sm" variant="outline" onClick={() => void mudarStatus(t.id, 'aprovado')}>Aprovar</Button>}
                      {t.status !== 'pausado' && <Button size="sm" variant="outline" onClick={() => void mudarStatus(t.id, 'pausado')}>Pausar</Button>}
                      {t.status !== 'reprovado' && <Button size="sm" variant="outline" className="text-destructive" onClick={() => void mudarStatus(t.id, 'reprovado')}>Reprovar</Button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed border-border/70">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <SectionBar title="Credenciar terapeuta" icon={Plus} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Nome completo" value={nome} onChange={e => setNome(e.target.value)} />
            <Input placeholder="Especialidade (ex: Psicanálise)" value={especialidade} onChange={e => setEspecialidade(e.target.value)} />
            <Input placeholder="WhatsApp" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
            <Input placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} />
            <Input placeholder="Chave PIX" value={chavePix} onChange={e => setChavePix(e.target.value)} />
            <Input placeholder="URL da foto (opcional)" value={fotoUrl} onChange={e => setFotoUrl(e.target.value)} />
          </div>
          <Textarea placeholder="Bio curta (aparece no painel público quando aprovado)" value={bio} onChange={e => setBio(e.target.value)} />
          <Button onClick={() => void adicionar()} disabled={salvando || !nome.trim()}>Cadastrar (entra como "Em análise")</Button>
        </CardContent>
      </Card>
    </div>
  );
}
