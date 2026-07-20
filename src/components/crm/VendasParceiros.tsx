import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

type VendaStatus = 'pendente' | 'aprovado' | 'recusado' | 'estornado';

type Venda = {
  id: string;
  produto_id: string;
  comprador_nome: string | null;
  valor_bruto: number;
  status: VendaStatus;
  created_at: string;
  parceiros_produtos: { nome: string } | null;
  parceiros_cupons: { codigo: string } | null;
};

const STATUS_CONFIG: Record<VendaStatus, { label: string; className: string }> = {
  pendente:  { label: 'Pendente',  className: 'bg-amber-100 text-amber-700 border-amber-200' },
  aprovado:  { label: 'Aprovado',  className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  recusado:  { label: 'Recusado',  className: 'bg-red-100 text-red-700 border-red-200' },
  estornado: { label: 'Estornado', className: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export function VendasParceiros({ scopedParceiroId, produtoId, mes, onResumo }: {
  scopedParceiroId?: string;
  produtoId?: string;
  mes?: string;
  onResumo?: (r: { total: number; qtd: number }) => void;
}) {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(true);

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
      .select('id, produto_id, comprador_nome, valor_bruto, status, created_at, parceiros_produtos(nome), parceiros_cupons(codigo)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (produtoIds) {
      if (produtoIds.length === 0) { setVendas([]); onResumo?.({ total: 0, qtd: 0 }); setLoading(false); return; }
      query = query.in('produto_id', produtoIds);
    }
    if (mes) {
      const inicio = format(startOfMonth(new Date(`${mes}-01T12:00:00`)), 'yyyy-MM-dd') + 'T00:00:00';
      const fim = format(endOfMonth(new Date(`${mes}-01T12:00:00`)), 'yyyy-MM-dd') + 'T23:59:59';
      query = query.gte('created_at', inicio).lte('created_at', fim);
    }

    const { data, error } = await query;
    if (error) { toast.error(`Erro ao carregar vendas: ${error.message}`); setLoading(false); return; }
    const rows = ((data as any) || []) as Venda[];
    setVendas(rows);
    const aprovadas = rows.filter(v => v.status === 'aprovado');
    onResumo?.({ total: aprovadas.reduce((s, v) => s + Number(v.valor_bruto || 0), 0), qtd: aprovadas.length });
    setLoading(false);
  }, [scopedParceiroId, produtoId, mes, onResumo]);

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
              <div key={v.id} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{v.parceiros_produtos?.nome ?? 'Produto'}</p>
                  <p className="text-xs text-muted-foreground">
                    {v.comprador_nome} · R$ {Number(v.valor_bruto).toFixed(2)}
                    {v.parceiros_cupons?.codigo && ` · cupom ${v.parceiros_cupons.codigo}`}
                    {' · '}{format(new Date(v.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </p>
                </div>
                <Badge variant="outline" className={cn(cfg.className)}>{cfg.label}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
