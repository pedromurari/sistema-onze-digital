'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Play, Info, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { BuyButton } from '@/components/marketing/BuyButton'
import { productHref } from '@/lib/product-href'
import type { Product, CourseProgress } from '@/types'
import type { BannerSlide } from '@/lib/actions/banners'

const TYPE_LABEL: Record<string, string> = {
  course: 'Curso', ebook: 'E-book', bundle: 'Bundle',
  mentorship: 'Mentoria', event: 'Evento',
}

interface ProductHeroSlide {
  kind: 'product'
  product: Product
  enrolled: boolean
  progress?: CourseProgress
  lastLessonHref?: string
}

interface BannerHeroSlide {
  kind: 'banner'
  banner: BannerSlide
}

export type HeroSlideItem = ProductHeroSlide | BannerHeroSlide

interface LegacyHeroSlide {
  product: Product
  enrolled: boolean
  progress?: CourseProgress
  lastLessonHref?: string
}

type AnySlide = HeroSlideItem | LegacyHeroSlide

function normalise(s: AnySlide): HeroSlideItem {
  if ('kind' in s) return s
  return { kind: 'product', ...s }
}

interface HeroCarouselProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slides: any[]
  autoPlayInterval?: number
}

export function HeroCarousel({ slides: rawSlides, autoPlayInterval = 7000 }: HeroCarouselProps) {
  const slides: HeroSlideItem[] = (rawSlides as AnySlide[]).map(normalise)
  const [current, setCurrent] = useState(0)
  const shouldReduce = useReducedMotion()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const next = useCallback(() => setCurrent(i => (i + 1) % slides.length), [slides.length])
  const prev = useCallback(() => setCurrent(i => (i - 1 + slides.length) % slides.length), [slides.length])

  // Auto-play — nunca pausa no hover
  useEffect(() => {
    if (shouldReduce || slides.length <= 1) return
    intervalRef.current = setInterval(next, autoPlayInterval)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [shouldReduce, slides.length, next, autoPlayInterval])

  // Reinicia timer ao mudar manualmente
  function goTo(i: number) {
    setCurrent(i)
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (!shouldReduce && slides.length > 1) {
      intervalRef.current = setInterval(next, autoPlayInterval)
    }
  }

  function handlePrev() {
    prev()
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (!shouldReduce && slides.length > 1) {
      intervalRef.current = setInterval(next, autoPlayInterval)
    }
  }

  function handleNext() {
    next()
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (!shouldReduce && slides.length > 1) {
      intervalRef.current = setInterval(next, autoPlayInterval)
    }
  }

  if (!slides.length) return null

  const slide = slides[current]
  const bgImage = slide.kind === 'banner' ? slide.banner.image_url : slide.product.thumbnail_url
  const bgGradient = slide.kind === 'banner' ? (slide.banner.gradient ?? undefined) : undefined

  return (
    <section
      className="relative w-full overflow-hidden bg-[#0D1638]"
      style={{ height: 'clamp(340px, 60vw, 600px)' }}
      aria-roledescription="carrossel"
      aria-label="Destaques"
    >
      {/* Fundo */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`bg-${current}`}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: shouldReduce ? 1 : 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduce ? 0 : 0.8, ease: 'easeOut' }}
        >
          {bgImage ? (
            <Image
              src={bgImage}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center"
            />
          ) : bgGradient ? (
            <div className="absolute inset-0" style={{ background: bgGradient }} />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#0A1232] to-[#0F1940]" />
          )}
          {/* Gradientes de leitura — sólido até ~58% pra cobrir texto embutido na arte, revelando só a imagem de impacto à direita */}
          <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(to right, #0D1638 0%, #0D1638 42%, rgba(13,22,56,0.94) 58%, rgba(13,22,56,0.55) 72%, transparent 92%)' }} />
          <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(to top, #0D1638 0%, rgba(13,22,56,0.4) 40%, transparent 70%)' }} />
        </motion.div>
      </AnimatePresence>

      {/* Conteúdo */}
      <div className="relative h-full flex items-end pb-14 px-5 sm:px-10 lg:px-16">
        <AnimatePresence mode="wait">
          <motion.div
            key={`content-${current}`}
            className="max-w-xl space-y-4"
            initial={{ opacity: 0, y: shouldReduce ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: shouldReduce ? 0 : -10 }}
            transition={{ duration: shouldReduce ? 0 : 0.5, ease: 'easeOut' }}
          >
            {slide.kind === 'banner'
              ? <BannerContent slide={slide.banner} />
              : <ProductContent slide={slide} />
            }
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Setas — visíveis em desktop */}
      {slides.length > 1 && (
        <>
          <button
            onClick={handlePrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white border border-white/10 opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-black/70"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={handleNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white border border-white/10 opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-black/70"
            aria-label="Próximo"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Dots indicadores */}
      {slides.length > 1 && (
        <div className="absolute bottom-5 right-5 sm:right-10 flex items-center gap-2" role="tablist">
          {slides.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === current}
              aria-label={`Slide ${i + 1}`}
              onClick={() => goTo(i)}
              className="transition-all duration-400 rounded-full"
              style={{
                width: i === current ? '24px' : '6px',
                height: '6px',
                background: i === current ? '#FFB800' : 'rgba(255,255,255,0.3)',
              }}
            />
          ))}
        </div>
      )}

      {/* Barra de progresso — só no desktop */}
      {slides.length > 1 && !shouldReduce && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5">
          <motion.div
            key={`progress-${current}`}
            className="h-full"
            style={{ background: 'linear-gradient(90deg, #FFB800, #FFC933)' }}
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: autoPlayInterval / 1000, ease: 'linear' }}
          />
        </div>
      )}
    </section>
  )
}

function BannerContent({ slide }: { slide: BannerSlide }) {
  return (
    <>
      {slide.badge_label && (
        <div className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-widest">
          <span className="text-[#FFB800] opacity-70">✦</span>
          <span className="rounded-full px-3 py-1 font-bold text-[#0D1638]"
            style={{ background: 'linear-gradient(135deg, #FFB800, #FFC933)' }}>
            {slide.badge_label}
          </span>
        </div>
      )}
      <h1
        className="font-bold text-white leading-[1.1]"
        style={{ fontSize: 'clamp(1.75rem, 4.5vw, 3rem)', fontFamily: 'var(--font-fraunces, Georgia, serif)' }}
      >
        {slide.title}
      </h1>
      {slide.subtitle && (
        <p className="text-white/60 leading-relaxed max-w-md" style={{ fontSize: 'clamp(0.875rem, 1.5vw, 1.05rem)' }}>
          {slide.subtitle}
        </p>
      )}
      {slide.cta_url && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link
            href={slide.cta_url}
            target={slide.open_in_new ? '_blank' : undefined}
            rel={slide.open_in_new ? 'noopener noreferrer' : undefined}
            className="inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold transition-all hover:scale-[1.03] active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #FFB800, #FFC933)', color: '#0D1638', boxShadow: '0 8px 28px rgba(255,184,0,0.35)' }}
          >
            {slide.cta_label ?? 'Saiba mais'}
            {slide.open_in_new && <ExternalLink className="h-3.5 w-3.5" />}
          </Link>
        </div>
      )}
    </>
  )
}

function ProductContent({ slide }: { slide: ProductHeroSlide }) {
  const { product, enrolled, progress, lastLessonHref } = slide
  return (
    <>
      <div className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-widest">
        <span className="text-[#FFB800] opacity-70">✦</span>
        <span className="text-[#FFB800]">{TYPE_LABEL[product.product_type] ?? 'Curso'}</span>
        {product.badge_label && (
          <>
            <span className="opacity-30 text-white">·</span>
            <span className="rounded-full px-3 py-1 font-bold text-[#0D1638]"
              style={{ background: 'linear-gradient(135deg, #FFB800, #FFC933)' }}>
              {product.badge_label}
            </span>
          </>
        )}
      </div>
      <h1
        className="font-bold text-white leading-[1.1] line-clamp-2"
        style={{ fontSize: 'clamp(1.75rem, 4.5vw, 3rem)', fontFamily: 'var(--font-fraunces, Georgia, serif)' }}
      >
        {product.title}
      </h1>
      {(product.short_description || product.description) && (
        <p className="text-white/60 leading-relaxed line-clamp-2 max-w-md" style={{ fontSize: 'clamp(0.875rem, 1.5vw, 1.05rem)' }}>
          {product.short_description ?? product.description}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        {enrolled ? (
          <Link
            href={lastLessonHref ?? productHref(product.slug)}
            className="inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold transition-all hover:scale-[1.03] active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #FFB800, #FFC933)', color: '#0D1638', boxShadow: '0 8px 28px rgba(255,184,0,0.35)' }}
          >
            <Play className="h-4 w-4 fill-current" />
            {(progress?.percent_complete ?? 0) > 0 ? 'Continuar' : 'Começar agora'}
          </Link>
        ) : (
          <BuyButton
            productId={product.id}
            label={product.cta_label ?? 'Quero agora'}
            checkoutUrl={product.checkout_url}
            variant="solid"
          />
        )}
        <Link
          href={`/cursos/${product.slug}`}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm px-5 py-3.5 text-sm font-semibold text-white hover:bg-white/15 transition-all"
        >
          <Info className="h-4 w-4" /> Saiba mais
        </Link>
      </div>
    </>
  )
}
