import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info, Pencil, Plus, Save, Settings2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Produto, TaxaDetalhe } from '@/lib/financial-utils';

// Taxa por forma de pagamento — "como foi realizado o pagamento" (produto ×
// forma × gateway → % + valor fixo por transação). Usado tanto na Balanço
// quanto na FinanceiroCFO: um único lugar de edição, mesma tabela
// `payment_method_rates` nas duas telas.

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center ml-1 cursor-help">
      <Info className="h-3 w-3 text-muted-foreground/60" />
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-foreground text-background text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg leading-relaxed">
        {text}
      </span>
    </span>
  );
}

interface Props {
  produtos: Produto[];
  taxas: TaxaDetalhe[];
  canais: { id: string; nome: string }[];
  onSaved: (fresh: TaxaDetalhe[]) => void;
}

export function TaxasPagamentoConfig({ produtos, taxas, canais, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TaxaDetalhe[]>(taxas);
  const [saving, setSaving] = useState(false);

  const startEditing = () => { setDraft([...taxas]); setEditing(true); };
  const cancelEditing = () => { setEditing(false); setDraft([...taxas]); };

  function findDuplicataChave(): string | null {
    const vistas = new Map<string, number>();
    for (const t of draft) {
      const chave = `${t.produto_slug}|${t.forma_pagamento}|${t.gateway}|${t.faixa_min}`;
      vistas.set(chave, (vistas.get(chave) || 0) + 1);
    }
    for (const [chave, qtd] of vistas) {
      if (qtd > 1) {
        const [produto, forma, canal] = chave.split('|');
        const produtoNome = produto === '*' ? 'Todos' : (produtos.find(p => p.slug === produto)?.nome || produto);
        return `Duas linhas com a mesma combinação: ${produtoNome} + ${forma === '*' ? 'Todos' : forma} + ${canal === '*' ? 'Qualquer canal' : canal}. Ajuste ou remova uma delas antes de salvar.`;
      }
    }
    return null;
  }

  async function handleSave() {
    const duplicata = findDuplicataChave();
    if (duplicata) {
      toast.error(duplicata);
      return;
    }
    setSaving(true);
    try {
      const rows = draft.map(t => ({ ...t, updated_at: new Date().toISOString() }));
      const { error } = await supabase.from('payment_method_rates').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
      const deletedIds = taxas.filter(t => !draft.find(d => d.id === t.id)).map(t => t.id);
      if (deletedIds.length) {
        await supabase.from('payment_method_rates').delete().in('id', deletedIds);
      }
      const { data: fresh } = await supabase.from('payment_method_rates').select('*').eq('ativo', true);
      onSaved((fresh || []) as TaxaDetalhe[]);
      setEditing(false);
      toast.success('Taxas salvas!');
    } catch (err) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
      const duplicada = msg.includes('duplicate key') || msg.includes('unique constraint');
      toast.error(duplicada
        ? 'Já existe uma taxa com esse Produto + Método + Canal. Edite a taxa existente em vez de criar outra igual.'
        : 'Erro ao salvar taxas. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border border-border/60 bg-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings2 size={14} className="text-muted-foreground" />
            Taxas por Forma de Pagamento
            <InfoTip text="Taxa por produto + método (boleto/pix/cartão/à vista) + canal de cobrança (Mercado Pago, Voomp, Asaas...). Regra mais específica prevalece; 'Qualquer canal' é o curinga. O canal é escolhido na hora de confirmar o pagamento, e decide qual taxa se aplica. Editável sem deploy — salvo em payment_method_rates." />
          </CardTitle>
          {!editing ? (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={startEditing}>
              <Pencil className="h-3 w-3" /> Editar taxas
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={cancelEditing}>
                <X className="h-3 w-3" /> Cancelar
              </Button>
              <Button size="sm" className="gap-1.5 text-xs" onClick={handleSave} disabled={saving}>
                <Save className="h-3 w-3" /> {saving ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-2">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-2">Produto</th>
                    <th className="text-left py-2 pr-2">Método</th>
                    <th className="text-left py-2 pr-2">Canal</th>
                    <th className="text-right py-2 pr-2">% Taxa</th>
                    <th className="text-right py-2 pr-2">R$ Fixo</th>
                    <th className="text-left py-2 pr-2">Observação</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {draft.map((taxa, idx) => (
                    <tr key={taxa.id} className="border-b border-border/40">
                      <td className="py-1.5 pr-2">
                        <Select value={taxa.produto_slug} onValueChange={v => setDraft(prev => prev.map((t, i) => i === idx ? { ...t, produto_slug: v } : t))}>
                          <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="*">Todos (*)</SelectItem>
                            {produtos.map(p => <SelectItem key={p.slug} value={p.slug}>{p.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-1.5 pr-2">
                        <Select value={taxa.forma_pagamento} onValueChange={v => setDraft(prev => prev.map((t, i) => i === idx ? { ...t, forma_pagamento: v } : t))}>
                          <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="*">Todos (*)</SelectItem>
                            <SelectItem value="boleto">Boleto</SelectItem>
                            <SelectItem value="cartao">Cartão</SelectItem>
                            <SelectItem value="pix">PIX</SelectItem>
                            <SelectItem value="avista">À Vista</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-1.5 pr-2">
                        <Select value={taxa.gateway} onValueChange={v => setDraft(prev => prev.map((t, i) => i === idx ? { ...t, gateway: v } : t))}>
                          <SelectTrigger className="h-7 text-xs w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="*">Qualquer canal (*)</SelectItem>
                            {canais.map(c => <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input type="number" step="0.01" className="h-7 text-xs w-20 text-right"
                          value={taxa.percentual}
                          onChange={e => setDraft(prev => prev.map((t, i) => i === idx ? { ...t, percentual: parseFloat(e.target.value) || 0 } : t))} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input type="number" step="0.01" className="h-7 text-xs w-20 text-right"
                          value={taxa.fixo_por_transacao}
                          onChange={e => setDraft(prev => prev.map((t, i) => i === idx ? { ...t, fixo_por_transacao: parseFloat(e.target.value) || 0 } : t))} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input className="h-7 text-xs w-48" value={taxa.observacao || ''}
                          onChange={e => setDraft(prev => prev.map((t, i) => i === idx ? { ...t, observacao: e.target.value } : t))}
                          placeholder="Observação opcional" />
                      </td>
                      <td className="py-1.5">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                          onClick={() => setDraft(prev => prev.filter((_, i) => i !== idx))}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs"
              onClick={() => setDraft(prev => [...prev, {
                id: crypto.randomUUID(), produto_slug: '*', forma_pagamento: '*', gateway: '*',
                percentual: 0, fixo_por_transacao: 0, faixa_min: 0, faixa_max: 999999.99, ativo: true, observacao: '',
              }])}>
              <Plus className="h-3 w-3" /> Nova taxa
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-3">Produto</th>
                  <th className="text-left py-2 pr-3">Método</th>
                  <th className="text-left py-2 pr-3">Canal</th>
                  <th className="text-right py-2 pr-3">% Taxa</th>
                  <th className="text-right py-2 pr-3">R$ Fixo</th>
                  <th className="text-left py-2">Observação</th>
                </tr>
              </thead>
              <tbody>
                {taxas.map(taxa => (
                  <tr key={taxa.id} className="border-b border-border/30">
                    <td className="py-1.5 pr-3 font-medium">
                      {taxa.produto_slug === '*' ? 'Todos' : (produtos.find(p => p.slug === taxa.produto_slug)?.nome || taxa.produto_slug)}
                    </td>
                    <td className="py-1.5 pr-3 capitalize">{taxa.forma_pagamento === '*' ? 'Todos' : taxa.forma_pagamento}</td>
                    <td className="py-1.5 pr-3">{taxa.gateway === '*' ? 'Qualquer canal' : taxa.gateway}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{taxa.percentual.toFixed(2)}%</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{taxa.fixo_por_transacao > 0 ? `R$ ${taxa.fixo_por_transacao.toFixed(2)}` : '—'}</td>
                    <td className="py-1.5 text-muted-foreground">{taxa.observacao || '—'}</td>
                  </tr>
                ))}
                {taxas.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Nenhuma taxa. Clique em "Editar taxas" para adicionar.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
