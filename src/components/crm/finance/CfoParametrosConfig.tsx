import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info, Pencil, Save, Settings2, X } from 'lucide-react';
import { toast } from 'sonner';
import { PARAMETROS_CFO_DEFAULT, type ParametrosCfo } from '@/lib/financial-utils';

// Parâmetros manuais usados pelos blocos de DRE Gerencial, Ponto de
// Equilíbrio, CAC/LTV/Payback e Saúde de Caixa da Análise CFO. Não existe
// integração bancária nem fonte automática de impostos/CAC real — cada campo
// aqui é input manual, salvo em balanco_config.parametros_cfo (1 linha, sem
// segmentar por empresa por ora).

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

interface Campo {
  key: keyof ParametrosCfo;
  label: string;
  suffix?: string;
  step?: string;
  fonte: string;
}

const CAMPOS: Campo[] = [
  { key: 'impostos_pct', label: 'Alíquota de impostos sobre receita', suffix: '%', step: '0.1',
    fonte: 'Usado no DRE Gerencial para calcular Receita Líquida = Receita Bruta − Impostos.' },
  { key: 'cac_estimado', label: 'CAC estimado (fallback)', suffix: 'R$', step: '1',
    fonte: 'Usado quando não há gasto de "ads" lançado em Balanço no período — sem isso, CAC/Payback/LTV:CAC não têm base de cálculo.' },
  { key: 'gross_margin_pct', label: 'Margem bruta', suffix: '%', step: '0.1',
    fonte: 'Usada no cálculo de Payback Period: quanto da receita por aluno sobra após custos diretos.' },
  { key: 'saldo_caixa_manual', label: 'Saldo em caixa atual', suffix: 'R$', step: '1',
    fonte: 'Input manual — não há integração bancária. Base para Runway e Reserva de Emergência.' },
  { key: 'reserva_emergencia_meta_meses', label: 'Meta de reserva de emergência', suffix: 'meses', step: '1',
    fonte: 'Quantos meses de custo fixo a reserva ideal deve cobrir.' },
];

interface Props {
  parametros: ParametrosCfo;
  onSaved: (fresh: ParametrosCfo) => void;
  empresaId?: string;
}

export function CfoParametrosConfig({ parametros, onSaved, empresaId = 'onze_digital' }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ParametrosCfo>({ ...PARAMETROS_CFO_DEFAULT, ...parametros });
  const [saving, setSaving] = useState(false);

  const startEditing = () => { setDraft({ ...PARAMETROS_CFO_DEFAULT, ...parametros }); setEditing(true); };
  const cancelEditing = () => { setEditing(false); setDraft({ ...PARAMETROS_CFO_DEFAULT, ...parametros }); };

  async function handleSave() {
    setSaving(true);
    try {
      const payload: ParametrosCfo = { ...draft, saldo_caixa_atualizado_em: new Date().toISOString().slice(0, 10) };
      const { error } = await supabase.from('balanco_config').update({ parametros_cfo: payload as any }).eq('id', empresaId);
      if (error) throw error;
      onSaved(payload);
      setEditing(false);
      toast.success('Parâmetros da Análise CFO salvos!');
    } catch {
      toast.error('Erro ao salvar parâmetros. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const atual = { ...PARAMETROS_CFO_DEFAULT, ...parametros };

  return (
    <Card className="border border-border/60 bg-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings2 size={14} className="text-muted-foreground" />
            Parâmetros da Análise CFO
            <InfoTip text="Impostos, CAC, margem bruta e caixa — inputs manuais usados pelo DRE Gerencial, Ponto de Equilíbrio, CAC/LTV/Payback e Saúde de Caixa. Salvo em balanco_config.parametros_cfo." />
          </CardTitle>
          {!editing ? (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={startEditing}>
              <Pencil className="h-3 w-3" /> Editar parâmetros
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CAMPOS.map(campo => (
            <div key={campo.key} className="space-y-1">
              <label className="text-xs text-muted-foreground flex items-center">
                {campo.label}
                <InfoTip text={campo.fonte} />
              </label>
              {editing ? (
                <div className="relative">
                  <Input
                    type="number" step={campo.step}
                    className="h-8 text-sm pr-14"
                    value={draft[campo.key] as number}
                    onChange={e => setDraft(prev => ({ ...prev, [campo.key]: parseFloat(e.target.value) || 0 }))}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{campo.suffix}</span>
                </div>
              ) : (
                <p className="text-sm font-semibold tabular-nums">
                  {campo.key === 'saldo_caixa_manual' || campo.key === 'cac_estimado'
                    ? `R$ ${Number(atual[campo.key]).toLocaleString('pt-BR')}`
                    : `${atual[campo.key]}${campo.suffix === 'meses' ? ' meses' : campo.suffix === '%' ? '%' : ''}`}
                </p>
              )}
            </div>
          ))}
        </div>
        {atual.saldo_caixa_atualizado_em && (
          <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border/40">
            Saldo de caixa atualizado em {new Date(atual.saldo_caixa_atualizado_em + 'T00:00:00').toLocaleDateString('pt-BR')} — input manual, pode estar desatualizado.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
