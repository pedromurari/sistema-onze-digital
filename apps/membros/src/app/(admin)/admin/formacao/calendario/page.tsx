import { getAllLives } from '@/lib/actions/lives'
import { FORMACAO_PRODUCT_ID } from '@/lib/constants'
import { FormacaoLivesClient } from './FormacaoLivesClient'

export const metadata = { title: 'Aulas ao vivo — Formação IDM' }

export default async function FormacaoCalendarioAdminPage() {
  const lives = await getAllLives(FORMACAO_PRODUCT_ID)
  return <FormacaoLivesClient initialLives={lives} />
}
