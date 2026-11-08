import Link from 'next/link'
import Image from 'next/image'
import { Play, CheckCircle2, Clock, Lock } from 'lucide-react'
import type { Product, CourseProgress } from '@/types'

const TYPE_LABEL: Record<string, string> = {
  course:     'Curso',
  ebook:      'E-book',
  bundle:     'Bundle',
  mentorship: 'Mentoria',
  event:      'Evento',
}

interface CourseCardNetflixProps {
  product: Product
  progress?: CourseProgress
  href: string
  priority?: boolean
  // Produto que o aluno ainda não tem: aparece na vitrine, mas sem clique (ainda não há página de venda).
  locked?: boolean
}

function CardShell({ locked, href, children }: { locked: boolean; href: string; children: React.ReactNode }) {
  if (locked) {
    return (
      <div className="block group rounded-xl cursor-not-allowed select-none" aria-disabled="true" title="Em breve disponível">
        {children}
      </div>
    )
  }
  return (
    <Link
      href={href}
      className="block group focus-visible:outline-2 focus-visible:outline-[#FFB800] focus-visible:outline-offset-2 rounded-xl"
    >
      {children}
    </Link>
  )
}

export function CourseCardNetflix({ product, progress, href, priority = false, locked = false }: CourseCardNetflixProps) {
  const percent    = progress?.percent_complete ?? 0
  const completed  = progress?.completed_lessons ?? 0
  const total      = progress?.total_lessons ?? 0
  const isDone     = percent === 100
  const inProgress = percent > 0 && percent < 100
  const notStarted = percent === 0

  return (
    <CardShell locked={locked} href={href}>
      {/* Thumbnail */}
      <div className="relative overflow-hidden rounded-xl bg-[#0A1232]" style={{ aspectRatio: '2/3' }}>
        {product.thumbnail_url ? (
          <Image
            src={product.thumbnail_url}
            alt={product.title}
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
            className="object-cover object-top transition-transform duration-500 ease-out group-hover:scale-105"
            priority={priority}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A1232] to-[#0F1940] flex items-center justify-center">
            <span className="text-3xl font-bold text-[#FFB800]/30"
              style={{ fontFamily: 'var(--font-fraunces, Georgia, serif)' }}>
              IDM
            </span>
          </div>
        )}

        {/* Overlay base */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        {/* Badge produto */}
        {product.badge_label && (
          <span className="absolute top-2 left-2 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0D1638]"
            style={{ background: 'linear-gradient(135deg, #FFB800, #FFC933)' }}>
            {product.badge_label}
          </span>
        )}

        {/* Concluído */}
        {isDone && (
          <span className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-[#22c55e]/90 px-2 py-0.5 text-[10px] font-bold text-white">
            <CheckCircle2 className="h-2.5 w-2.5" /> Concluído
          </span>
        )}

        {locked ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0D1638]/65 backdrop-grayscale">
            <div className="h-11 w-11 rounded-full flex items-center justify-center border border-white/15 bg-black/40">
              <Lock className="h-5 w-5 text-white/70" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">Em breve</span>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="h-12 w-12 rounded-full flex items-center justify-center shadow-2xl"
              style={{ background: 'linear-gradient(135deg, #FFB800, #FFC933)' }}>
              <Play className="h-5 w-5 text-[#0D1638] fill-[#0D1638] ml-0.5" />
            </div>
          </div>
        )}

        {/* Progress bar */}
        {(inProgress || isDone) && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
            <div
              className="h-full"
              style={{
                width: `${percent}%`,
                background: isDone ? '#22c55e' : 'linear-gradient(90deg, #FFB800, #FFC933)',
              }}
            />
          </div>
        )}
      </div>

      {/* Texto */}
      <div className="mt-2.5 space-y-1 px-0.5">
        <h3 className={`font-semibold text-sm leading-snug line-clamp-2 transition-colors duration-200 ${locked ? 'text-white/45' : 'text-white group-hover:text-[#FFB800]'}`}>
          {product.title}
        </h3>
        <div className="flex items-center gap-1.5 text-white/30 text-xs">
          <span>{TYPE_LABEL[product.product_type] ?? 'Curso'}</span>
          {total > 0 && (
            <>
              <span className="text-white/15">·</span>
              {notStarted ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Não iniciado
                </span>
              ) : (
                <span>{completed}/{total}</span>
              )}
            </>
          )}
          {inProgress && (
            <>
              <span className="text-white/15">·</span>
              <span style={{ color: '#FFB800' }}>{percent}%</span>
            </>
          )}
        </div>
      </div>
    </CardShell>
  )
}
