import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  DEMO_PRODUCTS, DEMO_PROGRESS,
} from '@/lib/demo-data'
import { getFeaturedProduct, getUpsellProducts } from '@/lib/actions/store'
import { getBannerSlides } from '@/lib/actions/banners'
import { HeroCarousel } from '@/components/ui/HeroCarouselLazy'
import { CourseCarousel } from '@/components/ui/CourseCarousel'
import { PromoBanner } from '@/components/ui/PromoBanner'
import type { CourseProgress, Profile } from '@/types'

export const metadata = { title: 'Início — Instituto Despertamente' }
import type { HeroSlideItem } from '@/components/ui/HeroCarousel'

type EnrollmentItem = {
  id: string
  product_id: string
  products: {
    id: string; slug: string; title: string; description: string | null
    short_description: string | null; thumbnail_url: string | null
    product_type: string; badge_label: string | null
    price: number | null; original_price: number | null
    currency: string; payment_type: string; cta_label: string | null
    highlights: string[] | null; checkout_url: string | null
    is_featured: boolean; is_published: boolean; sort_order: number
    created_by: string | null; created_at: string; updated_at: string
  } | null
}

function SectionDivider() {
  return (
    <div className="px-4 sm:px-6 lg:px-10">
      <div className="h-px w-full" style={{ background: 'linear-gradient(to right, transparent, rgba(255,184,0,0.12), transparent)' }} />
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

  let enrollments: EnrollmentItem[] = []
  let progressMap: Record<string, CourseProgress> = {}
  let profile: Profile | null = null

  if (isDemo) {
    profile = { id: user.id, full_name: 'Demo', avatar_url: null, bio: null, role: 'student', created_at: '', updated_at: '' }
    enrollments = DEMO_PRODUCTS.map(p => ({
      id: `enr-${p.id}`, product_id: p.id,
      products: { ...p, product_type: p.product_type as string },
    }))
    progressMap = Object.fromEntries(DEMO_PROGRESS.map(p => [p.product_id, p]))
  } else {
    const [profileRes, enrollmentsRes, progressRes] = await Promise.all([
      sb.from('profiles').select('*').eq('id', user.id).single(),
      sb.from('enrollments').select(`
        id, product_id,
        products (id, slug, title, description, short_description, thumbnail_url,
                 product_type, badge_label, price, original_price, currency,
                 payment_type, cta_label, highlights, checkout_url, is_featured,
                 is_published, sort_order, created_by, created_at, updated_at)
      `).eq('user_id', user.id).eq('is_active', true),
      sb.from('course_progress').select('*').eq('user_id', user.id),
    ])
    profile = profileRes.data
    enrollments = enrollmentsRes.data ?? []
    progressMap = Object.fromEntries(
      ((progressRes.data ?? []) as CourseProgress[]).map((p: CourseProgress) => [p.product_id, p])
    )
  }

  if (!profile) redirect('/login')

  const enrolled = enrollments.filter(e => e.products)
  const inProgress = enrolled.filter(e => {
    const p = progressMap[e.product_id]
    return p && p.percent_complete > 0 && p.percent_complete < 100
  })
  const notStarted = enrolled.filter(e => {
    const p = progressMap[e.product_id]
    return !p || p.percent_complete === 0
  })
  const completed = enrolled.filter(e => progressMap[e.product_id]?.percent_complete === 100)

  const enrolledIds = enrolled.map(e => e.product_id)
  const [upsellProducts, featuredProduct, herobannerSlides, promoSlides] = await Promise.all([
    isDemo ? Promise.resolve([]) : getUpsellProducts(enrolledIds),
    isDemo ? Promise.resolve(null) : getFeaturedProduct(),
    isDemo ? Promise.resolve([]) : getBannerSlides('hero'),
    isDemo ? Promise.resolve([]) : getBannerSlides('promo'),
  ])

  const heroSlides: HeroSlideItem[] = herobannerSlides.length > 0
    ? herobannerSlides.map(b => ({ kind: 'banner' as const, banner: b }))
    : ([
        ...inProgress.slice(0, 3).map(e => ({
          kind: 'product' as const,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          product: e.products! as unknown as any,
          enrolled: true,
          progress: progressMap[e.product_id],
        })),
        // Produto em destaque que o aluno não tem não vira slide (levaria à compra, que ainda não existe).
        ...(inProgress.length === 0 ? notStarted.slice(0, 2).map(e => ({
          kind: 'product' as const,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          product: e.products! as unknown as any,
          enrolled: true,
          progress: progressMap[e.product_id],
        })) : []),
      ] as HeroSlideItem[]).slice(0, 4)

  const demoHeroSlides: HeroSlideItem[] = isDemo
    ? DEMO_PRODUCTS.slice(0, 3).map((p, i) => ({
        kind: 'product' as const,
        product: p,
        enrolled: true,
        progress: DEMO_PROGRESS[i],
      }))
    : []

  const finalHeroSlides = isDemo ? demoHeroSlides : heroSlides

  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'Bem-vindo'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  const hasContent = enrolled.length > 0

  return (
    <div className="min-h-screen bg-[#0D1638]">

      {/* Hero Carousel */}
      {finalHeroSlides.length > 0 && (
        <HeroCarousel slides={finalHeroSlides} />
      )}

      {/* Saudação rápida logo após o hero */}
      {hasContent && (
        <div className="px-4 sm:px-6 lg:px-10 pt-8 pb-2">
          <p className="text-white/40 text-sm">
            {greeting}, <span className="text-[#FFB800] font-semibold">{firstName}</span>
          </p>
        </div>
      )}

      {/* Conteúdo principal */}
      <div className="py-6 pb-24 md:pb-12 space-y-0">

        {/* Continue assistindo */}
        {inProgress.length > 0 && (
          <>
            <div className="py-6">
              <CourseCarousel
                title="Continue assistindo"
                subtitle="Retome de onde parou"
                items={inProgress.map(e => ({
                  product: e.products! as unknown as Parameters<typeof CourseCarousel>[0]['items'][0]['product'],
                  progress: progressMap[e.product_id],
                }))}
                showAllHref="/cursos?filtro=em-andamento"
              />
            </div>
            <SectionDivider />
          </>
        )}

        {/* Seção de propaganda — primeiro bloco */}
        {promoSlides.length > 0 && (
          <>
            <div className="py-8 px-4 sm:px-6 lg:px-10">
              <PromoBanner slides={promoSlides.slice(0, 2)} />
            </div>
            <SectionDivider />
          </>
        )}

        {/* Cursos não iniciados */}
        {notStarted.length > 0 && (
          <>
            <div className="py-6">
              <CourseCarousel
                title="Seus cursos"
                subtitle="Prontos para começar"
                items={notStarted.map(e => ({
                  product: e.products! as unknown as Parameters<typeof CourseCarousel>[0]['items'][0]['product'],
                  progress: progressMap[e.product_id],
                }))}
                showAllHref="/cursos"
              />
            </div>
            <SectionDivider />
          </>
        )}

        {/* Upsell — expanda sua jornada */}
        {upsellProducts.length > 0 && (
          <>
            <div className="py-6">
              {/* Sem página de venda por enquanto: aparecem na vitrine, mas bloqueados e sem link. */}
              <CourseCarousel
                title="Expanda sua jornada"
                subtitle="Em breve disponíveis para você"
                items={upsellProducts.map(p => ({ product: p, locked: true }))}
              />
            </div>
            <SectionDivider />
          </>
        )}

        {/* Seção de propaganda — segundo bloco */}
        {promoSlides.length > 2 && (
          <>
            <div className="py-8 px-4 sm:px-6 lg:px-10">
              <PromoBanner slides={promoSlides.slice(2, 4)} />
            </div>
            <SectionDivider />
          </>
        )}

        {/* Concluídos */}
        {completed.length > 0 && (
          <div className="py-6">
            <CourseCarousel
              title="Concluídos"
              subtitle="Seus certificados conquistados"
              items={completed.map(e => ({
                product: e.products! as unknown as Parameters<typeof CourseCarousel>[0]['items'][0]['product'],
                progress: progressMap[e.product_id],
              }))}
              showAllHref="/certificados"
            />
          </div>
        )}

        {/* Estado vazio */}
        {enrolled.length === 0 && (
          <div className="px-4 sm:px-6 lg:px-10 py-24 text-center space-y-6">
            <div
              className="w-20 h-20 rounded-3xl mx-auto flex items-center justify-center"
              style={{ background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.15)' }}
            >
              <span className="text-3xl">🎓</span>
            </div>
            <div className="space-y-2">
              <p className="text-white font-semibold text-xl">Comece sua jornada</p>
              <p className="text-white/50 text-sm max-w-xs mx-auto">
                Seus cursos aparecem aqui assim que o acesso for liberado.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
