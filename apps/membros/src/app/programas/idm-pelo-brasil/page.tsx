import { createClient } from '@/lib/supabase/server'
import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { StickyCTA } from '@/app/comecar/StickyCTA'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { IdmBrasilContent, type ProductData } from './IdmBrasilContent'
import { SiteFooter } from '@/components/marketing/SiteFooter'

const PRODUCT_SLUG = 'idm-pelo-brasil'

export const metadata = {
  title: 'IDM pelo Brasil — Workshops Presenciais · Instituto Despertamente',
  description: 'Imersão presencial de Psicanálise Integrativa e PNL em 4 dias. O IDM chega até a sua cidade.',
  openGraph: {
    title: 'IDM pelo Brasil — Workshop Presencial',
    description: 'Imersão presencial. 4 dias. Transformação real.',
  },
}

export default async function IdmPeloBrasilPage() {
  const sb = await createClient()
  const { data } = await sb
    .from('products')
    .select('price, original_price, highlights, cta_label, checkout_url')
    .eq('slug', PRODUCT_SLUG)
    .eq('is_published', true)
    .maybeSingle()

  const product: ProductData | null = data
    ? {
        price: data.price as number | null,
        original_price: data.original_price as number | null,
        highlights: data.highlights as string[] | null,
        cta_label: data.cta_label as string | null,
        checkout_url: data.checkout_url as string | null,
      }
    : null

  return (
    <div className="min-h-screen bg-[#080808] text-[#f0f0f0] overflow-x-hidden">
      <NavbarComecar />
      <WhatsAppButton />
      <StickyCTA />
      <CookieBanner />

      <IdmBrasilContent product={product} />

      <SiteFooter />
    </div>
  )
}
