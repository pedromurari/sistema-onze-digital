import Link from 'next/link'
import Image from 'next/image'
import { getTestimonials } from '@/lib/actions/store'
import { createClient } from '@/lib/supabase/server'
import { ComecarAnimated, type Programa } from './ComecarAnimated'
import { NavbarComecar } from './NavbarComecar'
import { WhatsAppButton } from './WhatsAppButton'
import { StickyCTA } from './StickyCTA'
import { CookieBanner } from './CookieBanner'
import { SiteFooter } from '@/components/marketing/SiteFooter'

export const metadata = {
  title: 'Instituto Despertamente — Transformação Real',
  description: 'Não é mais um curso. É o método que vai mudar como você se vê, se relaciona e age no mundo. Baseado em neurociência, psicanálise e PNL.',
  openGraph: {
    title: 'Instituto Despertamente — Transformação Real',
    description: 'Não é mais um curso. É o método que vai mudar como você se vê.',
    images: [{ url: 'https://images.unsplash.com/photo-1559757175-5700dde675bc?w=1200&q=80' }],
  },
}

const depoimentosFallback = [
  { nome: 'Ana Beatriz S.', papel: 'Aluna — Psicanálise Prática', texto: 'Eu tentei terapia por anos. O método IDM foi o único que me fez entender POR QUÊ eu agia do jeito que agia. Em 3 semanas mudei mais do que em 3 anos.', estrelas: 5 },
  { nome: 'Marcos Vinicius', papel: 'Aluno — NPA 2.0', texto: 'Nunca imaginei que padrões dos meus avós ainda me afetavam. Depois do NPA, sinto que finalmente sou eu mesmo.', estrelas: 5 },
  { nome: 'Fernanda Lima', papel: 'Aluna — Practitioner PNL', texto: 'A certificação foi incrível, mas o que ficou foi a transformação pessoal. Recomendo sem hesitar.', estrelas: 5 },
  { nome: 'Ricardo Almeida', papel: 'Aluno — Practitioner PNL', texto: 'O conteúdo é denso mas aplicável imediatamente. Já usei em reuniões de trabalho e na minha vida pessoal. Mudança real.', estrelas: 5 },
  { nome: 'Juliana C.', papel: 'Aluna — Psicanálise Prática', texto: 'Finalmente entendi por que sabotava minhas relações. O método é diferente de tudo que já fiz. Recomendo a todos.', estrelas: 5 },
  { nome: 'Paulo R.', papel: 'Aluno — NPA 2.0', texto: 'Comprei com ceticismo e saí transformado. Os padrões que identifiquei explicaram 20 anos de comportamento. Incrível.', estrelas: 5 },
]

export default async function ComecarPage() {
  const sb = await createClient()
  const [testimonials, { data: productsRaw }] = await Promise.all([
    getTestimonials(),
    sb.from('products').select('id, title, slug, short_description, thumbnail_url').eq('is_published', true).order('sort_order'),
  ])

  const depos = testimonials.length > 0
    ? testimonials.slice(0, 6).map(t => ({
        nome: t.author_name,
        papel: t.author_role ?? '',
        texto: t.content,
        estrelas: t.rating ?? 5,
      }))
    : depoimentosFallback

  const programas: Programa[] = (productsRaw ?? []).map(p => ({
    id: p.id as string,
    title: p.title as string,
    slug: p.slug as string,
    short_description: p.short_description as string | null,
    thumbnail_url: p.thumbnail_url as string | null,
  }))

  return (
    <div className="min-h-screen bg-[#0D1638] text-white overflow-x-hidden">

      {/* Navbar */}
      <NavbarComecar />

      {/* Floating WhatsApp button (desktop) */}
      <WhatsAppButton />

      {/* Sticky CTA bar (mobile) */}
      <StickyCTA />

      {/* Cookie banner (LGPD) */}
      <CookieBanner />

      {/* All animated sections */}
      <ComecarAnimated depos={depos} programas={programas} />

      {/* ── FOOTER ── */}
      <SiteFooter />
    </div>
  )
}
