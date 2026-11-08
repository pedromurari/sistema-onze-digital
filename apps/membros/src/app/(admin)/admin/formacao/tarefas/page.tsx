import { getFormacaoTasksAdmin, getFormacaoModulesAdmin } from '@/lib/formacao-queries'
import { TarefasClient } from './TarefasClient'

export const metadata = { title: 'Tarefas — Formação IDM' }

export default async function TarefasPage() {
  const [tasks, modules] = await Promise.all([getFormacaoTasksAdmin(), getFormacaoModulesAdmin()])
  return <TarefasClient tasks={tasks} modules={modules.map((m) => ({ id: m.id, title: m.title }))} />
}
