import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type RepasseVenda = {
  id: string;
  comissao_afiliado: number | null;
  parceiros_cupons: { codigo: string; parceiros: { nome: string; pix_chave: string | null } | null } | null;
};

export function RepassesParceiros() {
  const [pendentes, setPendentes] = useState<RepasseVenda[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('parceiros_vendas' as any)
      .select('id, comissao_afiliado, parceiros_cupons(codigo, parceiros(nome, pix_chave))')
      .eq('status', 'aprovado')
      .eq('comissao_afiliado_paga', false)
      .gt('comissao_afiliado', 0)
      .order('created_at', { ascending: false });
    if (error) { toast.error(`Erro ao carregar repasses: ${error.message}`); setLoading(false); return; }
    setPendentes((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const marcarRepasseFeito = async (venda: RepasseVenda) => {
    const { error } = await supabase.from('parceiros_vendas' as any)
      .update({ comissao_afiliado_paga: true, comissao_afiliado_paga_em: new Date().toISOString() })
      .eq('id', venda.id);
    if (error) { toast.error(`Erro ao marcar repasse: ${error.message}`); return; }
    toast.success('Repasse marcado como feito.');
    load();
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        O Mercado Pago não faz split de três pontas — a comissão da afiliada precisa ser paga por fora (Pix). Marque como pago depois de transferir.
      </p>
      {pendentes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Nenhum repasse pendente.</div>
      ) : (
        <div className="space-y-2">
          {pendentes.map(v => (
            <div key={v.id} className="flex items-center gap-3 bg-white border border-border rounded-lg p-3">
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
      )}
    </div>
  );
}
