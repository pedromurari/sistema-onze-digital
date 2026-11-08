import { notFound, redirect } from 'next/navigation'
import { getCachedUser, getCachedProfile } from '@/lib/supabase/cached-user'
import { getFormacaoModulesForStudent, isEnrolledInFormacao, getModuleTasksForStudent, getMyFormacaoTurma } from '@/lib/formacao-queries'
import { FormacaoPlayerClient } from './FormacaoPlayerClient'

export const metadata = { title: 'Aula — Formação em Psicanálise' }

export default async function FormacaoAulaPage({
  params,
}: {
  params: Promise<{ lessonId: string }>
}) {
  const { lessonId } = await params
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const profile = await getCachedProfile(user.id)
  const isAdmin = profile?.role === 'admin'

  const enrolled = isAdmin || (await isEnrolledInFormacao())
  if (!enrolled) redirect('/formacao')

  const modules = await getFormacaoModulesForStudent()
  const flat = modules.flatMap((m) =>
    m.lessons.map((l) => ({
      ...l,
      moduleTitle: m.title,
      moduleId: m.moduleId,
      materials: m.materials.filter((mt) => mt.lesson_id === l.id || (!mt.lesson_id && mt.module_id === m.moduleId)),
    }))
  )
  const index = flat.findIndex((l) => l.id === lessonId)
  if (index === -1) notFound()

  const [tasks, turma] = await Promise.all([
    getModuleTasksForStudent(flat[index].moduleId),
    getMyFormacaoTurma(),
  ])

  return (
    <FormacaoPlayerClient
      lesson={flat[index]}
      prevId={index > 0 ? flat[index - 1].id : null}
      nextId={index < flat.length - 1 ? flat[index + 1].id : null}
      tasks={tasks}
      groupUrl={turma?.group_url ?? null}
    />
  )
}
