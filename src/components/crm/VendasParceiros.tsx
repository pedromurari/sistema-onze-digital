import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, Mail, Phone, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

type VendaStatus = 'pendente' | 'aprovado' | 'recusado' | 'estornado';

type Venda = {
  id: string;
  produto_id: string;
  comprador_nome: string | null;
  comprador_email: string | null;
  comprador_whatsapp: string | null;
  valor_bruto: number;
  status: VendaStatus;
  origem: string | null;
  syncpay_transaction_id: string | null;
  created_at: string;
  parceiros_produtos: { nome: string } | null;
  parceiros_cupons: { codigo: string } | null;
};

export type ResumoVendas = {
  total: number;
  qtd: number;
  pendentesQtd: number;
  porProduto: Record<string, { valor: number; qtd: number }>;
};

export type PeriodoRange = { inicio: string | null; fim: string | null };

const STATUS_CONFIG: Record<VendaStatus, { label: string; className: string }> = {
  pendente:  { label: 'Pendente',  className: 'bg-amber-100 text-amber-700 border-amber-200' },
  aprovado:  { label: 'Aprovado',  className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  recusado:  { label: 'Recusado',  className: 'bg-red-100 text-red-700 border-red-200' },
  estornado: { label: 'Estornado', className: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export function VendasParceiros({ scopedParceiroId, produtoId, periodo, onResumo }: {
  scopedParceiroId?: string;
  produtoId?: string;
  periodo?: PeriodoRange;
  onResumo?: (r: ResumoVendas) => void;
}) {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(true);
  const [detalhe, setDetalhe] = useState<Venda | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    let produtoIds: string[] | null = null;
    if (produtoId) {
      produtoIds = [produtoId];
    } else if (scopedParceiroId) {
      const { data } = await supabase.from('parceiros_produtos' as any)
        .select('id').eq('parceiro_id', scopedParceiroId);
      produtoIds = ((data as any) || []).map((p: any) => p.id);
    }

    let query = supabase.from('parceiros_vendas' as any)
      .select('id, produto_id, comprador_nome, comprador_email, comprador_whatsapp, valor_bruto, status, origem, syncpay_transaction_id, created_at, parceiros_produtos(nome), parceiros_cupons(codigo)')
      .order('created_at', { ascending: false })
      .limit(200);

    if (produtoIds) {
      if (produtoIds.length === 0) {
        setVendas([]);
        onResumo?.({ total: 0, qtd: 0, pendentesQtd: 0, porProduto: {} });
        setLoading(false);
        return;
      }
      query = query.in('produto_id', produtoIds);
    }
    if (periodo?.inicio) query = query.gte('created_at', periodo.inicio);
    if (periodo?.fim) query = query.lte('created_at', periodo.fim);

    const { data, error } = await query;
    if (error) { toast.error(`Erro ao carregar vendas: ${error.message}`); setLoading(false); return; }
    const rows = ((data as any) || []) as Venda[];
    setVendas(rows);

    const aprovadas = rows.filter(v => v.status === 'aprovado');
    const pendentesQtd = rows.filter(v => v.status === 'pendente').length;
    const porProduto: Record<string, { valor: number; qtd: number }> = {};
    aprovadas.forEach(v => {
      const atual = porProduto[v.produto_id] || { valor: 0, qtd: 0 };
      atual.valor += Number(v.valor_bruto || 0);
      atual.qtd += 1;
      porProduto[v.produto_id] = atual;
    });
    onResumo?.({
      total: aprovadas.reduce((s, v) => s + Number(v.valor_bruto || 0), 0),
      qtd: aprovadas.length,
      pendentesQtd,
      porProduto,
    });
    setLoading(false);
  }, [scopedParceiroId, produtoId, periodo?.inicio, periodo?.fim, onResumo]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">Vendas</p>
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : vendas.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Nenhuma venda registrada no período.</div>
      ) : (
        <div className="bg-white border border-border rounded-xl divide-y divide-border">
          {vendas.map(v => {
            const cfg = STATUS_CONFIG[v.status];
            return (
              <button key={v.id} onClick={() => setDetalhe(v)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{v.parceiros_produtos?.nome ?? 'Produto'}</p>
                  <p className="text-xs text-muted-foreground">
                    {v.comprador_nome} · R$ {Number(v.valor_bruto).toFixed(2)}
                    {v.parceiros_cupons?.codigo && ` · cupom ${v.parceiros_cupons.codigo}`}
                    {' · '}{format(new Date(v.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </p>
                </div>
                <Badge variant="outline" className={cn(cfg.className)}>{cfg.label}</Badge>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={!!detalhe} onOpenChange={(open) => !open && setDetalhe(null)}>
        <DialogContent className="max-w-md">
          {detalhe && (
            <>
              <DialogHeader>
                <DialogTitle>{detalhe.parceiros_produtos?.nome ?? 'Produto'}</DialogTitle>
                <DialogDescription>
                  {format(new Date(detalhe.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Badge variant="outline" className={cn(STATUS_CONFIG[detalhe.status].className)}>
                  {STATUS_CONFIG[detalhe.status].label}
                </Badge>
                <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-foreground">{detalhe.comprador_nome || 'Nome não informado'}</p>
                  {detalhe.comprador_email && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {detalhe.comprador_email}</p>
                  )}
                  {detalhe.comprador_whatsapp && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {detalhe.comprador_whatsapp}</p>
                  )}
                  {!detalhe.comprador_email && !detalhe.comprador_whatsapp && (
                    <p className="text-xs text-muted-foreground/70">A SyncPay ainda não enviou e-mail/WhatsApp pra essa venda (comum enquanto está pendente).</p>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Valor</span>
                  <span className="font-semibold text-foreground">R$ {Number(detalhe.valor_bruto).toFixed(2)}</span>
                </div>
                {detalhe.parceiros_cupons?.codigo && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Cupom</span>
                    <span className="font-mono text-foreground">{detalhe.parceiros_cupons.codigo}</span>
                  </div>
                )}
                {detalhe.syncpay_transaction_id && (
                  <p className="text-[11px] text-muted-foreground/70 flex items-center gap-1.5 truncate">
                    <Hash className="h-3 w-3 flex-shrink-0" /> {detalhe.syncpay_transaction_id}
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
