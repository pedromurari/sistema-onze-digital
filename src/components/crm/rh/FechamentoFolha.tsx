import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Lock, Loader2, RefreshCw, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { calcularPreviaFolha, type AulaFolha, type PresencaProfessor } from './folha-preview';

type Profissional = {
  id: string; nome: string; modelo_pagamento: string; valor_fixo: number | null;
  valor_por_aula: number | null; comissoes_vendedor: string | null;
};

type Linha = {
  profissional: Profissional;
  aulasConfirmadas: number;
  valorAulas: number;
  valorFixo: number;
  comissoesPendentes: number;
  jaPagoNoMes: number;
  totalSugerido: number;
  requerRevisao: boolean;
};

type Fechamento = { id: string; competencia: string; fechado_em: string; reaberto_em: string | null; total_geral: number };
type ItemSalvo = {
  profissional_id: string; aulas_confirmadas: number; valor_aulas: number; valor_fixo: number;
  comissoes_pendentes: number; ja_pago_no_mes: number; total_sugerido: number; requer_revisao: boolean;
};

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function mesAtualBrasil() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${p.find((x) => x.type === 'year')?.value}-${p.find((x) => x.type === 'month')?.value}`;
}

export function FechamentoFolha() {
  const { user } = useAuth();
  const [mes, setMes] = useState(mesAtualBrasil);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [fechamento, setFechamento] = useState<Fechamento | null>(null);
  const [itensSalvos, setItensSalvos] = useState<ItemSalvo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const fechado = Boolean(fechamento && !fechamento.reaberto_em);

  const carregar = useCallback(async () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return;
    setCarregando(true);
    setErro('');
    try {
      const { data: fechData } = await supabase.from('folha_fechamentos').select('*').eq('competencia', mes).maybeSingle();
      setFechamento(fechData);

      if (fechData) {
        const { data: itens } = await supabase.from('folha_fechamentos_itens').select('*').eq('fechamento_id', fechData.id);
        setItensSalvos((itens ?? []) as ItemSalvo[]);
      } else {
        setItensSalvos([]);
      }

      const { data: profData } = await supabase.from('profissionais')
        .select('id, nome, modelo_pagamento, valor_fixo, valor_por_aula, comissoes_vendedor').eq('ativo', true).order('nome');
      const profissionaisAtivos = (profData ?? []) as Profissional[];
      setProfissionais(profissionaisAtivos);

      const primeiroDia = `${mes}-01`;
      const proximoMes = new Date(`${primeiroDia}T12:00:00Z`);
      proximoMes.setUTCMonth(proximoMes.getUTCMonth() + 1);
      const limite = proximoMes.toISOString().slice(0, 10);

      const { data: aulasData } = await supabase.from('aulas').select('id, profissional_id, data, status').gte('data', primeiroDia).lt('data', limite);
      const aulas = (aulasData ?? []) as AulaFolha[];
      const ids = aulas.map((a) => a.id);
      const { data: presencasData } = ids.length
        ? await supabase.from('presencas').select('aula_id, profissional_id, presente').eq('tipo', 'professor').in('aula_id', ids)
        : { data: [] as PresencaProfessor[] };
      const presencas = (presencasData ?? []) as PresencaProfessor[];

      const { data: pagData } = await supabase.from('profissionais_pagamentos').select('profissional_id, valor').gte('data_pagamento', primeiroDia).lt('data_pagamento', limite);
      const pagoPorProfissional = new Map<string, number>();
      for (const p of pagData ?? []) pagoPorProfissional.set(p.profissional_id, (pagoPorProfissional.get(p.profissional_id) ?? 0) + Number(p.valor));

      const vendedores = profissionaisAtivos.filter((p) => p.comissoes_vendedor).map((p) => p.comissoes_vendedor as string);
      let comissoesPorVendedor = new Map<string, number>();
      if (vendedores.length) {
        const { data: comData } = await supabase.from('comissoes_vendedores').select('vendedor, valor_comissao, status, data_venda')
          .in('vendedor', vendedores).in('status', ['pendente', 'reservado'])
          .gte('data_venda', primeiroDia).lt('data_venda', limite);
        comissoesPorVendedor = new Map();
        for (const c of comData ?? []) comissoesPorVendedor.set(c.vendedor, (comissoesPorVendedor.get(c.vendedor) ?? 0) + Number(c.valor_comissao));
      }

      const previa = calcularPreviaFolha(
        profissionaisAtivos.map((p) => ({ id: p.id, nome: p.nome, modelo_pagamento: p.modelo_pagamento, valor_por_aula: p.valor_por_aula })),
        aulas, presencas,
      );
      const previaPorId = new Map(previa.map((l) => [l.profissional.id, l]));

      const calculadas: Linha[] = profissionaisAtivos.map((prof) => {
        const prevLinha = previaPorId.get(prof.id);
        const aulasConfirmadas = prevLinha?.quantidade ?? 0;
        const valorAulas = prevLinha?.valorAulas ?? 0;
        const temFixo = prof.modelo_pagamento === 'fixo' || prof.modelo_pagamento === 'hibrido';
        const valorFixo = temFixo ? Number(prof.valor_fixo ?? 0) : 0;
        const comissoesPendentes = prof.comissoes_vendedor ? (comissoesPorVendedor.get(prof.comissoes_vendedor) ?? 0) : 0;
        const jaPagoNoMes = pagoPorProfissional.get(prof.id) ?? 0;
        const totalBruto = valorAulas + valorFixo + comissoesPendentes;
        const totalSugerido = Math.max(0, Math.round((totalBruto - jaPagoNoMes) * 100) / 100);
        const requerRevisao = prof.modelo_pagamento === 'comissao' && !prof.comissoes_vendedor;
        return { profissional: prof, aulasConfirmadas, valorAulas, valorFixo, comissoesPendentes, jaPagoNoMes, totalSugerido, requerRevisao };
      }).filter((l) => l.aulasConfirmadas > 0 || l.valorFixo > 0 || l.comissoesPendentes > 0 || l.jaPagoNoMes > 0 || l.requerRevisao);

      setLinhas(calculadas);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível calcular.');
    } finally {
      setCarregando(false);
    }
  }, [mes]);

  useEffect(() => { void carregar(); }, [carregar]);

  const linhasExibidas: Linha[] = fechado
    ? itensSalvos.map((item) => {
      const prof = profissionais.find((p) => p.id === item.profissional_id)
        ?? { id: item.profissional_id, nome: 'Profissional removido', modelo_pagamento: '', valor_fixo: null, valor_por_aula: null, comissoes_vendedor: null };
      return {
        profissional: prof, aulasConfirmadas: item.aulas_confirmadas, valorAulas: item.valor_aulas, valorFixo: item.valor_fixo,
        comissoesPendentes: item.comissoes_pendentes, jaPagoNoMes: item.ja_pago_no_mes, totalSugerido: item.total_sugerido, requerRevisao: item.requer_revisao,
      };
    })
    : linhas;

  const totalGeral = fechado ? Number(fechamento?.total_geral ?? 0) : linhas.reduce((s, l) => s + l.totalSugerido, 0);

  async function fecharCompetencia() {
    if (!user) return;
    setSalvando(true);
    try {
      const { data: fech, error: fechErro } = await supabase.from('folha_fechamentos')
        .upsert({ competencia: mes, fechado_em: new Date().toISOString(), fechado_por: user.id, total_geral: totalGeral, reaberto_em: null }, { onConflict: 'competencia' })
        .select().single();
      if (fechErro || !fech) throw fechErro ?? new Error('Falha ao fechar.');
      await supabase.from('folha_fechamentos_itens').delete().eq('fechamento_id', fech.id);
      if (linhas.length) {
        const { error: itensErro } = await supabase.from('folha_fechamentos_itens').insert(linhas.map((l) => ({
          fechamento_id: fech.id, profissional_id: l.profissional.id, aulas_confirmadas: l.aulasConfirmadas,
          valor_aulas: l.valorAulas, valor_fixo: l.valorFixo, comissoes_pendentes: l.comissoesPendentes,
          ja_pago_no_mes: l.jaPagoNoMes, total_sugerido: l.totalSugerido, requer_revisao: l.requerRevisao,
        })));
        if (itensErro) throw itensErro;
      }
      toast.success('Competência fechada.');
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível fechar.');
    } finally {
      setSalvando(false);
    }
  }

  async function reabrirCompetencia() {
    if (!fechamento) return;
    setSalvando(true);
    const { error } = await supabase.from('folha_fechamentos').update({ reaberto_em: new Date().toISOString() }).eq('id', fechamento.id);
    setSalvando(false);
    if (error) return toast.error('Não foi possível reabrir.');
    toast.success('Competência reaberta.');
    await carregar();
  }

  return (
    <div className="min-h-full bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Fechamento de Folha</h1>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Soma aulas confirmadas × valor por aula, valor fixo e comissões pendentes, deduz o que já foi pago no mês.
            Fechar trava o valor daquele mês para conferência — o pagamento de verdade continua sendo lançado manualmente,
            com comprovante, no histórico de cada profissional.
          </p>
        </header>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-end gap-2">
                <div className="space-y-1"><Label htmlFor="folha-mes">Competência</Label><Input id="folha-mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} disabled={salvando} /></div>
                <Button variant="outline" onClick={() => void carregar()} disabled={carregando || salvando}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
              </div>
              {fechado ? (
                <div className="flex items-center gap-2">
                  <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600"><Lock className="h-3 w-3" /> Fechado em {new Date(fechamento!.fechado_em).toLocaleDateString('pt-BR')}</Badge>
                  <Button variant="outline" size="sm" onClick={() => void reabrirCompetencia()} disabled={salvando}><Unlock className="mr-2 h-3.5 w-3.5" />Reabrir</Button>
                </div>
              ) : (
                <Button onClick={() => void fecharCompetencia()} disabled={salvando || carregando || linhas.length === 0}>
                  {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />} Fechar competência
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {carregando && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Calculando...</p>}
            {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
            {!carregando && !erro && (
              <>
                <p className="text-sm font-medium">Total a pagar: {reais(totalGeral)}</p>
                {linhasExibidas.length === 0 ? <p className="text-sm text-muted-foreground">Nada a pagar nesta competência.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                        <th className="p-2">Profissional</th><th className="p-2">Aulas</th><th className="p-2 text-right">Por aula</th>
                        <th className="p-2 text-right">Fixo</th><th className="p-2 text-right">Comissão</th><th className="p-2 text-right">Já pago</th><th className="p-2 text-right">A pagar</th>
                      </tr></thead>
                      <tbody>
                        {linhasExibidas.map((l) => (
                          <tr key={l.profissional.id} className="border-b last:border-0">
                            <td className="p-2 font-medium">{l.profissional.nome}{l.requerRevisao && <Badge variant="outline" className="ml-2 text-amber-600 border-amber-300">revisar</Badge>}</td>
                            <td className="p-2">{l.aulasConfirmadas || '—'}</td>
                            <td className="p-2 text-right tabular-nums">{l.valorAulas ? reais(l.valorAulas) : '—'}</td>
                            <td className="p-2 text-right tabular-nums">{l.valorFixo ? reais(l.valorFixo) : '—'}</td>
                            <td className="p-2 text-right tabular-nums">{l.comissoesPendentes ? reais(l.comissoesPendentes) : '—'}</td>
                            <td className="p-2 text-right tabular-nums text-muted-foreground">{l.jaPagoNoMes ? reais(l.jaPagoNoMes) : '—'}</td>
                            <td className="p-2 text-right tabular-nums font-semibold">{reais(l.totalSugerido)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  "Revisar" aparece pra quem é comissão sem vendedor vinculado (ex: % de faturamento de turma, calculado fora daqui).
                  Ajuda de custo em parcelas e comissões já pagas entram em "Já pago" e abatem do total.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
