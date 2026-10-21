import { useEffect, useState } from 'react';
import {
  BadgeDollarSign, Megaphone, Target, TrendingUp, UserPlus, Clock3,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { StatTile, SectionBar } from '@/components/crm/ui/premium';
import { INITIAL_VENDORS, calcVendor, META_MOTIVO_FAT, META_SUPERACAO_FAT } from '@/lib/vendedores';

interface Comissao { id: string; vendedor: string; tipo: string; status: string; data_venda: string; aluno_nome: string; valor_venda: number; valor_comissao: number; }

function formatReal(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function inicioMesBrasil() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${p.find(x => x.type === 'year')?.value}-${p.find(x => x.type === 'month')?.value}-01`;
}

function hojeBrasil() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function useDiretoriaComercial() {
  const [leadsHojeCount, setLeadsHojeCount] = useState(0);
  const [leadsMesCount, setLeadsMesCount] = useState(0);
  const [fechadosMesCount, setFechadosMesCount] = useState(0);
  const [followupsVencidosCount, setFollowupsVencidosCount] = useState(0);
  const [comissoesMes, setComissoesMes] = useState<Comissao[]>([]);
  const [comissaoPendente, setComissaoPendente] = useState<Comissao[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    const inicioMes = inicioMesBrasil();
    const hoje = hojeBrasil();
    void (async () => {
      setCarregando(true);
      // Contagens via head:true (count exato no banco) — a volumetria real de leads do
      // mês passa de 1000 linhas, o limite padrão de retorno do client; buscar as linhas
      // pra só contar subestimava o total.
      const [hojeRes, mesRes, fechadosRes, followupRes, comMesRes, comPendRes] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('origem', 'Time Comercial').gte('criado_em', `${hoje}T00:00:00`),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('origem', 'Time Comercial').gte('criado_em', `${inicioMes}T00:00:00`),
        // Não há data de fechamento própria nesta tabela (matriculado_em não é
        // preenchido pelo fluxo do Time Comercial) — aproxima por "fechado entre os
        // leads criados no mês", mesmo critério usado no resto da Diretoria.
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('origem', 'Time Comercial').eq('status', 'fechado').gte('criado_em', `${inicioMes}T00:00:00`),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('origem', 'Time Comercial').eq('status', 'followup').lt('followup_manual_prazo', `${hoje}T00:00:00`),
        // Comissão real da vendedora: tipo='comissao' (ajuda de custo fica de fora, é
        // valor fixo, não faturamento de venda).
        supabase.from('comissoes_vendedores').select('*').eq('tipo', 'comissao').gte('data_venda', inicioMes),
        supabase.from('comissoes_vendedores').select('*').in('status', ['pendente', 'reservado']).order('data_venda', { ascending: false }),
      ]);
      if (!ativo) return;
      setLeadsHojeCount(hojeRes.count ?? 0);
      setLeadsMesCount(mesRes.count ?? 0);
      setFechadosMesCount(fechadosRes.count ?? 0);
      setFollowupsVencidosCount(followupRes.count ?? 0);
      setComissoesMes((comMesRes.data as Comissao[]) ?? []);
      setComissaoPendente((comPendRes.data as Comissao[]) ?? []);
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, []);

  return { leadsHojeCount, leadsMesCount, fechadosMesCount, followupsVencidosCount, comissoesMes, comissaoPendente, carregando };
}

const DECISOES = [
  { titulo: 'Funil de vendas', texto: 'Novo Lead → Em Contato → Interessado → Proposta → Follow-up → Fechado, com Perdido à parte. A partir de "Interessado" o lead vira SQL (Sales Qualified Lead). O canal SDD (Semana do Despertar) tem funil próprio: Frio → Pré-aquecimento → Grupo de Oferta → Primeiro contato → Negociação → Matrícula.' },
  { titulo: 'Follow-up', texto: 'Ao mover um lead pra Follow-up, o sistema pede a data combinada de retorno e conta quantas tentativas já foram feitas. Quando o prazo vence, avisa automaticamente por WhatsApp; depois de várias tentativas sem avanço, sugere mover pra Perdido.' },
  { titulo: 'Comissão à vista/cartão', texto: `R$147 por venda à vista ou no cartão (faturamento de R$1.485 cada). Fonte: ${formatReal(147)} por venda — ver src/lib/vendedores.ts.` },
  { titulo: 'Comissão recorrente (boleto)', texto: 'R$75 por venda recorrente/boleto (faturamento de R$150 cada parcela).' },
  { titulo: 'Ajuda de custo', texto: 'Valor fixo mensal de R$1.500 somado à comissão do mês, independente de meta batida.' },
  { titulo: 'Bônus de meta', texto: `Faturamento do mês ≥ ${formatReal(META_MOTIVO_FAT)} → bônus de R$1.000. Faturamento ≥ ${formatReal(META_SUPERACAO_FAT)} (superação) → bônus de R$2.000.` },
];

export function DiretoriaComercial() {
  const { leadsHojeCount, leadsMesCount, fechadosMesCount, followupsVencidosCount, comissoesMes, comissaoPendente, carregando } = useDiretoriaComercial();

  const taxaConversao = leadsMesCount > 0 ? (fechadosMesCount / leadsMesCount) * 100 : 0;

  const faturamentoMes = comissoesMes.reduce((soma, c) => soma + Number(c.valor_venda), 0);
  const comissaoMes = comissoesMes.reduce((soma, c) => soma + Number(c.valor_comissao), 0);
  const valorComissaoPendente = comissaoPendente.reduce((soma, c) => soma + Number(c.valor_comissao), 0);

  const vendedora = INITIAL_VENDORS[0];
  const metaPct = vendedora ? Math.min(Math.round((faturamentoMes / META_MOTIVO_FAT) * 100), 999) : 0;

  return (
    <div className="min-h-full bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Megaphone className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Diretoria — DP Comercial</h1>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Acompanhar o funil de vendas ponta a ponta — leads entrando, follow-up em dia,
            conversão e comissão certa pra cada vendedora. Painel em tempo real abaixo;
            playbook e decisões já tomadas no final.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile label="Leads hoje / no mês" value={carregando ? '—' : `${leadsHojeCount} / ${leadsMesCount}`} icon={UserPlus} />
          <StatTile label="Taxa de conversão (mês)" value={carregando ? '—' : `${taxaConversao.toFixed(1)}%`} hint={!carregando ? `${fechadosMesCount} fechado(s)` : undefined} icon={TrendingUp} tom={taxaConversao > 0 ? 'bom' : 'padrao'} />
          <StatTile label="Follow-ups vencidos" value={carregando ? '—' : followupsVencidosCount} icon={Clock3} tom={followupsVencidosCount > 0 ? 'atencao' : 'padrao'} />
          <StatTile label="Faturado este mês" value={carregando ? '—' : formatReal(faturamentoMes)} hint={!carregando ? `${comissoesMes.length} venda(s)` : undefined} icon={BadgeDollarSign} tom="bom" />
          <StatTile label="Comissão a pagar" value={carregando ? '—' : formatReal(valorComissaoPendente)} icon={Target} tom={valorComissaoPendente > 0 ? 'atencao' : 'padrao'} />
        </section>

        {vendedora && (
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <SectionBar title={`Meta do mês — ${vendedora.name}`} icon={Target} />
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Faturamento vs. meta de bônus ({formatReal(META_MOTIVO_FAT)})</span>
                  <span className="font-semibold tabular-nums">{carregando ? '—' : `${metaPct}%`}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${carregando ? 0 : Math.min(metaPct, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Superação em {formatReal(META_SUPERACAO_FAT)} · comissão lançada no mês: {carregando ? '—' : formatReal(comissaoMes)}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {comissaoPendente.length > 0 && (
          <Card className="border-amber-300/50 shadow-sm">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <SectionBar title="Comissões pendentes de pagamento" icon={BadgeDollarSign} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Data</th><th className="p-2">Vendedor(a)</th><th className="p-2">Aluno</th><th className="p-2 text-right">Comissão</th><th className="p-2">Status</th>
                  </tr></thead>
                  <tbody>
                    {comissaoPendente.map(c => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="p-2 whitespace-nowrap">{new Date(`${c.data_venda}T12:00:00`).toLocaleDateString('pt-BR')}</td>
                        <td className="p-2 font-medium">{c.vendedor}</td>
                        <td className="p-2 text-muted-foreground">{c.aluno_nome}</td>
                        <td className="p-2 text-right tabular-nums">{formatReal(Number(c.valor_comissao))}</td>
                        <td className="p-2 text-muted-foreground capitalize">{c.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <SectionBar title="Playbook e decisões já tomadas" icon={Megaphone} />
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
