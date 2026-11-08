import { getFormacaoLibrary } from '@/lib/formacao-queries'
import { BibliotecaAdminClient } from './BibliotecaAdminClient'

export const metadata = { title: 'Biblioteca — Formação IDM' }

export default async function BibliotecaAdminPage() {
  const files = await getFormacaoLibrary()
  return <BibliotecaAdminClient files={files} />
}
