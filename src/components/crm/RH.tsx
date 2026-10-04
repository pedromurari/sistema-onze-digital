import {
  BadgeDollarSign,
  Banknote,
  BookOpenCheck,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  FileText,
  Link2,
  Plus,
  ReceiptText,
  ShieldCheck,
  UserRoundPlus,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Este módulo nasce deliberadamente sem persistência: a primeira entrega registra a
// decisão de produto e dá ao time um lugar único para retomá-la. Botões operacionais
// ficam desabilitados para ninguém confundir o esboço com um contas a pagar funcional.
// Quando o schema de RH entrar, estes blocos viram consumidores dos hooks de src/lib/db.
const INDICADORES = [
  { label: 'Funcionários', value: '0', detail: 'cadastro será manual', icon: Users, tone: 'text-blue-600 bg-blue-500/10' },
  { label: 'A pagar', value: 'R$ 0,00', detail: 'nenhuma competência aberta', icon: Banknote, tone: 'text-amber-600 bg-amber-500/10' },
  { label: 'Aulas a aprovar', value: '0', detail: 'formulário ainda não publicado', icon: BookOpenCheck, tone: 'text-violet-600 bg-violet-500/10' },
  { label: 'Notas pendentes', value: '0', detail: 'nenhum documento anexado', icon: ReceiptText, tone: 'text-emerald-600 bg-emerald-500/10' },
] as const;

const ESCOPO = [
  {
    title: 'Cadastro do profissional',
    description: 'Nome, função, contato, chave Pix, dados fiscais, vínculo e situação ativa/inativa.',
    icon: UserRoundPlus,
  },
  {
    title: 'Modelo de pagamento',
    description: 'Fixo, por aula, comissão, ajuda de custo ou híbrido, com um ou mais dias de pagamento.',
    icon: BadgeDollarSign,
  },
  {
    title: 'Aulas e serviços realizados',
    description: 'Link individual para o professor lançar a aula; o gestor aprova antes de gerar a pendência.',
    icon: Link2,
  },
  {
    title: 'Comissões automáticas',
    description: 'Vendas confirmadas alimentam a competência da vendedora sem lançamento manual duplicado.',
    icon: CheckCircle2,
  },
  {
    title: 'Contas a pagar',
    description: 'Valores previstos, aprovados, vencidos e pagos, separados por profissional e competência.',
    icon: CalendarClock,
  },
  {
    title: 'Notas fiscais e comprovantes',
    description: 'Anexo da nota enviada pelo profissional e comprovante do pagamento no mesmo histórico.',
    icon: FileText,
  },
] as const;

const ETAPAS = [
  {
    number: '01',
    title: 'Base cadastral e regras',
    description: 'Criar funcionários, modelos de remuneração, dias de pagamento e documentos obrigatórios.',
    deliverables: ['Cadastro manual', 'Fixo / aula / comissão / híbrido', 'Calendário de pagamento'],
  },
  {
    number: '02',
    title: 'Lançamentos e aprovação',
    description: 'Gerar um link seguro por profissional e transformar aulas/serviços aprovados em pendências.',
    deliverables: ['Formulário individual', 'Aprovação do gestor', 'Histórico de alterações'],
  },
  {
    number: '03',
    title: 'Fechamento e documentos',
    description: 'Fechar a competência, receber a nota fiscal e registrar pagamento e comprovante.',
    deliverables: ['Fila a pagar', 'Anexo de NF', 'Baixa e comprovante'],
  },
  {
    number: '04',
    title: 'Integrações e indicadores',
    description: 'Somar comissões comerciais, refletir despesas no DRE e emitir avisos de vencimento.',
    deliverables: ['Comissões de vendas', 'Integração com DRE', 'Alertas e relatórios'],
  },
] as const;

export function RH() {
  return (
    <div className="min-h-full bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BriefcaseBusiness className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">RH e pagamentos</h1>
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                Esboço inicial
              </Badge>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Futuro centro de funcionários, professores, comissões, aulas realizadas, notas fiscais e contas a pagar.
              Esta tela guarda o escopo e o plano; ainda não movimenta dinheiro nem envia formulários.
            </p>
          </div>
          <Button disabled className="gap-2 self-start" title="Disponível quando a base cadastral do RH for implementada">
            <Plus className="h-4 w-4" /> Adicionar funcionário
          </Button>
        </header>

        <section aria-label="Indicadores planejados" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {INDICADORES.map(({ label, value, detail, icon: Icon, tone }) => (
            <Card key={label} className="border-border/70 shadow-sm">
              <CardContent className="flex items-start justify-between p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                </div>
                <div className={`rounded-xl p-2.5 ${tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BriefcaseBusiness className="h-4 w-4 text-primary" />
                O que este módulo deverá controlar
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {ESCOPO.map(({ title, description, icon: Icon }) => (
                <div key={title} className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/[0.035] shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Fluxo planejado para aula dada
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {[
                  ['1', 'Professor abre seu link individual'],
                  ['2', 'Informa turma, aula, data e duração'],
                  ['3', 'Gestor confere e aprova o lançamento'],
                  ['4', 'Valor entra na próxima competência'],
                  ['5', 'Nota fiscal é anexada antes do pagamento'],
                ].map(([number, text], index, items) => (
                  <li key={number} className="relative flex gap-3">
                    {index < items.length - 1 ? <span className="absolute left-3 top-7 h-5 w-px bg-border" /> : null}
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      {number}
                    </span>
                    <span className="pt-0.5 text-sm text-foreground">{text}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-5 rounded-lg border border-border/70 bg-background/70 p-3 text-xs leading-relaxed text-muted-foreground">
                O link deverá usar token individual, aceitar celular e nunca dar acesso ao restante do RH. Toda aula precisa de aprovação antes de virar valor a pagar.
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CircleDashed className="h-4 w-4 text-primary" />
                Plano de implementação anexado
              </CardTitle>
              <Badge variant="secondary">4 etapas</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-4">
            {ETAPAS.map(({ number, title, description, deliverables }) => (
              <article key={number} className="rounded-xl border border-border/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold tracking-widest text-primary">ETAPA {number}</span>
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                <p className="mt-2 min-h-14 text-xs leading-relaxed text-muted-foreground">{description}</p>
                <ul className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
                  {deliverables.map(item => (
                    <li key={item} className="flex items-center gap-2 text-xs text-foreground/80">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/60" /> {item}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </CardContent>
        </Card>

        <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            Próxima decisão antes de construir: definir quem pode ver remuneração, quem aprova aulas e se a nota fiscal será obrigatória por profissional. Até isso ser decidido, o módulo permanece somente como planejamento.
          </p>
        </div>
      </div>
    </div>
  );
}
