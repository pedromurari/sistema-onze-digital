import { getAllLives } from '@/lib/actions/lives'
import { MENTORIA_NPS_PRODUCT_ID } from '@/lib/constants'
import { MentoriaNpaLivesClient } from '../../mentoria-npa/calendario/MentoriaNpaLivesClient'

export const metadata = { title: 'Encontros ao vivo — Mentoria NPS' }

export default async function MentoriaNpsCalendarioAdminPage() {
  const lives = await getAllLives(MENTORIA_NPS_PRODUCT_ID)
  return <MentoriaNpaLivesClient initialLives={lives} productId={MENTORIA_NPS_PRODUCT_ID} nomeProduto="Mentoria NPS" />
}
