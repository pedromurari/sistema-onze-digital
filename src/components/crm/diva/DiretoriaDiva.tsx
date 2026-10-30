import { useEffect, useState } from 'react';
import { HeartHandshake, Users, UserPlus, BadgeDollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { StatTile, SectionBar } from '@/components/crm/ui/premium';

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
        supabase.from('diva_sessoes').select('valor_total').eq('status_pagamento', 'pago').gte('created_at', `${inicioMes}T00:00:00`),
      ]);
      if (!ativo) return;
      setTerapeutasAprovados(terapeutasRes.count ?? 0);
      setLeadsMes(leadsRes.count ?? 0);
      const sessoes = (sessoesRes.data as { valor_total: number }[] | null) ?? [];
      setSessoesFechadasMes(sessoes.length);
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
  { titulo: 'Pagamento e repasse', texto: 'Manual por enquanto (marcar pago/repassado na aba Sessões). Split automático (Asaas Split) é Fase 2 — os campos já existem na tabela.' },
  { titulo: 'Funil', texto: 'Cliente preenche interesse em /diva → lead criado com produto "diva_idm" → confirmação automática no WhatsApp → vendedor do Divã assume na aba Funil pra negociar pacote ou sessão avulsa.' },
  { titulo: 'Vendedor', texto: 'Ainda a contratar. Quando chegar, cadastrar em src/lib/divaVendedores.ts (DIVA_VENDORS) — meta e comissão reaproveitam o mesmo padrão do Time Comercial.' },
];

export function DiretoriaDiva() {
  const { terapeutasAprovados, leadsMes, sessoesFechadasMes, faturamentoMes, carregando } = useDiretoriaDiva();

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
