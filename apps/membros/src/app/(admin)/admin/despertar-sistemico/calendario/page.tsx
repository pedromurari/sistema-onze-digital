import { getAllLives } from '@/lib/actions/lives'
import { DESPERTAR_SISTEMICO_PRODUCT_ID } from '@/lib/constants'
import { MentoriaNpaLivesClient } from '../../mentoria-npa/calendario/MentoriaNpaLivesClient'

export const metadata = { title: 'Encontros ao vivo — Despertar Sistêmico' }

export default async function DespertarSistemicoCalendarioAdminPage() {
  const lives = await getAllLives(DESPERTAR_SISTEMICO_PRODUCT_ID)
  return <MentoriaNpaLivesClient initialLives={lives} productId={DESPERTAR_SISTEMICO_PRODUCT_ID} nomeProduto="Despertar Sistêmico" />
}
