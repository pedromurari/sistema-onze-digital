import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export interface GradeInput {
  taskTitle: string
  taskInstructions: string
  rubric: string
  lessonContent: string
  moduleTitle: string
  studentAnswer: string
}

export interface GradeResult {
  score: number
  feedback: string
}

const GRADE_TOOL: Anthropic.Tool = {
  name: 'submit_grade',
  description: 'Envia a nota sugerida (0 a 10) e o feedback para a resposta do aluno.',
  input_schema: {
    type: 'object',
    properties: {
      score: { type: 'number', description: 'Nota de 0 a 10, pode usar meio ponto.' },
      feedback: { type: 'string', description: 'Feedback construtivo para o aluno, em português, 2-4 frases.' },
    },
    required: ['score', 'feedback'],
  },
}

export async function gradeSubmission(input: GradeInput): Promise<GradeResult> {
  const hasRubric = input.rubric.trim().length > 0

  const prompt = `Você é um professor de psicanálise corrigindo a tarefa de um aluno da Formação em Psicanálise Integrativa do Instituto Despertamente.

Módulo: ${input.moduleTitle}
Tarefa: ${input.taskTitle}
Instruções da tarefa: ${input.taskInstructions}

${hasRubric
  ? `Gabarito / critério de correção (use como referência principal):\n${input.rubric}`
  : 'Não há gabarito específico — baseie a correção no conteúdo da aula abaixo.'}

${input.lessonContent ? `Conteúdo da aula (apoio/contexto):\n${input.lessonContent}` : ''}

Resposta do aluno:
${input.studentAnswer}

Avalie a resposta do aluno considerando profundidade teórica, coerência com o conteúdo do módulo e clareza. Dê uma nota de 0 a 10 e um feedback construtivo e específico, em português.`

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 2048,
    tools: [GRADE_TOOL],
    tool_choice: { type: 'tool', name: 'submit_grade' },
    messages: [{ role: 'user', content: prompt }],
  })

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  if (!toolUse) throw new Error('A IA não retornou uma avaliação estruturada.')

  const result = toolUse.input as { score: number; feedback: string }
  return { score: Math.max(0, Math.min(10, result.score)), feedback: result.feedback }
}
