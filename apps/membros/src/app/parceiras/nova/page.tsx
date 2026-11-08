import { getPartnerThemes } from '@/lib/actions/parceiras'
import { NovaParceiraForm } from '@/components/admin/NovaParceiraForm'

export default async function NovaParceiraPage() {
  const themes = await getPartnerThemes()
  return <NovaParceiraForm themes={themes} />
}
