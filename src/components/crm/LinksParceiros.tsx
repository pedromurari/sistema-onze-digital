import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Link2, Copy, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { NovoProdutoDialog } from './NovoProdutoDialog';

// Dominio proprio pros links rastreaveis (em vez do dominio feio do Vercel).
// Precisa de um CNAME em ir.idmpsi.com.br apontando pra este projeto Vercel.
const LINK_BASE_URL = 'https://ir.idmpsi.com.br';

type ProdutoStatus = 'em_analise' | 'aprovado' | 'ativo' | 'pausado' | 'reprovado';

type ProdutoLink = {
  id: string;
  parceiro_id: string;
  nome: string;
  status: ProdutoStatus;
  checkout_link_syncpay: string | null;
  pagina_vendas_url: string | null;
  parceiros: { nome: string } | null;
};

const STATUS_CONFIG: Record<ProdutoStatus, { label: string; className: string }> = {
  em_analise: { label: 'Em análise', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  aprovado:   { label: 'Aprovado',   className: 'bg-blue-100 text-blue-700 border-blue-200' },
  ativo:      { label: 'Ativo',      className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  pausado:    { label: 'Pausado',    className: 'bg-gray-100 text-gray-700 border-gray-200' },
  reprovado:  { label: 'Reprovado',  className: 'bg-red-100 text-red-700 border-red-200' },
};

function copiarLink(link: string) {
  navigator.clipboard.writeText(link);
  toast.success('Link copiado!');
}

const TIPO_LABEL: Record<'vendas' | 'checkout', string> = {
  vendas: 'Página de vendas',
  checkout: 'Checkout (Sync Pay)',
};

function LinkField({ produtoId, parceiroId, parceiraNome, produtoNome, tipo, campo, placeholder, valorAtual, editable, onSaved }: {
  produtoId: string;
  parceiroId: string;
  parceiraNome: string;
  produtoNome: string;
  tipo: 'vendas' | 'checkout';
  campo: 'checkout_link_syncpay' | 'pagina_vendas_url';
  placeholder: string;
  valorAtual: string | null;
  editable: boolean;
  onSaved: () => void;
}) {
  const [valor, setValor] = useState(valorAtual || '');
  const [saving, setSaving] = useState(false);

  const slug = `${produtoId.slice(0, 8)}-${tipo}`;
  const linkRastreavel = `${LINK_BASE_URL}/ir/${slug}`;

  const salvar = async () => {
    setSaving(true);
    const destino = valor.trim();

    const { error } = await supabase.from('parceiros_produtos' as any)
      .update({ [campo]: destino || null })
      .eq('id', produtoId);
    if (error) { toast.error(`Erro ao salvar link: ${error.message}`); setSaving(false); return; }

    if (destino) {
      const { error: linkError } = await supabase.from('parceiros_links' as any)
        .upsert({
          parceiro_id: parceiroId,
          produto_id: produtoId,
          slug,
          titulo: `${TIPO_LABEL[tipo]} — ${produtoNome}`,
          destino_url: destino,
          ativo: true,
          parceira_nome: parceiraNome,
          produto_nome: produtoNome,
        }, { onConflict: 'slug' });
      if (linkError) { toast.error(`Link salvo, mas o rastreamento falhou: ${linkError.message}`); setSaving(false); return; }
    } else {
      await supabase.from('parceiros_links' as any).update({ ativo: false }).eq('slug', slug);
    }

    setSaving(false);
    toast.success('Link salvo.');
    onSaved();
  };

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{TIPO_LABEL[tipo]}</Label>
      {editable ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Input className="h-9" placeholder={placeholder} value={valor} onChange={e => setValor(e.target.value)} />
            <Button size="sm" disabled={saving || valor.trim() === (valorAtual || '')} onClick={salvar}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
          {valorAtual && (
            <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-2.5 py-1.5">
              <span className="text-[11px] text-muted-foreground truncate flex-1">
                Link rastreável (divulgar este): <span className="font-mono">{linkRastreavel}</span>
              </span>
              <Button size="sm" variant="outline" className="h-7 w-7 p-0 flex-shrink-0" onClick={() => copiarLink(linkRastreavel)} title="Copiar link rastreável">
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      ) : valorAtual ? (
        <button
          onClick={() => copiarLink(linkRastreavel)}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-lg py-1.5 transition-colors"
        >
          <Copy className="h-3.5 w-3.5" /> Copiar link pra divulgar
        </button>
      ) : (
        <p className="text-xs text-muted-foreground py-1">Ainda sem link cadastrado.</p>
      )}
    </div>
  );
}

function LinkRow({ produto, editable, onSaved }: { produto: ProdutoLink; editable: boolean; onSaved: () => void }) {
  const cfg = STATUS_CONFIG[produto.status];

  return (
    <div className="bg-white border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">{produto.nome}</p>
          {produto.parceiros?.nome && <p className="text-xs text-muted-foreground">{produto.parceiros.nome}</p>}
        </div>
        <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>
      </div>

      <LinkField
        produtoId={produto.id}
        parceiroId={produto.parceiro_id}
        parceiraNome={produto.parceiros?.nome ?? ''}
        produtoNome={produto.nome}
        tipo="vendas"
        campo="pagina_vendas_url"
        placeholder="https://www.idmpsi.com.br/..."
        valorAtual={produto.pagina_vendas_url}
        editable={editable}
        onSaved={onSaved}
      />

      <LinkField
        produtoId={produto.id}
        parceiroId={produto.parceiro_id}
        parceiraNome={produto.parceiros?.nome ?? ''}
        produtoNome={produto.nome}
        tipo="checkout"
        campo="checkout_link_syncpay"
        placeholder="Cole aqui o link de checkout da Sync Pay"
        valorAtual={produto.checkout_link_syncpay}
        editable={editable}
        onSaved={onSaved}
      />
    </div>
  );
}

export function LinksParceiros({ scopedParceiroId, editable = false }: { scopedParceiroId?: string; editable?: boolean }) {
  const [produtos, setProdutos] = useState<ProdutoLink[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('parceiros_produtos' as any)
      .select('id, parceiro_id, nome, status, checkout_link_syncpay, pagina_vendas_url, parceiros(nome)')
      .order('nome');
    if (scopedParceiroId) query = query.eq('parceiro_id', scopedParceiroId);
    const { data, error } = await query;
    if (error) { toast.error(`Erro ao carregar links: ${error.message}`); setLoading(false); return; }
    setProdutos((data as any) || []);
    setLoading(false);
  }, [scopedParceiroId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      {editable && (
        <div className="flex justify-end">
          <NovoProdutoDialog scopedParceiroId={scopedParceiroId} onCreated={load} />
        </div>
      )}

      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <p>Cole aqui a URL real de cada link. Pra divulgar, copie sempre o <strong>link rastreável</strong> que aparece embaixo — ele registra o clique (aba Tráfego) antes de redirecionar pro destino real.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : produtos.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <Link2 className="h-6 w-6 mx-auto mb-2 opacity-40" />
          Nenhum produto cadastrado ainda.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {produtos.map(p => <LinkRow key={p.id} produto={p} editable={editable} onSaved={load} />)}
        </div>
      )}
    </div>
  );
}
