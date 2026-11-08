import { listNpaEventosAdmin } from '@/lib/actions/npaPresencial'
import { NpaPresencialAdminClient } from './NpaPresencialAdminClient'

export default async function NpaPresencialAdminPage() {
  const eventos = await listNpaEventosAdmin()
  return <NpaPresencialAdminClient initialEventos={eventos} />
}
