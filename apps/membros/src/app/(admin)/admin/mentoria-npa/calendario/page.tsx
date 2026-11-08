import { getAllLives } from '@/lib/actions/lives'
import { MENTORIA_NPA_PRODUCT_ID } from '@/lib/constants'
import { MentoriaNpaLivesClient } from './MentoriaNpaLivesClient'

export const metadata = { title: 'Encontros ao vivo — Mentoria NPA' }

export default async function MentoriaNpaCalendarioAdminPage() {
  const lives = await getAllLives(MENTORIA_NPA_PRODUCT_ID)
  return <MentoriaNpaLivesClient initialLives={lives} />
}
