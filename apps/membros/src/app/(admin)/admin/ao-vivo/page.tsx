import { getAllLives } from '@/lib/actions/lives'
import { LivesClient } from './LivesClient'

export const metadata = { title: 'Ao Vivo — Admin IDM' }

export default async function AdminAoVivoPage() {
  const lives = await getAllLives()
  return <LivesClient initialLives={lives} />
}
