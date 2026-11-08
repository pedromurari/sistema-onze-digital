import { getAllBannerSlides } from '@/lib/actions/banners'
import { BannersClient } from './BannersClient'

export default async function BannersAdminPage() {
  const slides = await getAllBannerSlides()
  return <BannersClient initialSlides={slides} />
}
