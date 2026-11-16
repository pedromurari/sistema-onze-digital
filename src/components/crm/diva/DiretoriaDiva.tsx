import { useEffect, useState } from 'react';
import { HeartHandshake, Users, UserPlus, BadgeDollarSign, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { StatTile, SectionBar } from '@/components/crm/ui/premium';

interface ProgressoCampanha { nome: string; enviados: number; total: number; }

// Campanhas de ativação (09/11/2026) -- não passam pela tela "Disparos em
// Massa" (fila própria, mais simples, ver AGENTS do Divã) -- esse card é
// a única visão de progresso delas pro Pedro.
function useCampanhasDiva() {
  const [campanhas, setCampanhas] = useState<ProgressoCampanha[]>([]);
  useEffect(() => {
    void (async () => {
      const [analise, despertar] = await Promise.all([
        supabase.from('diva_campanha_analise_leads' as never).select('enviado_em'),
        supabase.from('diva_campanha_despertar_leads' as never).select('enviado_em'),
      ]);
      const contar = (rows: { enviado_em: string | null }[] | null) => {
        const total = rows?.length ?? 0;
        const enviados = rows?.filter(r => r.enviado_em).length ?? 0;
        return { enviados, total };
      };
      setCampanhas([
        { nome: 'Psicanálise em dia (tripé da análise)', ...contar(analise.data as { enviado_em: string | null }[] | null) },
        { nome: 'Semana do Despertar (público frio)', ...contar(despertar.data as { enviado_em: string | null }[] | null) },
      ]);
    })();
  }, []);
  return campanhas;
}

function formatReal(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function inicioMesBrasil() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${p.find(x => x.type === 'year')?.value}-${p.find(x => x.type === 'month')?.value}-01`;
}

function useDiretoriaDiva() {
  const [terapeutasAprovados, setTerapeutasAprovados] = useState(0);
  const [leadsMes, setLeadsMes] = useState(0);
  const [sessoesFechadasMes, setSessoesFechadasMes] = useState(0);
  const [faturamentoMes, setFaturamentoMes] = useState(0);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    const inicioMes = inicioMesBrasil();
    void (async () => {
      setCarregando(true);
      const [terapeutasRes, leadsRes, sessoesRes] = await Promise.all([
        supabase.from('diva_terapeutas').select('id', { count: 'exact', head: true }).eq('status', 'aprovado'),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('produto', 'diva_idm').gte('criado_em', `${inicioMes}T00:00:00`),
        supabase.from('diva_sessoes').select('valor_total, quantidade_sessoes').eq('status_pagamento', 'pago').gte('created_at', `${inicioMes}T00:00:00`),
      ]);
      if (!ativo) return;
      setTerapeutasAprovados(terapeutasRes.count ?? 0);
      setLeadsMes(leadsRes.count ?? 0);
      const sessoes = (sessoesRes.data as { valor_total: number; quantidade_sessoes: number | null }[] | null) ?? [];
      // "Sessões fechadas" conta sessões de verdade, não vendas -- uma venda de
      // pacote de 4 sessões soma 4, não 1 (achado real 16/11: pacote da Jocimarah
      // aparecia como "1 sessão fechada" quando na verdade eram 4).
      setSessoesFechadasMes(sessoes.reduce((s, x) => s + (x.quantidade_sessoes ?? 1), 0));
      setFaturamentoMes(sessoes.reduce((s, x) => s + Number(x.valor_total), 0));
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, []);

  return { terapeutasAprovados, leadsMes, sessoesFechadasMes, faturamentoMes, carregando };
}

const DECISOES = [
  { titulo: 'Preço', texto: 'Sessão avulsa R$80 (2 sessões R$160, sem desconto). Pacote a partir de 3 sessões sai com desconto: 3 por R$210, 4 por R$280, 5 por R$350. Split sempre proporcional ao valor cobrado: 62,5% pro terapeuta, 37,5% pro IDM (R$50/R$30 na base de R$80). Pacote exige pagamento integral antes da 1ª sessão — mas nem todo cliente pede o desconto do pacote; muitos pagam a quantidade avulsa que quiserem de forma antecipada, registrar como "Outro valor" nesse caso.' },
  { titulo: 'Credenciamento', texto: 'Curadoria manual — Pedro/Rodrygo aprovam cada terapeuta. Ser assinante em dia da Sociedade IDM é pré-requisito, mas não dá acesso automático.' },
  { titulo: 'Pagamento e repasse', texto: 'Venda pelo link do terapeuta (aba Terapeutas): split automático via Mercado Pago, a parte dele já cai direto na conta dele. Registro na aba Sessões é só histórico/agenda, não precisa marcar repasse manual pra essas.' },
  { titulo: 'Funil', texto: 'Cliente preenche interesse em /diva → lead criado com produto "diva_idm" → confirmação automática no WhatsApp → vendedor do Divã assume na aba Funil pra negociar pacote ou sessão avulsa.' },
  { titulo: 'Vendedor', texto: 'Camila Murari — já atende a base comercial, assumiu o Divã também (08/11/2026). Atende pelo WhatsApp "Divã IDM" conectado no computador dela.' },
  { titulo: 'Como vender — passo a passo', texto: 'Lead chega em /diva → recebe boas-vindas automática no WhatsApp. Você assume na aba Funil ("Pegar lead"). Conversa, entende a necessidade, confere a aba Agenda pra ver qual terapeuta tem horário livre. Fechou? Pega o link de venda daquele terapeuta específico na aba Terapeutas (split automático via Mercado Pago, cai direto a parte dele) e registra a venda na aba Sessões. O repasse já é automático — não precisa marcar "Repassado" na mão pra vendas feitas por esse link.' },
];

export function DiretoriaDiva() {
  const { terapeutasAprovados, leadsMes, sessoesFechadasMes, faturamentoMes, carregando } = useDiretoriaDiva();
  const campanhas = useCampanhasDiva();

  return (
    <div className="min-h-full bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <HeartHandshake className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Diretoria — Divã IDM</h1>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Terapia social pra assinantes da Sociedade IDM. Painel em tempo real abaixo;
            playbook e decisões já tomadas no final.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Terapeutas credenciados" value={carregando ? '—' : terapeutasAprovados} icon={Users} />
          <StatTile label="Leads este mês" value={carregando ? '—' : leadsMes} icon={UserPlus} />
          <StatTile label="Sessões fechadas (mês)" value={carregando ? '—' : sessoesFechadasMes} icon={HeartHandshake} tom={sessoesFechadasMes > 0 ? 'bom' : 'padrao'} />
          <StatTile label="Faturamento (mês)" value={carregando ? '—' : formatReal(faturamentoMes)} icon={BadgeDollarSign} tom="bom" />
        </section>

        {campanhas.length > 0 && (
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <SectionBar title="Campanhas de ativação em andamento" icon={Send} />
              <p className="text-xs text-muted-foreground">
                Throttled, horário comercial (8h-18h, seg-sex) — não passam pela tela de Disparos em Massa.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {campanhas.map(c => (
                  <div key={c.nome} className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{c.nome}</span>
                      <span className="tabular-nums text-muted-foreground">{c.enviados}/{c.total}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary transition-all" style={{ width: `${c.total > 0 ? (c.enviados / c.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <SectionBar title="Playbook e decisões já tomadas" icon={HeartHandshake} />
            <div className="grid gap-3 sm:grid-cols-2">
              {DECISOES.map(d => (
                <div key={d.titulo} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <h3 className="text-sm font-semibold text-foreground">{d.titulo}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{d.texto}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
