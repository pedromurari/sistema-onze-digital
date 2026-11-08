import { notFound } from 'next/navigation'
import { getFormacaoTaskSubmissions, getFormacaoTasksAdmin } from '@/lib/formacao-queries'
import { SubmissionsReviewClient } from './SubmissionsReviewClient'

export const metadata = { title: 'Revisão de tarefa — Formação IDM' }

export default async function TaskSubmissionsPage({
  params,
}: {
  params: Promise<{ taskId: string }>
}) {
  const { taskId } = await params
  const [submissions, tasks] = await Promise.all([
    getFormacaoTaskSubmissions(taskId),
    getFormacaoTasksAdmin(),
  ])
  const task = tasks.find((t) => t.id === taskId)
  if (!task) notFound()

  return <SubmissionsReviewClient task={task} submissions={submissions} />
}
