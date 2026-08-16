import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Lead, PipelineStage } from '@/types/crm';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { dbRowToLead } from '@/contexts/LeadsContext';
import { assignTurmaEAtualizarParcelas } from '@/lib/parcelasAluno';
import { MessageCircle, Users, Target, TrendingUp, DollarSign, Copy, ExternalLink } from 'lucide-react';

// -----------------------------------------------------------------------
// Funil — pool de leads independente de "Leads Diretos" (Pipeline.tsx).
// Mesma origem de dados (tabela `leads`), mas filtrado por
// origem='Time Comercial' em vez de origem='Direto'. Reaproveita as cores
// dos 4 primeiros estagios de PIPELINE_STAGES (types/crm.ts) por consistencia
// visual, mas mantem a propria lista de estagios — os dois funis nao
// compartilham estrutura, so paleta.
// -----------------------------------------------------------------------

type TimeComercialStage = 'novo' | 'sdr' | 'closer' | 'matricula';

// Etapas provisórias — o dono do negócio ainda vai renomear/reorganizar isso.
const TIME_COMERCIAL_STAGES: { key: TimeComercialStage; label: string; color: string }[] = [
  { key: 'novo', label: 'Novo', color: 'bg-pipeline-novo' },
  { key: 'sdr', label: 'SDR', color: 'bg-pipeline-sdr' },
  { key: 'closer', label: 'Closer', color: 'bg-pipeline-closer' },
  { key: 'matricula', label: 'Matrícula', color: 'bg-pipeline-matricula' },
];

// Canal de aquisição — campo próprio (`leads.canal`), separado de `origem`
// pra não colidir com origem='Direto' do Leads Diretos (Pipeline.tsx).
const CANAIS_AQUISICAO = ['SDD', 'Direto', 'Webinário', 'Workshop', 'Retorno/Base', 'Orgânico'] as const;
type CanalAquisicao = typeof CANAIS_AQUISICAO[number];

type LeadComCanal = Lead & { canal?: string | null };

const formatCurrency = (value?: number) => {
  if (!value) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const openWhatsApp = (phone: string) => window.open(`https://wa.me/55${phone.replace(/\D/g, '')}`, '_blank');

interface VendorScopeProps { viewAsName: string | null; }

function FunilTimeComercial({ viewAsName }: VendorScopeProps) {
  const { users, getUserById } = useAuth();
  const [leads, setLeads] = useState<LeadComCanal[]>([]);
  const [canalAtivo, setCanalAtivo] = useState<CanalAquisicao | 'todos'>('todos');

  const fetchLeads = async () => {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('origem', 'Time Comercial')
      .order('criado_em', { ascending: false });

    if (error) {
      console.error('Erro ao carregar leads do Time Comercial:', error);
      toast({
        variant: 'destructive',
        title: 'Não foi possível carregar os leads',
        description: error.message,
      });
      return;
    }

    if (data) {
      setLeads(data.map((row: any) => ({ ...dbRowToLead(row), canal: row.canal })));
    }
  };

  useEffect(() => {
    fetchLeads();
    const channel = supabase
      .channel('time-comercial-leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `origem=eq.Time Comercial` }, () => {
        fetchLeads();
      })
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, []);

  // Quando um vendedor especifico esta "logado" (viewAsName), so mostra os
  // leads dele. Sem contas reais ainda, isso compara pelo nome do responsavel
  // resolvido via getUserById — funciona assim que Helen/Miguel/Aline
  // virarem usuarios reais com leads atribuidos.
  const getLeadsByStage = (stage: TimeComercialStage) => leads.filter((lead) => {
    if (lead.etapa !== stage) return false;
    if (canalAtivo !== 'todos' && lead.canal !== canalAtivo) return false;
    if (!viewAsName) return true;
    return getUserById(lead.responsavelId)?.nome === viewAsName;
  });

  const contagemPorCanal = (canal: CanalAquisicao) => leads.filter((l) => {
    if (l.canal !== canal) return false;
    if (!viewAsName) return true;
    return getUserById(l.responsavelId)?.nome === viewAsName;
  }).length;

  const handleStageChange = async (lead: Lead, newStage: TimeComercialStage) => {
    try {
      await supabase.from('leads').update({ etapa: newStage }).eq('id', lead.id);
      fetchLeads();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Não foi possível alterar a etapa', description: error?.message || 'Tente novamente.' });
    }
  };

  const totalLeads = TIME_COMERCIAL_STAGES.reduce((soma, s) => soma + getLeadsByStage(s.key).length, 0);
  const leadsEmMatricula = getLeadsByStage('matricula').length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5 flex-wrap bg-muted rounded-lg p-1 w-fit">
        <button
          type="button"
          onClick={() => setCanalAtivo('todos')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${canalAtivo === 'todos' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Todos os canais
        </button>
        {CANAIS_AQUISICAO.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCanalAtivo(c)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${canalAtivo === c ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {c} <span className="text-muted-foreground/70">({contagemPorCanal(c)})</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <div className="p-3 lg:p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs lg:text-sm text-muted-foreground font-medium">Total de Leads</span>
              <Users className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl lg:text-3xl font-bold text-foreground">{totalLeads}</p>
            <p className="text-xs text-muted-foreground">Em {TIME_COMERCIAL_STAGES.length} estágios</p>
          </div>
        </Card>
        <Card className="overflow-hidden bg-gradient-to-br from-success/10 to-success/5 border-success/20">
          <div className="p-3 lg:p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs lg:text-sm text-muted-foreground font-medium">Em Matrícula</span>
              <TrendingUp className="h-4 w-4 text-success" />
            </div>
            <p className="text-2xl lg:text-3xl font-bold text-foreground">{leadsEmMatricula}</p>
            <p className="text-xs text-muted-foreground">
              {totalLeads > 0 ? `${((leadsEmMatricula / totalLeads) * 100).toFixed(1)}% do total` : 'Nenhum lead ainda'}
            </p>
          </div>
        </Card>
      </div>

      <div className="flex-1 flex gap-3 lg:gap-4 overflow-x-auto pb-4 snap-x snap-mandatory lg:snap-none min-h-0">
        {TIME_COMERCIAL_STAGES.map((stage) => {
          const stageLeads = getLeadsByStage(stage.key);
          return (
            <div key={stage.key} className="flex-shrink-0 w-[85vw] sm:w-72 lg:w-80 snap-center lg:snap-align-none">
              <div className={`rounded-t-lg p-2.5 lg:p-3 ${stage.color}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-primary-foreground text-sm lg:text-base">{stage.label}</span>
                  <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground border-0 text-xs">{stageLeads.length}</Badge>
                </div>
              </div>
              <div className="bg-muted/50 rounded-b-lg p-2 lg:p-3 space-y-2 lg:space-y-3 min-h-[50vh] lg:min-h-96 max-h-[calc(100vh-20rem)] overflow-y-auto">
                {stageLeads.map((lead) => {
                  const responsavel = getUserById(lead.responsavelId);
                  return (
                    <Card key={lead.id} className="p-3 lg:p-4 bg-card border-border hover:shadow-md transition-shadow">
                      <div className="mb-2">
                        <h3 className="font-semibold text-foreground text-sm lg:text-base truncate">{lead.nome}</h3>
                        {lead.telefone && <p className="text-xs text-muted-foreground truncate">{lead.telefone}</p>}
                        {lead.canal && <Badge variant="secondary" className="text-[10px] mt-1">{lead.canal}</Badge>}
                      </div>
                      <div className="flex gap-2 mb-2 lg:mb-3">
                        <button
                          type="button"
                          onClick={() => openWhatsApp(lead.telefone)}
                          className="flex-1 h-8 text-xs inline-flex items-center justify-center gap-1 rounded-md border border-border bg-card hover:bg-muted transition-colors"
                        >
                          <MessageCircle className="h-3 w-3 text-success" /> WhatsApp
                        </button>
                      </div>
                      {responsavel && (
                        <div className="mb-2 lg:mb-3">
                          <Badge className="text-xs text-primary-foreground" style={{ backgroundColor: responsavel.cor }}>{responsavel.nome.split(' ')[0]}</Badge>
                        </div>
                      )}
                      <Select value={lead.etapa} onValueChange={(value) => handleStageChange(lead, value as TimeComercialStage)}>
                        <SelectTrigger className="w-full h-8 text-xs bg-card"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-card border-border z-[100]" position="popper" sideOffset={4}>
                          {TIME_COMERCIAL_STAGES.map((s) => (
                            <SelectItem key={s.key} value={s.key} className="text-xs cursor-pointer">
                              <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${s.color}`} />{s.label}</div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Card>
                  );
                })}
                {stageLeads.length === 0 && <div className="text-center py-6 lg:py-8 text-muted-foreground text-xs lg:text-sm">Nenhum lead nesta etapa</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Metas 2026 — equipe nova (Helen, Miguel, Aline). Sem historico do sistema,
// so a equipe comercial de agora em diante. Numeros e formula portados do
// protótipo (painel-despertamente.html) calibrado com o dono do negocio.
// -----------------------------------------------------------------------

const fmt = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR');

const FAT_POR_VENDA_MIX = 0.3 * 1485 + 0.7 * 150; // 550,5 — mesmo mix da calculadora de remuneração

const METAS_MESES: { mes: string; vendas: number }[] = [
  { mes: 'Set/26', vendas: 90 },  // Meta Base da equipe completa
  { mes: 'Out/26', vendas: 100 },
  { mes: 'Nov/26', vendas: 115 },
  { mes: 'Dez/26', vendas: 130 },
];

function MetasTab({ viewAsName }: VendorScopeProps) {
  const maxVendas = Math.max(...METAS_MESES.map((x) => x.vendas));
  const vendasTotal = METAS_MESES.reduce((s, x) => s + x.vendas, 0);
  const faturamentoTotal = METAS_MESES.reduce((s, x) => s + x.vendas * FAT_POR_VENDA_MIX, 0);

  // Vendedor(a) comum ve so a fatia dela do plano (meta dividida por 3);
  // "Todos"/gerente continuam vendo a meta agregada da equipe.
  if (viewAsName) {
    const mesesIndividual = METAS_MESES.map((x) => ({ mes: x.mes, vendas: Math.round(x.vendas / 3) }));
    const maxIndividual = Math.max(...mesesIndividual.map((x) => x.vendas));
    const vendasTotalIndividual = mesesIndividual.reduce((s, x) => s + x.vendas, 0);
    const faturamentoTotalIndividual = mesesIndividual.reduce((s, x) => s + x.vendas * FAT_POR_VENDA_MIX, 0);

    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Sua Meta Base</p>
            <p className="text-2xl font-bold text-foreground mt-1">30 <span className="text-sm font-normal text-muted-foreground">vendas/mês</span></p>
            <p className="text-xs text-muted-foreground mt-1">{viewAsName}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Seu faturamento na Meta Base</p>
            <p className="text-2xl font-bold text-foreground mt-1">~R$ 16.515<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
            <p className="text-xs text-muted-foreground mt-1">mix 30% à vista/cartão + 70% recorrente</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Meses restantes em 2026</p>
            <p className="text-2xl font-bold text-foreground mt-1">Set–Dez</p>
            <p className="text-xs text-muted-foreground mt-1">4 meses de ramp-up</p>
          </Card>
        </div>

        <Card className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Suas vendas</TableHead>
                <TableHead className="text-right">Seu faturamento estimado</TableHead>
                <TableHead className="w-[35%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mesesIndividual.map((x) => {
                const faturamento = x.vendas * FAT_POR_VENDA_MIX;
                const pct = (x.vendas / maxIndividual) * 100;
                return (
                  <TableRow key={x.mes}>
                    <TableCell>{x.mes}</TableCell>
                    <TableCell className="text-right">{x.vendas}</TableCell>
                    <TableCell className="text-right">{fmt(faturamento)}</TableCell>
                    <TableCell>
                      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Total Set–Dez/2026</TableCell>
                <TableCell className="text-right font-semibold">{vendasTotalIndividual}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(faturamentoTotalIndividual)}</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2 mt-3">
            Sua fatia é a meta da equipe dividida por 3 — não é uma meta individual formal ainda. Setembro parte da Meta Base (30 vendas).
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Meta Base da equipe</p>
          <p className="text-2xl font-bold text-foreground mt-1">90 <span className="text-sm font-normal text-muted-foreground">vendas/mês</span></p>
          <p className="text-xs text-muted-foreground mt-1">30 × 3 vendedores</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Faturamento na Meta Base</p>
          <p className="text-2xl font-bold text-foreground mt-1">~R$ 49.545<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
          <p className="text-xs text-muted-foreground mt-1">mix 30% à vista/cartão + 70% recorrente</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Meses restantes em 2026</p>
          <p className="text-2xl font-bold text-foreground mt-1">Set–Dez</p>
          <p className="text-xs text-muted-foreground mt-1">4 meses de ramp-up com a equipe nova</p>
        </Card>
      </div>

      <Card className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              <TableHead className="text-right">Vendas (equipe)</TableHead>
              <TableHead className="text-right">Faturamento estimado</TableHead>
              <TableHead className="w-[35%]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {METAS_MESES.map((x) => {
              const faturamento = x.vendas * FAT_POR_VENDA_MIX;
              const pct = (x.vendas / maxVendas) * 100;
              return (
                <TableRow key={x.mes}>
                  <TableCell>{x.mes}</TableCell>
                  <TableCell className="text-right">{x.vendas}</TableCell>
                  <TableCell className="text-right">{fmt(faturamento)}</TableCell>
                  <TableCell>
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Total Set–Dez/2026</TableCell>
              <TableCell className="text-right font-semibold">{vendasTotal}</TableCell>
              <TableCell className="text-right font-semibold">{fmt(faturamentoTotal)}</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableFooter>
        </Table>
        <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2 mt-3">
          Setembro parte da Meta Base (90 vendas). Depois disso é um ramp-up ilustrativo — ajuste assim que tiver o primeiro mês fechado com a equipe nova.
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Mix de pagamento alvo</h3>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>À vista / Cartão até 12x</TableCell>
                <TableCell className="text-right">30%</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Recorrente (cartão/boleto 15x)</TableCell>
                <TableCell className="text-right">70%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">Como a meta cresce</h3>
          <p className="text-sm text-muted-foreground">
            Setembro é o primeiro mês com a equipe completa, por isso começa na Meta Base. Outubro a dezembro sobem gradualmente conforme a curva de aprendizado avança.
          </p>
        </Card>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Aquisição — Semana do Despertar (unico canal definido ate agora). Conteudo
// e datas portados do protótipo; notas internas/premissas marcadas como
// "admin-only" no HTML de origem foram deliberadamente omitidas aqui.
// -----------------------------------------------------------------------

const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const fmtData = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

const TURMA_45_AULA1 = new Date(2026, 8, 1); // 01/set/2026
const FIM_DO_ANO = new Date(2026, 11, 19); // corta antes da semana de Natal

const SDD_CICLO = [
  { fase: 'Captação', quando: `${fmtData(addDays(TURMA_45_AULA1, -18))} – ${fmtData(addDays(TURMA_45_AULA1, -8))}`, desc: 'Landing page no ar, inscrições abertas, anúncios/orgânico rodando para captar leads.' },
  { fase: 'Aquecimento', quando: `${fmtData(addDays(TURMA_45_AULA1, -7))} – ${fmtData(addDays(TURMA_45_AULA1, -1))}`, desc: 'Lembretes para quem já se inscreveu, contagem regressiva, sem captação de leads novos.' },
  { fase: 'Semana ao vivo', quando: `${fmtData(TURMA_45_AULA1)} – ${fmtData(addDays(TURMA_45_AULA1, 2))}`, desc: 'Aula 1 (ter) → Aula 2 (qua, pitch + carrinho abre) → Aula 3 (qui, carrinho fecha).' },
  { fase: 'Pós-lançamento', quando: `${fmtData(addDays(TURMA_45_AULA1, 3))} – ${fmtData(addDays(TURMA_45_AULA1, 6))}`, desc: 'Remarketing/contato com leads que assistiram mas não compraram.' },
];

function buildSddTurmas() {
  const turmas: { n: number; aula1: Date; real: boolean }[] = [{ n: 45, aula1: TURMA_45_AULA1, real: true }];
  let n = 46;
  let next = addDays(TURMA_45_AULA1, 14);
  while (next <= FIM_DO_ANO) {
    turmas.push({ n, aula1: next, real: false });
    n++;
    next = addDays(next, 14);
  }
  return turmas;
}

const SDD_TURMAS = buildSddTurmas();

function AquisicaoTab() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Formato</p>
          <p className="text-2xl font-bold text-foreground mt-1">3 aulas</p>
          <p className="text-xs text-muted-foreground mt-1">ao vivo, YouTube, Ter/Qua/Qui às 20h</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Próxima turma</p>
          <p className="text-2xl font-bold text-foreground mt-1">#45</p>
          <p className="text-xs text-muted-foreground mt-1">01–03/set/2026</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Cadência</p>
          <p className="text-2xl font-bold text-foreground mt-1">Quinzenal</p>
          <p className="text-xs text-muted-foreground mt-1">semana sim, semana não — até dez/2026</p>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">As 3 aulas</h3>
        <div className="flex flex-col gap-2">
          {[
            { idx: 1, titulo: 'Aula 01 — "O Despertar" · terça, 20h', desc: 'Teoria do Aparelho, Teoria Estrutural, Portas para o Inconsciente. Só conteúdo — sem oferta.', pill: 'Captação', color: 'bg-primary/10 text-primary' },
            { idx: 2, titulo: 'Aula 02 — "A Cura" · quarta, 20h', desc: 'Heranças traumáticas, narcisismo, autoestima. Pitch da formação PSI acontece aqui — carrinho abre ao final da aula.', pill: 'Pitch + carrinho abre', color: 'bg-warning/10 text-warning' },
            { idx: 3, titulo: 'Aula 03 — "A Revelação" · quinta, 20h', desc: 'Pulsão de morte, estresse, atos suicidas. Reforço da oferta e última chamada — carrinho fecha na sequência.', pill: 'Fechamento de carrinho', color: 'bg-destructive/10 text-destructive' },
          ].map((step) => (
            <div key={step.idx} className="grid grid-cols-[34px_1fr_auto] items-center gap-3 bg-card border border-border rounded-lg p-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">{step.idx}</div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">{step.titulo}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
              </div>
              <Badge className={`text-xs border-0 ${step.color}`}>{step.pill}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Ciclo operacional de cada turma</h3>
        <div className="flex flex-col divide-y divide-border">
          {SDD_CICLO.map((row) => (
            <div key={row.fase} className="grid grid-cols-[110px_1fr] gap-3 py-3 first:pt-0">
              <div className="text-sm font-semibold text-primary">{row.fase}</div>
              <div className="bg-muted/50 border border-border rounded-md px-3 py-2 text-xs">
                <p className="font-semibold text-foreground">{row.quando}</p>
                <p className="text-muted-foreground mt-0.5">{row.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Calendário 2026 — quinzenal (semana sim, semana não)</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Turma</TableHead>
              <TableHead>Aula 1 (ter)</TableHead>
              <TableHead>Aula 2 (qua) — pitch</TableHead>
              <TableHead>Aula 3 (qui) — fecha</TableHead>
              <TableHead>Captação abre</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SDD_TURMAS.map((t) => {
              const aula2 = addDays(t.aula1, 1);
              const aula3 = addDays(t.aula1, 2);
              const captacao = addDays(t.aula1, -18);
              return (
                <TableRow key={t.n}>
                  <TableCell>
                    <Badge className={`text-xs border-0 ${t.real ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}>
                      #{t.n} {t.real ? 'confirmada' : 'projetada'}
                    </Badge>
                  </TableCell>
                  <TableCell>{fmtData(t.aula1)}</TableCell>
                  <TableCell>{fmtData(aula2)}</TableCell>
                  <TableCell>{fmtData(aula3)}</TableCell>
                  <TableCell>{fmtData(captacao)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2 mt-3">
          #45 (01–03/set) é a próxima confirmada. A partir dela, o calendário segue à risca o ritmo quinzenal (semana sim, semana não) até a última turma de 2026.
        </p>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------
// Operação — infos práticas do dia a dia da próxima turma: datas e os links
// de matrícula individuais (um por vendedor, gerados pelo Igor) pra trackear
// quem matriculou quem. Atribuição Helen/Miguel/Aline é a ordem em que os
// links chegaram — confirmar se é essa mesma ordem.
// -----------------------------------------------------------------------

interface OperacaoLink { label: string; url: string; vendedor: string; }

interface TurmaFormacao { turma: string; dataLabel: string; mesAbrev: string; dia: number | null; confirmada: boolean; }

// Datas reais confirmadas com o Pedro; turmas sem data no cadastro do
// sistema (turmas table) entram aqui como "a definir" até serem fechadas.
const TURMAS_FORMACAO: TurmaFormacao[] = [
  { turma: '02726/OnzeDS', dataLabel: '01/09/2026', mesAbrev: 'Set', dia: 1, confirmada: true },
];

const LINKS_MATRICULA: OperacaoLink[] = [
  { label: 'Ficha de Matrícula — Helen Magna', url: 'https://www.idmpsi.com.br/matricula.html?v=6be52633', vendedor: 'Helen Magna' },
  { label: 'Ficha de Matrícula — Miguel Fogaça', url: 'https://www.idmpsi.com.br/matricula.html?v=d95ebfdc', vendedor: 'Miguel Fogaça' },
  { label: 'Ficha de Matrícula — Aline Horta', url: 'https://www.idmpsi.com.br/matricula.html?v=1b8a0e29', vendedor: 'Aline Horta' },
];

function copyLink(url: string) {
  navigator.clipboard.writeText(url)
    .then(() => toast({ title: 'Link copiado', description: url }))
    .catch(() => toast({ variant: 'destructive', title: 'Não foi possível copiar', description: 'Copie manualmente o link.' }));
}

function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-border rounded-md px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{url}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button type="button" onClick={() => copyLink(url)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors" title="Copiar link">
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors" title="Abrir link">
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </a>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// "Alunos aguardando turma" — alunos que entraram (ex: ficha de matrícula
// externa em idmpsi.com.br) com turma_id nulo. Como a ficha externa ainda
// nao manda o vendedor junto, o vendedor "reivindica" o aluno aqui (grava
// alunos.vendedor_id) e, dono agora, atribui a turma direto nesta tela —
// sem precisar de acesso a Financeiro.tsx. vendedor_id ainda nao esta nos
// tipos gerados do Supabase (migration aplicada localmente, pendente no
// banco) — por isso os `as any` ao ler/gravar essa coluna.
// -----------------------------------------------------------------------

interface AlunoAguardandoTurma {
  id: string;
  nome: string;
  whatsapp?: string | null;
  produto: string;
  forma_pagamento?: string | null;
  valor_mensalidade?: number | null;
  dia_vencimento?: number | null;
  dia_vencimento_contrato?: string | null;
  tipo_pagamento?: string | null;
  total_mensalidades?: number | null;
  data_matricula?: string | null;
  vendedor_id?: string | null;
}

interface TurmaOption {
  id: string;
  nome: string;
}

function AlunosAguardandoTurmaCard({ viewAsName }: VendorScopeProps) {
  const [alunosSemTurma, setAlunosSemTurma] = useState<AlunoAguardandoTurma[]>([]);
  const [turmasOptions, setTurmasOptions] = useState<TurmaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<Record<string, boolean>>({});
  const [assigning, setAssigning] = useState<Record<string, boolean>>({});

  const fetchData = async () => {
    setLoading(true);
    const [alunosRes, turmasRes] = await Promise.all([
      (supabase.from('alunos') as any)
        .select('id, nome, whatsapp, produto, forma_pagamento, valor_mensalidade, dia_vencimento, dia_vencimento_contrato, tipo_pagamento, total_mensalidades, data_matricula, vendedor_id')
        .is('turma_id', null)
        .eq('produto', 'psicanalise')
        .order('data_matricula', { ascending: false }),
      supabase
        .from('turmas')
        .select('id, nome')
        .or('produto.eq.psicanalise,tipo.eq.psicanalise')
        .order('created_at', { ascending: false }),
    ]);

    if (alunosRes.error) {
      toast({ variant: 'destructive', title: 'Não foi possível carregar alunos sem turma', description: alunosRes.error.message });
    } else {
      setAlunosSemTurma((alunosRes.data || []) as AlunoAguardandoTurma[]);
    }
    if (turmasRes.data) setTurmasOptions(turmasRes.data as TurmaOption[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Vendedor comum: so os proprios (ja reivindicados) + os ainda sem dono.
  // Admin/gerente (viewAsName null): todos, de qualquer vendedor.
  const visibleAlunos = viewAsName
    ? alunosSemTurma.filter((a) => a.vendedor_id === viewAsName || !a.vendedor_id)
    : alunosSemTurma;

  const claimAluno = async (alunoId: string) => {
    if (!viewAsName) return;
    setClaiming((prev) => ({ ...prev, [alunoId]: true }));
    const { error } = await (supabase.from('alunos') as any).update({ vendedor_id: viewAsName }).eq('id', alunoId);
    setClaiming((prev) => ({ ...prev, [alunoId]: false }));
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao marcar aluno', description: error.message });
      return;
    }
    setAlunosSemTurma((prev) => prev.map((a) => (a.id === alunoId ? { ...a, vendedor_id: viewAsName } : a)));
    toast({ title: 'Aluno marcado como seu!' });
  };

  const assignTurma = async (aluno: AlunoAguardandoTurma, turmaId: string) => {
    setAssigning((prev) => ({ ...prev, [aluno.id]: true }));
    try {
      await assignTurmaEAtualizarParcelas(aluno.id, turmaId, aluno);
      setAlunosSemTurma((prev) => prev.filter((a) => a.id !== aluno.id));
      toast({ title: 'Turma atribuída!' });
    } catch (error: any) {
      setAssigning((prev) => ({ ...prev, [aluno.id]: false }));
      toast({ variant: 'destructive', title: 'Erro ao atribuir turma', description: error?.message });
      return;
    }
    setAssigning((prev) => ({ ...prev, [aluno.id]: false }));
  };

  const TurmaSelect = ({ aluno }: { aluno: AlunoAguardandoTurma }) => (
    <Select value="" onValueChange={(v) => assignTurma(aluno, v)} disabled={!!assigning[aluno.id]}>
      <SelectTrigger className="h-7 text-xs w-40 border-amber-300 text-amber-700 bg-amber-50">
        <SelectValue placeholder={assigning[aluno.id] ? 'Salvando...' : 'Atribuir turma'} />
      </SelectTrigger>
      <SelectContent>
        {turmasOptions.map((t) => (
          <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="text-sm font-semibold text-foreground">Alunos aguardando turma</h3>
        <Badge className="text-xs border-0 bg-muted text-muted-foreground">
          {visibleAlunos.length} {visibleAlunos.length === 1 ? 'aluno' : 'alunos'}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Matrículas que caíram sem turma (ex: ficha externa do site){' '}
        {viewAsName
          ? '— reivindique as suas e atribua a turma direto aqui, sem precisar do Financeiro.'
          : '— visão de admin: todos os alunos aguardando, de qualquer vendedor.'}
      </p>

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : visibleAlunos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum aluno aguardando turma.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {visibleAlunos.map((aluno) => {
            const isUnclaimed = !aluno.vendedor_id;
            return (
              <div key={aluno.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{aluno.nome}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs text-muted-foreground">{aluno.whatsapp || 'sem whatsapp'}</p>
                    {(!viewAsName || isUnclaimed) && (
                      <Badge className={`text-xs border-0 ${aluno.vendedor_id ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}>
                        {aluno.vendedor_id || 'Sem vendedor'}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {viewAsName && isUnclaimed ? (
                    <Button size="sm" className="h-7 text-xs" disabled={!!claiming[aluno.id]} onClick={() => claimAluno(aluno.id)}>
                      {claiming[aluno.id] ? 'Salvando...' : 'Marcar como meu'}
                    </Button>
                  ) : (
                    <TurmaSelect aluno={aluno} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function OperacaoTab({ viewAsName }: VendorScopeProps) {
  const matriculaLinks = viewAsName ? LINKS_MATRICULA.filter((l) => l.vendedor === viewAsName) : LINKS_MATRICULA;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Próxima turma (formação)</p>
          <p className="text-2xl font-bold text-foreground mt-1">02726</p>
          <p className="text-xs text-muted-foreground mt-1">Turma #02726/OnzeDS · PSI</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Data de início</p>
          <p className="text-2xl font-bold text-foreground mt-1">01/09/2026</p>
          <p className="text-xs text-muted-foreground mt-1">ainda não refletido no cadastro do sistema</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Matrículas desta turma</p>
          <p className="text-2xl font-bold text-foreground mt-1">Via links abaixo</p>
          <p className="text-xs text-muted-foreground mt-1">é pra onde as fichas de matrícula apontam</p>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">
        Essa é a turma de formação (a classe de verdade) — diferente da turma #45 da Semana do Despertar, que é só o lançamento/captação (ver aba Aquisição).
      </p>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-1">Ficha de Matrícula — por vendedor</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Link trackeado individual (gerado pelo Igor) — cada vendedor usa só o próprio, pra matrícula ficar atribuída certinho.
        </p>
        <div className="flex flex-col gap-2">
          {matriculaLinks.map((l) => (
            <LinkRow key={l.url} label={l.label} url={l.url} />
          ))}
        </div>
        {!viewAsName && (
          <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2 mt-3">
            Atribuição por ordem de chegada dos links (Helen → Miguel → Aline) — confirma com o Igor se é essa mesma ordem antes de divulgar.
          </p>
        )}
      </Card>

      <AlunosAguardandoTurmaCard viewAsName={viewAsName} />

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Outros links da turma</h3>
        <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2">
          Landing page da Semana do Despertar, link de pagamento/checkout, grupo de WhatsApp — ainda não informados. Entram aqui assim que chegarem.
        </p>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-1">Calendário de início das turmas — Formação PSI</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Pra vocês saberem a data de início de cada turma nova, sem precisar perguntar.
        </p>
        <div className="flex flex-col divide-y divide-border">
          {TURMAS_FORMACAO.map((t) => (
            <div key={t.turma} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-md border border-border bg-muted flex flex-col items-center justify-center flex-shrink-0">
                  <span className="text-[9px] uppercase font-semibold text-muted-foreground leading-none">{t.mesAbrev}</span>
                  <span className="text-sm font-bold text-foreground leading-tight">{t.dia ?? '—'}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Turma {t.turma}</p>
                  <p className="text-xs text-muted-foreground">{t.dataLabel}</p>
                </div>
              </div>
              <Badge className={`text-xs border-0 ${t.confirmada ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                {t.confirmada ? 'confirmada' : 'a definir'}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------
// Remuneração — calculadora de comissão PJ. Puramente client-side por
// enquanto (numeros e formulas do protótipo) — decisao de produto: portar
// primeiro, conectar ao Supabase depois.
// -----------------------------------------------------------------------

const COM_VISTA_CARTAO = 147;
const COM_RECORRENTE = 75;
const FAT_VISTA_CARTAO = 1485;
const FAT_RECORRENTE = 150;
const AJUDA_CUSTO = 1500;
const META_MOTIVO_FAT = 25000;
const BONUS_MOTIVO = 1000;
const META_SUPERACAO_FAT = 35000;
const BONUS_SUPERACAO = 2000;

interface VendorRow {
  name: string;
  role: string;
  gerente: boolean;
  initials: string;
  meta: number;
  vistaCartao: number;
  boleto: number;
}

const INITIAL_VENDORS: VendorRow[] = [
  { name: 'Helen Magna', role: 'Vendedora', gerente: false, initials: 'HM', meta: 30, vistaCartao: 9, boleto: 21 },
  { name: 'Miguel Fogaça', role: 'Vendedor', gerente: false, initials: 'MF', meta: 30, vistaCartao: 15, boleto: 35 },
  { name: 'Aline Horta', role: 'Vendedora/Gerente de Vendas', gerente: true, initials: 'AH', meta: 30, vistaCartao: 21, boleto: 49 },
];

function calcVendor(vistaCartao: number, boleto: number) {
  const total = vistaCartao + boleto;
  const faturamento = vistaCartao * FAT_VISTA_CARTAO + boleto * FAT_RECORRENTE;
  const comissao = vistaCartao * COM_VISTA_CARTAO + boleto * COM_RECORRENTE;
  const bonus = faturamento >= META_SUPERACAO_FAT ? BONUS_SUPERACAO : faturamento >= META_MOTIVO_FAT ? BONUS_MOTIVO : 0;
  const receber = AJUDA_CUSTO + comissao + bonus;
  return { total, faturamento, comissao, bonus, receber };
}

function BonusPill({ bonus }: { bonus: number }) {
  if (bonus >= BONUS_SUPERACAO) return <Badge className="text-xs border-0 bg-success/15 text-success">Superação</Badge>;
  if (bonus >= BONUS_MOTIVO) return <Badge className="text-xs border-0 bg-warning/15 text-warning">Motivo</Badge>;
  return <Badge className="text-xs border-0 bg-muted text-muted-foreground">Base</Badge>;
}

const TIERS: { label: string; badgeClass: string; vistaCartao: number; boleto: number }[] = [
  { label: 'Meta Base', badgeClass: 'bg-primary/10 text-primary', vistaCartao: 9, boleto: 21 },
  { label: 'Meta Motivo', badgeClass: 'bg-warning/10 text-warning', vistaCartao: 15, boleto: 35 },
  { label: 'Meta Superação', badgeClass: 'bg-success/10 text-success', vistaCartao: 21, boleto: 49 },
];

function RemuneracaoTab({ viewAsName }: VendorScopeProps) {
  const [vendors, setVendors] = useState<VendorRow[]>(INITIAL_VENDORS);

  const updateVendor = (idx: number, field: 'meta' | 'vistaCartao' | 'boleto', value: number) => {
    setVendors((prev) => prev.map((v, i) => (i === idx ? { ...v, [field]: Math.max(0, value || 0) } : v)));
  };

  // Gerente (Aline) sempre ve todo mundo; vendedor(a) comum ve so a propria linha.
  const activeVendor = vendors.find((v) => v.name === viewAsName);
  const scoped = viewAsName && activeVendor && !activeVendor.gerente
    ? vendors.filter((v) => v.name === viewAsName)
    : vendors;

  const rows = scoped.map((v) => ({ v, calc: calcVendor(v.vistaCartao, v.boleto) }));
  const showTeamFooter = scoped.length > 1;
  const totals = rows.reduce(
    (acc, r) => ({
      meta: acc.meta + r.v.meta,
      vistaCartao: acc.vistaCartao + r.v.vistaCartao,
      boleto: acc.boleto + r.v.boleto,
      total: acc.total + r.calc.total,
      fat: acc.fat + r.calc.faturamento,
      comissao: acc.comissao + r.calc.comissao,
      bonus: acc.bonus + r.calc.bonus,
      receber: acc.receber + r.calc.receber,
    }),
    { meta: 0, vistaCartao: 0, boleto: 0, total: 0, fat: 0, comissao: 0, bonus: 0, receber: 0 },
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Ajuda de custo</p>
          <p className="text-2xl font-bold text-foreground mt-1">R$ 1.500<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">À vista / Cartão até 12x</p>
          <p className="text-2xl font-bold text-foreground mt-1">R$ 147</p>
          <p className="text-xs text-muted-foreground mt-1">10% de comissão (à vista R$1.500 ou cartão 12x, caixa R$1.470)</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Recorrente (cartão/boleto 15x R$150)</p>
          <p className="text-2xl font-bold text-foreground mt-1">R$ 75</p>
          <p className="text-xs text-muted-foreground mt-1">50% da 1ª parcela apenas</p>
        </Card>
      </div>

      <Card className="p-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendedor</TableHead>
              <TableHead className="text-right">Meta Base (vendas)</TableHead>
              <TableHead className="text-right">Vendas à vista/cartão</TableHead>
              <TableHead className="text-right">Vendas recorrentes</TableHead>
              <TableHead className="text-right">Total vendido</TableHead>
              <TableHead className="text-right">Faturamento</TableHead>
              <TableHead className="text-right">Comissão</TableHead>
              <TableHead>Bonificação</TableHead>
              <TableHead className="text-right">A receber</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ v, calc }, idx) => (
              <TableRow key={v.name}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center font-bold text-xs flex-shrink-0">{v.initials}</div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{v.name}</div>
                      <div className="text-xs text-muted-foreground">{v.role}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Input type="number" min={0} step={1} value={v.meta} onChange={(e) => updateVendor(idx, 'meta', Number(e.target.value))} className="h-8 w-20 text-xs text-right ml-auto" />
                </TableCell>
                <TableCell className="text-right">
                  <Input type="number" min={0} step={1} value={v.vistaCartao} onChange={(e) => updateVendor(idx, 'vistaCartao', Number(e.target.value))} className="h-8 w-20 text-xs text-right ml-auto" />
                </TableCell>
                <TableCell className="text-right">
                  <Input type="number" min={0} step={1} value={v.boleto} onChange={(e) => updateVendor(idx, 'boleto', Number(e.target.value))} className="h-8 w-20 text-xs text-right ml-auto" />
                </TableCell>
                <TableCell className="text-right">{calc.total}</TableCell>
                <TableCell className="text-right">{fmt(calc.faturamento)}</TableCell>
                <TableCell className="text-right">{fmt(calc.comissao)}</TableCell>
                <TableCell>{calc.bonus ? <span className="inline-flex items-center gap-1"><BonusPill bonus={calc.bonus} /> {fmt(calc.bonus)}</span> : <BonusPill bonus={calc.bonus} />}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(calc.receber)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          {showTeamFooter && (
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Soma dos 3 (não é meta de equipe)</TableCell>
                <TableCell className="text-right font-semibold">{totals.meta}</TableCell>
                <TableCell className="text-right font-semibold">{totals.vistaCartao}</TableCell>
                <TableCell className="text-right font-semibold">{totals.boleto}</TableCell>
                <TableCell className="text-right font-semibold">{totals.total}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(totals.fat)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(totals.comissao)}</TableCell>
                <TableCell className="font-semibold">{fmt(totals.bonus)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(totals.receber)}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
        <div className="flex flex-col gap-2 mt-3">
          <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2">
            {viewAsName
              ? `Sua Meta Base = 30 vendas/mês, sem bonificação — só a comissão por venda. Faturamento estimado como: à vista/cartão R$1.485 (médio) + recorrente R$150 (1ª parcela) por venda. Exemplo batendo sua Meta Base: 9 à vista/cartão (R$147×9=R$1.323) + 21 recorrentes (R$75×21=R$1.575) = R$2.898 de comissão, sem bônus.`
              : 'Meta Base = 30 vendas/mês por vendedor, sem bonificação — só a comissão por venda. Faturamento estimado como: à vista/cartão R$1.485 (médio) + recorrente R$150 (1ª parcela) por venda. Exemplo batendo a Meta Base: 9 à vista/cartão (R$147×9=R$1.323) + 21 recorrentes (R$75×21=R$1.575) = R$2.898 de comissão, sem bônus.'}
          </p>
          <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2">
            {viewAsName
              ? 'Base, Motivo e Superação são metas individuais — essa é a sua.'
              : 'Base, Motivo e Superação são metas individuais — cada vendedor bate a sua. A linha de baixo na tabela é só a soma dos 3, não uma meta de equipe: isso ainda não foi definido e entra depois, à parte.'}
          </p>
          <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2">
            {viewAsName
              ? 'A tabela acima é editável — entre com o que você vendeu de verdade no mês. As 3 tabelas abaixo são só referência: mostram quanto você ganharia em cada nível, mantendo o mix de 30% à vista/cartão + 70% recorrente. Vendas por nível: Base 30 (9+21) · Motivo 50 (15+35) · Superação 70 (21+49) — números fechados para dar exatamente 30%/70%.'
              : 'A tabela acima é editável — cada vendedor entra com o que vendeu de verdade no mês. As 3 tabelas abaixo são só referência: mostram, pra cada nível, quanto UM vendedor ganharia sozinho SE batesse exatamente aquele nível — não é um cenário de todo mundo batendo junto. Mantém o mix de 30% à vista/cartão + 70% recorrente. Vendas por nível: Base 30 (9+21) · Motivo 50 (15+35) · Superação 70 (21+49) — números fechados para dar exatamente 30%/70%.'}
          </p>
        </div>
      </Card>

      {TIERS.map((tier) => {
        const calc = calcVendor(tier.vistaCartao, tier.boleto);
        return (
          <Card key={tier.label} className="p-4 overflow-x-auto">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Badge className={`text-xs border-0 ${tier.badgeClass}`}>{tier.label}</Badge>
              {viewAsName
                ? `quanto você ganha ao bater ${tier.vistaCartao + tier.boleto} vendas/mês`
                : `quanto cada vendedor ganha, sozinho, ao bater ${tier.vistaCartao + tier.boleto} vendas/mês`}
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Vendas à vista/cartão</TableHead>
                  <TableHead className="text-right">Vendas recorrentes</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead>Bonificação</TableHead>
                  <TableHead className="text-right">A receber</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scoped.map((v) => (
                  <TableRow key={v.name}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center font-bold text-xs flex-shrink-0">{v.initials}</div>
                        <div>
                          <div className="text-sm font-medium text-foreground">{v.name}</div>
                          <div className="text-xs text-muted-foreground">{v.role}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{tier.vistaCartao}</TableCell>
                    <TableCell className="text-right">{tier.boleto}</TableCell>
                    <TableCell className="text-right">{calc.total}</TableCell>
                    <TableCell className="text-right">{fmt(calc.faturamento)}</TableCell>
                    <TableCell className="text-right">{fmt(calc.comissao)}</TableCell>
                    <TableCell>{calc.bonus ? <span className="inline-flex items-center gap-1"><BonusPill bonus={calc.bonus} /> {fmt(calc.bonus)}</span> : <BonusPill bonus={calc.bonus} />}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(calc.receber)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        );
      })}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">{viewAsName ? 'Seus 3 níveis de meta' : '3 níveis de meta — por vendedor'}</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nível</TableHead>
                <TableHead className="text-right">Vendas/mês</TableHead>
                <TableHead className="text-right">À vista/cartão (30%)</TableHead>
                <TableHead className="text-right">Recorrente (70%)</TableHead>
                <TableHead className="text-right">Faturamento bruto</TableHead>
                <TableHead className="text-right">Bonificação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell><Badge className="text-xs border-0 bg-primary/10 text-primary">Meta Base</Badge></TableCell>
                <TableCell className="text-right">30</TableCell>
                <TableCell className="text-right">9</TableCell>
                <TableCell className="text-right">21</TableCell>
                <TableCell className="text-right">R$ 16.515</TableCell>
                <TableCell className="text-right">sem bonificação</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Badge className="text-xs border-0 bg-warning/10 text-warning">Meta Motivo</Badge></TableCell>
                <TableCell className="text-right">50</TableCell>
                <TableCell className="text-right">15</TableCell>
                <TableCell className="text-right">35</TableCell>
                <TableCell className="text-right">R$ 27.525</TableCell>
                <TableCell className="text-right">R$ 1.000</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Badge className="text-xs border-0 bg-success/10 text-success">Meta Superação</Badge></TableCell>
                <TableCell className="text-right">70</TableCell>
                <TableCell className="text-right">21</TableCell>
                <TableCell className="text-right">49</TableCell>
                <TableCell className="text-right">R$ 38.535</TableCell>
                <TableCell className="text-right">R$ 2.000</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground bg-muted rounded-md border border-dashed border-border px-3 py-2 mt-3">
            A bonificação é calculada em cima do faturamento bruto do mês (à vista/cartão + recorrente), não da comissão. Threshold: Motivo a partir de R$25.000, Superação a partir de R$35.000. Não é cumulativa — vale o nível mais alto batido no mês (bater Superação substitui a de Motivo, não soma).
          </p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Como fica na prática</h3>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>Faturou até R$24.999</TableCell>
                <TableCell className="text-right">só comissão por venda</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Faturou R$25.000 – R$34.999</TableCell>
                <TableCell className="text-right">comissão + R$1.000</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Faturou R$35.000 ou mais</TableCell>
                <TableCell className="text-right">comissão + R$2.000</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-warning inline-block" /> Bateu Meta Motivo (R$25k+)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-success inline-block" /> Bateu Meta Superação (R$35k+)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-muted-foreground inline-block" /> Só Meta Base, sem bonificação</span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Meta de Equipe — ainda não definida pelo dono do negócio. Aba reservada
// pra quando ele trouxer os números (é diferente da soma das metas
// individuais, que já existe na Remuneração).
// -----------------------------------------------------------------------

function MetaEquipeTab() {
  return (
    <Card className="p-8 flex flex-col items-center justify-center text-center gap-2 border-dashed">
      <Target className="h-8 w-8 text-muted-foreground/50" />
      <h3 className="text-sm font-semibold text-foreground">Meta de equipe ainda não definida</h3>
      <p className="text-xs text-muted-foreground max-w-sm">
        Isso é diferente da soma das metas individuais (aba Remuneração) — assim que a meta de equipe for fechada, ela entra aqui.
      </p>
    </Card>
  );
}

// -----------------------------------------------------------------------

// "Login" local (sem Supabase Auth ainda) pra simular cada vendedor(a) vendo
// só o que é dela — pronto pra trocar por auth real quando Helen/Miguel/Aline
// virarem usuarios de verdade no sistema.
const VENDOR_SWITCH_OPTIONS = [
  { value: 'todos', label: 'Todos (visão admin)' },
  ...INITIAL_VENDORS.map((v) => ({
    value: v.name,
    label: v.gerente ? `${v.name} (gerente — vê todos)` : v.name,
  })),
];

export function TimeComercial() {
  const [viewAs, setViewAs] = useState('todos');
  const activeVendor = INITIAL_VENDORS.find((v) => v.name === viewAs);
  // null = sem filtro (admin ou gerente); string = so os dados desse vendedor.
  const viewAsName = activeVendor && !activeVendor.gerente ? activeVendor.name : null;

  return (
    <div className="h-full flex flex-col animate-fade-in p-4 lg:p-6 gap-4 overflow-y-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl lg:text-2xl font-bold text-foreground">CRM Time Comercial</h1>
        <Select value={viewAs} onValueChange={setViewAs}>
          <SelectTrigger className="h-9 w-auto min-w-[220px] rounded-full bg-primary/10 border-primary/20 text-primary text-sm font-medium shadow-sm hover:bg-primary/15">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border z-[100]">
            {VENDOR_SWITCH_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-sm">{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="funil" className="flex-1 flex flex-col min-h-0">
        <TabsList>
          <TabsTrigger value="funil">Funil</TabsTrigger>
          <TabsTrigger value="operacao">Operação</TabsTrigger>
          <TabsTrigger value="metas">Meta Pessoal</TabsTrigger>
          <TabsTrigger value="meta_equipe">Meta de Equipe</TabsTrigger>
          <TabsTrigger value="aquisicao">Aquisição</TabsTrigger>
          <TabsTrigger value="remuneracao">Remuneração</TabsTrigger>
        </TabsList>
        <TabsContent value="funil" className="flex-1 min-h-0">
          <FunilTimeComercial viewAsName={viewAsName} />
        </TabsContent>
        <TabsContent value="operacao">
          <OperacaoTab viewAsName={viewAsName} />
        </TabsContent>
        <TabsContent value="metas">
          <MetasTab viewAsName={viewAsName} />
        </TabsContent>
        <TabsContent value="meta_equipe">
          <MetaEquipeTab />
        </TabsContent>
        <TabsContent value="aquisicao">
          <AquisicaoTab />
        </TabsContent>
        <TabsContent value="remuneracao">
          <RemuneracaoTab viewAsName={viewAsName} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
