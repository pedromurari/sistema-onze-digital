import {
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FilePenLine,
  FileUp,
  GraduationCap,
  LibraryBig,
  ListChecks,
  LockKeyhole,
  Plus,
  Scale,
  Send,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Assim como o primeiro esboço de RH, esta tela documenta o produto antes de
// existir banco, formulário público ou chamada de IA. Isso deixa a ideia visível
// para o time sem criar uma falsa impressão de que provas já estão sendo salvas.
const INDICADORES = [
  { label: 'Avaliações', value: '0', detail: 'nenhuma prova criada', icon: FilePenLine, tone: 'text-blue-600 bg-blue-500/10' },
  { label: 'Entregas recebidas', value: '0', detail: 'formulários ainda não publicados', icon: FileUp, tone: 'text-violet-600 bg-violet-500/10' },
  { label: 'Correções pela IA', value: '0', detail: 'integração ainda não ativada', icon: BrainCircuit, tone: 'text-fuchsia-600 bg-fuchsia-500/10' },
  { label: 'Aguardando revisão', value: '0', detail: 'nenhuma nota pendente', icon: UserCheck, tone: 'text-amber-600 bg-amber-500/10' },
] as const;

const FORMATOS = [
  {
    title: 'Questões objetivas',
    description: 'Múltipla escolha, verdadeiro ou falso e associação, com gabarito e pontuação automática.',
    icon: ListChecks,
  },
  {
    title: 'Questões discursivas',
    description: 'Respostas em texto avaliadas pela IA a partir de critérios e referências definidos pelo professor.',
    icon: ClipboardCheck,
  },
  {
    title: 'Envio de trabalhos',
    description: 'Entrega de PDF, documento, imagem ou link, vinculada ao aluno, à turma e ao prazo correto.',
    icon: FileUp,
  },
  {
    title: 'Estudos de caso',
    description: 'Atividades longas com rubrica por competência, feedback detalhado e nota por critério.',
    icon: LibraryBig,
  },
] as const;

const ESCOPO = [
  {
    title: 'Editor próprio de formulários',
    description: 'Professor monta prova ou trabalho, organiza seções, define peso, prazo, tentativas e turma.',
    icon: FilePenLine,
  },
  {
    title: 'Banco de questões',
    description: 'Questões reutilizáveis por disciplina, tema, dificuldade e professor, com versões preservadas.',
    icon: LibraryBig,
  },
  {
    title: 'Correção assistida por IA',
    description: 'A IA compara resposta, gabarito e rubrica, sugere nota e produz uma justificativa auditável.',
    icon: BrainCircuit,
  },
  {
    title: 'Revisão e liberação',
    description: 'Professor confere casos sensíveis, ajusta quando necessário e decide quando a nota chega ao aluno.',
    icon: UserCheck,
  },
  {
    title: 'Histórico acadêmico',
    description: 'Nota, feedback, tentativa, anexo e revisão ficam ligados ao aluno e à turma correta.',
    icon: GraduationCap,
  },
  {
    title: 'Integridade e rastreabilidade',
    description: 'Controle de prazo, autoria, versões, eventos de acesso e registro de toda alteração de nota.',
    icon: ShieldCheck,
  },
] as const;

const ETAPAS = [
  {
    number: '01',
    title: 'Editor e banco de questões',
    description: 'Criar avaliações, rubricas, gabaritos, pesos, prazos e modelos reutilizáveis.',
    deliverables: ['Editor de prova', 'Banco de questões', 'Rubrica e gabarito'],
  },
  {
    number: '02',
    title: 'Portal de resposta',
    description: 'Publicar links seguros para cada turma e receber respostas e arquivos pelo celular ou computador.',
    deliverables: ['Link por turma', 'Identificação do aluno', 'Envio de arquivos'],
  },
  {
    number: '03',
    title: 'Motor de correção por IA',
    description: 'Avaliar objetivos e discursivas, citar os critérios usados e sinalizar respostas duvidosas.',
    deliverables: ['Nota sugerida', 'Feedback explicado', 'Fila de exceções'],
  },
  {
    number: '04',
    title: 'Revisão e histórico',
    description: 'Professor revisa, libera o resultado e alimenta automaticamente a grade acadêmica do aluno.',
    deliverables: ['Revisão humana', 'Publicação da nota', 'Histórico acadêmico'],
  },
] as const;

export function ProvasTrabalhos() {
  return (
    <div className="min-h-full bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileCheck2 className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Provas e trabalhos</h1>
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                Esboço inicial
              </Badge>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Futuro ambiente próprio para criar avaliações, receber trabalhos e usar IA na correção. Esta primeira
              versão registra o escopo e o plano; ainda não coleta respostas, arquivos ou dados de alunos.
            </p>
          </div>
          <Button disabled className="gap-2 self-start" title="Disponível quando o editor de avaliações for implementado">
            <Plus className="h-4 w-4" /> Nova avaliação
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
                <Sparkles className="h-4 w-4 text-primary" />
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
                <BrainCircuit className="h-4 w-4 text-primary" />
                Fluxo planejado da avaliação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {[
                  ['1', 'Professor cria questões, gabarito e rubrica'],
                  ['2', 'Sistema publica um link seguro para a turma'],
                  ['3', 'Aluno responde ou envia o trabalho'],
                  ['4', 'IA sugere nota e feedback com justificativa'],
                  ['5', 'Professor revisa e libera o resultado'],
                  ['6', 'Nota entra no histórico acadêmico do aluno'],
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
                Na primeira versão operacional, a IA deverá sugerir a correção, mas o professor continuará responsável pela nota final e poderá revisar qualquer resposta.
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCheck2 className="h-4 w-4 text-primary" />
              Formatos previstos
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {FORMATOS.map(({ title, description, icon: Icon }) => (
              <div key={title} className="rounded-xl border border-border/60 p-4">
                <Icon className="mb-3 h-5 w-5 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Send className="h-4 w-4 text-primary" />
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

        <div className="grid gap-3 md:grid-cols-3">
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            <Scale className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p><strong className="text-foreground">Critério explícito:</strong> toda nota da IA precisa indicar qual item da rubrica justificou a pontuação.</p>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p><strong className="text-foreground">Acesso seguro:</strong> o aluno só poderá ver suas próprias avaliações, entregas, notas e feedbacks.</p>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p><strong className="text-foreground">Autoridade humana:</strong> professor revisa exceções e pode substituir a sugestão da IA com justificativa.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
