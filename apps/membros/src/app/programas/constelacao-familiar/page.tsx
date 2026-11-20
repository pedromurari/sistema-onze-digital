import { createClient } from '@/lib/supabase/server'
import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { StickyCTA } from '@/app/comecar/StickyCTA'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { ConstelacaoContent, type ProductData } from './ConstelacaoContent'
import { SiteFooter } from '@/components/marketing/SiteFooter'

const PRODUCT_SLUG = 'constelacao-familiar'

export const metadata = {
  title: 'Despertar Sistêmico — Formação em Constelação Familiar Sistêmica · Instituto Despertamente',
  description:
    'Formação em Constelação Familiar Sistêmica. 3 meses, 8 módulos, 12 aulas. Encontros ao vivo + plataforma de aprendizagem.',
  openGraph: {
    title: 'Despertar Sistêmico — Formação em Constelação Familiar Sistêmica',
    description: 'Reconhecer a origem. Compreender os vínculos. Ocupar o próprio lugar. Escolher um novo movimento.',
  },
}

export default async function ConstelacaoFamiliarPage() {
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

      <ConstelacaoContent product={product} />

      <SiteFooter />
    </div>
  )
}
