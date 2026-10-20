import { useEffect, useState } from 'react';
import {
  BadgeDollarSign, BriefcaseBusiness, CalendarCheck2, ClipboardList, FileWarning, Users,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Card, CardContent } from '@/components/ui/card';
import { StatTile, SectionBar } from '@/components/crm/ui/premium';

type Profissional = Database['public']['Tables']['profissionais']['Row'];
type Pagamento = Database['public']['Tables']['profissionais_pagamentos']['Row'];
type Pendencia = Database['public']['Tables']['presencas_pendentes_revisao']['Row'];

function formatReal(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function mesAtualBrasil() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${p.find(x => x.type === 'year')?.value}-${p.find(x => x.type === 'month')?.value}`;
}

function useDiretoriaRH() {
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [pagamentosMes, setPagamentosMes] = useState<Pagamento[]>([]);
  const [semNota, setSemNota] = useState<Pagamento[]>([]);
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [aulasHoje, setAulasHoje] = useState(0);
  const [aulasRealizadasMes, setAulasRealizadasMes] = useState(0);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    const mes = mesAtualBrasil();
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    void (async () => {
      setCarregando(true);
      const [profRes, pagRes, semNotaRes, pendRes, hojeRes, mesRes] = await Promise.all([
        supabase.from('profissionais').select('*').eq('ativo', true).order('nome'),
        supabase.from('profissionais_pagamentos').select('*').gte('data_pagamento', `${mes}-01`),
        supabase.from('profissionais_pagamentos').select('*').is('nota_fiscal_arquivo_url', null).order('data_pagamento', { ascending: false }).limit(20),
        supabase.from('presencas_pendentes_revisao').select('*').eq('resolvido', false).order('created_at', { ascending: false }),
        supabase.from('aulas').select('id', { count: 'exact', head: true }).eq('data', hoje),
        supabase.from('aulas').select('id', { count: 'exact', head: true }).eq('status', 'realizada').gte('data', `${mes}-01`),
      ]);
      if (!ativo) return;
      setProfissionais(profRes.data ?? []);
      setPagamentosMes(pagRes.data ?? []);
      setSemNota(semNotaRes.data ?? []);
      setPendencias(pendRes.data ?? []);
      setAulasHoje(hojeRes.count ?? 0);
      setAulasRealizadasMes(mesRes.count ?? 0);
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, []);

  return { profissionais, pagamentosMes, semNota, pendencias, aulasHoje, aulasRealizadasMes, carregando };
}

const DECISOES = [
  { titulo: 'Comissão da vendedora', texto: 'Percentual do líquido (depois da taxa do gateway, nunca do imposto): 10% à vista no cartão, 50% da 1ª parcela no boleto. A fonte oficial é a tela Comissões — o RH só espelha.' },
  { titulo: 'Ajuda de custo', texto: 'Valor fixo mensal pago em 2 parcelas: dia 15 (1ª metade) e dia 1º do mês seguinte (2ª metade, junto com a comissão do mês anterior).' },
  { titulo: 'Pagamento por turma', texto: 'Professor ou tutor recebe por turma (ex: R$300/turma, pago dia 30). Tutores em estágio não recebem.' },
  { titulo: 'Repasse Sociedade IDM', texto: '40% do faturamento mensal do produto, sem valor fixo. Entra no DRE como repasse_investidor (custo direto), não como folha.' },
  { titulo: 'Nota fiscal', texto: 'Cada pagamento precisa de nota correspondente ao valor daquele evento (não antecipa nem resume o mês). Quem está em débito passa a ser obrigatório a partir do próximo pagamento.' },
  { titulo: 'Presença', texto: 'Professor e aluno confirmam por link próprio da aula, validado por CPF. Tolerância de 1 dia na data de nascimento por causa de cadastros antigos com fuso errado; quem não bate vai para revisão manual em vez de travar.' },
];

export function DiretoriaRH() {
  const { profissionais, pagamentosMes, semNota, pendencias, aulasHoje, aulasRealizadasMes, carregando } = useDiretoriaRH();

  const totalPagoMes = pagamentosMes.reduce((soma, p) => soma + Number(p.valor), 0);
  const valorPendenteNota = semNota.reduce((soma, p) => soma + Number(p.valor), 0);
  const porProfissional = new Map<string, number>();
  for (const p of pagamentosMes) porProfissional.set(p.profissional_id, (porProfissional.get(p.profissional_id) ?? 0) + Number(p.valor));

  return (
    <div className="min-h-full bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BriefcaseBusiness className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Diretoria — DP RH</h1>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Garantir que todo profissional esteja cadastrado certo, receba o que é devido, e que cada pagamento
            tenha comprovante e nota fiscal. Painel em tempo real abaixo; playbook e decisões já tomadas no final.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile label="Profissionais ativos" value={carregando ? '—' : profissionais.length} icon={Users} />
          <StatTile label="Pago este mês" value={carregando ? '—' : formatReal(totalPagoMes)} icon={BadgeDollarSign} tom="bom" />
          <StatTile label="Sem nota fiscal" value={carregando ? '—' : semNota.length} hint={!carregando && semNota.length > 0 ? formatReal(valorPendenteNota) : undefined} icon={FileWarning} tom={semNota.length > 0 ? 'atencao' : 'padrao'} />
          <StatTile label="Presença p/ revisar" value={carregando ? '—' : pendencias.length} icon={ClipboardList} tom={pendencias.length > 0 ? 'atencao' : 'padrao'} />
          <StatTile label="Aulas hoje / realizadas no mês" value={carregando ? '—' : `${aulasHoje} / ${aulasRealizadasMes}`} icon={CalendarCheck2} />
        </section>

        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <SectionBar title="Pago este mês, por profissional" icon={BadgeDollarSign} />
            {carregando ? <p className="text-sm text-muted-foreground">Carregando...</p> : profissionais.filter(p => (porProfissional.get(p.id) ?? 0) > 0).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pagamento lançado este mês ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Profissional</th><th className="p-2">Função</th><th className="p-2 text-right">Pago no mês</th>
                  </tr></thead>
                  <tbody>
                    {profissionais.filter(p => (porProfissional.get(p.id) ?? 0) > 0)
                      .sort((a, b) => (porProfissional.get(b.id) ?? 0) - (porProfissional.get(a.id) ?? 0))
                      .map(p => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="p-2 font-medium">{p.nome}</td>
                          <td className="p-2 text-muted-foreground">{p.funcao || '—'}</td>
                          <td className="p-2 text-right tabular-nums">{formatReal(porProfissional.get(p.id) ?? 0)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {semNota.length > 0 && (
          <Card className="border-amber-300/50 shadow-sm">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <SectionBar title="Pagamentos sem nota fiscal" icon={FileWarning} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Data</th><th className="p-2">Profissional</th><th className="p-2 text-right">Valor</th><th className="p-2">Descrição</th>
                  </tr></thead>
                  <tbody>
                    {semNota.map(p => {
                      const prof = profissionais.find(x => x.id === p.profissional_id);
                      return (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="p-2 whitespace-nowrap">{new Date(`${p.data_pagamento}T12:00:00`).toLocaleDateString('pt-BR')}</td>
                          <td className="p-2 font-medium">{prof?.nome ?? '—'}</td>
                          <td className="p-2 text-right tabular-nums">{formatReal(Number(p.valor))}</td>
                          <td className="p-2 text-muted-foreground max-w-sm truncate" title={p.descricao ?? ''}>{p.descricao || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {pendencias.length > 0 && (
          <Card className="border-amber-300/50 shadow-sm">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <SectionBar title="Presenças pendentes de revisão manual" icon={ClipboardList} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Quando</th><th className="p-2">Nome informado</th><th className="p-2">Motivo</th>
                  </tr></thead>
                  <tbody>
                    {pendencias.map(p => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="p-2 whitespace-nowrap text-muted-foreground">{new Date(p.created_at).toLocaleString('pt-BR')}</td>
                        <td className="p-2 font-medium">{p.nome_informado}</td>
                        <td className="p-2 text-muted-foreground">{p.motivo}</td>
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
            <SectionBar title="Playbook e decisões já tomadas" icon={BriefcaseBusiness} />
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
