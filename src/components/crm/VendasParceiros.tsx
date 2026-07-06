import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

type VendaStatus = 'pendente' | 'aprovado' | 'recusado' | 'estornado';

type Venda = {
  id: string;
  comprador_nome: string | null;
  valor_bruto: number;
  comissao_idm: number | null;
  comissao_afiliado: number | null;
  comissao_afiliado_paga: boolean;
  status: VendaStatus;
  created_at: string;
  parceiros_produtos: { nome: string } | null;
  parceiros_cupons: { codigo: string; parceiros: { nome: string; pix_chave: string | null } | null } | null;
};

const STATUS_CONFIG: Record<VendaStatus, { label: string; className: string }> = {
  pendente:  { label: 'Pendente',  className: 'bg-amber-100 text-amber-700 border-amber-200' },
  aprovado:  { label: 'Aprovado',  className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  recusado:  { label: 'Recusado',  className: 'bg-red-100 text-red-700 border-red-200' },
  estornado: { label: 'Estornado', className: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export function VendasParceiros() {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('parceiros_vendas' as any)
      .select('id, comprador_nome, valor_bruto, comissao_idm, comissao_afiliado, comissao_afiliado_paga, status, created_at, parceiros_produtos(nome), parceiros_cupons(codigo, parceiros(nome, pix_chave))')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) { toast.error(`Erro ao carregar vendas: ${error.message}`); setLoading(false); return; }
    setVendas((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const marcarRepasseFeito = async (venda: Venda) => {
    const { error } = await supabase.from('parceiros_vendas' as any)
      .update({ comissao_afiliado_paga: true, comissao_afiliado_paga_em: new Date().toISOString() })
      .eq('id', venda.id);
    if (error) { toast.error(`Erro ao marcar repasse: ${error.message}`); return; }
    toast.success('Repasse marcado como feito.');
    load();
  };

  const pendentesRepasse = vendas.filter(v => v.status === 'aprovado' && (v.comissao_afiliado ?? 0) > 0 && !v.comissao_afiliado_paga);

  return (
    <div className="space-y-5">
      {pendentesRepasse.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">Comissões de afiliada pendentes de repasse manual</p>
          <p className="text-xs text-muted-foreground">
            O Mercado Pago não faz split de três pontas — a comissão da afiliada precisa ser paga por fora (Pix). Marque como pago depois de transferir.
          </p>
          <div className="space-y-2">
            {pendentesRepasse.map(v => (
              <div key={v.id} className="flex items-center gap-3 bg-white border border-amber-100 rounded-lg p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {v.parceiros_cupons?.parceiros?.nome ?? 'Afiliada'} · R$ {Number(v.comissao_afiliado).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cupom {v.parceiros_cupons?.codigo} · Pix: {v.parceiros_cupons?.parceiros?.pix_chave || 'não cadastrada'}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => marcarRepasseFeito(v)}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Marcar como pago
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : vendas.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Nenhuma venda registrada ainda.</div>
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
