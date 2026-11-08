import { getFormacaoModulesAdmin, getTurmas, getTurmaModuleReleases } from '@/lib/formacao-queries'
import { AdminFormacaoClient } from './AdminFormacaoClient'

export const metadata = { title: 'Formação IDM — Admin' }

export default async function AdminFormacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ turma?: string }>
}) {
  const { turma: turmaId } = await searchParams
  const [modules, turmas] = await Promise.all([getFormacaoModulesAdmin(), getTurmas()])
  const releases = turmaId ? await getTurmaModuleReleases(turmaId) : []

  return (
    <AdminFormacaoClient
      modules={modules}
      turmas={turmas}
      selectedTurmaId={turmaId ?? null}
      releases={releases}
    />
  )
}
