'use client'

/**
 * Lista do /blog: post em destaque (o mais recente) grande, com capa, e os
 * demais em grade com capa, filtráveis por categoria. Visual alinhado com a
 * página de cada post (banner, cards com zoom na capa, entrada animada).
 */

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Revela } from '@/components/blog/PostVisual'

export type PostResumo = {
  slug: string
  titulo: string
  categoria: string
  resumo: string
  data: string
  dataFmt: string
  leitura: number
  capa?: string
}

function Capa({ src, alto }: { src?: string; alto: string }) {
  return (
    <div className="relative overflow-hidden" style={{ height: alto, background: 'var(--fds-deep)' }}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-[900ms] group-hover:scale-[1.06]" />
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,9,13,0) 40%, rgba(8,9,13,.75) 100%)' }} />
    </div>
  )
}

export function BlogLista({ posts }: { posts: PostResumo[] }) {
  const categorias = ['Todos', ...Array.from(new Set(posts.map(p => p.categoria)))]
  const [filtro, setFiltro] = useState('Todos')
  const lista = filtro === 'Todos' ? posts : posts.filter(p => p.categoria === filtro)
  const [destaque, ...resto] = lista

  return (
    <>
      {/* Filtro por tema */}
      <div className="flex flex-wrap gap-2">
        {categorias.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => setFiltro(c)}
            className="fds-small transition-colors"
            style={{
              padding: '8px 16px',
              borderRadius: 999,
              border: `1px solid ${filtro === c ? 'var(--fds-accent)' : 'var(--fds-line)'}`,
              color: filtro === c ? 'var(--fds-accent-ink)' : 'var(--fds-ink-2)',
              background: filtro === c ? 'var(--fds-accent)' : 'transparent',
              fontWeight: filtro === c ? 600 : 400,
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Destaque */}
      {destaque && (
        <Revela key={`d-${destaque.slug}`}>
          <Link href={`/blog/${destaque.slug}`} className="fds-card post-card group mt-10 grid overflow-hidden lg:grid-cols-[1.25fr_1fr]" style={{ padding: 0 }}>
            <div className="relative min-h-[260px] overflow-hidden lg:min-h-[420px]" style={{ background: 'var(--fds-deep)' }}>
              {destaque.capa && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={destaque.capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-[900ms] group-hover:scale-[1.05]" />
              )}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(8,9,13,0) 55%, rgba(8,9,13,.6) 100%)' }} />
              <span className="fds-meta absolute left-5 top-5" style={{ background: 'var(--fds-accent)', color: 'var(--fds-accent-ink)', padding: '5px 10px', borderRadius: 4 }}>
                Mais recente
              </span>
            </div>
            <div className="flex flex-col justify-center" style={{ padding: 'var(--fds-8)' }}>
              <p className="fds-eyebrow">{destaque.categoria}</p>
              <h2 className="fds-h2 mt-4" style={{ fontSize: 'clamp(1.75rem, 3vw, 2.4rem)' }}>{destaque.titulo}</h2>
              <p className="fds-body mt-5">{destaque.resumo}</p>
              <p className="fds-meta mt-6">
                <time dateTime={destaque.data}>{destaque.dataFmt}</time> · {destaque.leitura} min de leitura
              </p>
              <span className="mt-8 inline-flex items-center gap-2 font-semibold" style={{ color: 'var(--fds-accent)' }}>
                Ler o texto <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        </Revela>
      )}

      {/* Demais */}
      {resto.length > 0 && (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {resto.map((p, i) => (
            <Revela key={p.slug} atraso={i * 120}>
              <Link href={`/blog/${p.slug}`} className="fds-card post-card group flex h-full flex-col overflow-hidden" style={{ padding: 0 }}>
                <Capa src={p.capa} alto="210px" />
                <div className="flex flex-1 flex-col" style={{ padding: 'var(--fds-6)' }}>
                  <p className="fds-eyebrow">{p.categoria}</p>
                  <h3 className="mt-3" style={{ fontFamily: 'var(--fds-serif)', fontSize: '1.4rem', fontWeight: 600, lineHeight: 1.25, color: 'var(--fds-ink)' }}>
                    {p.titulo}
                  </h3>
                  <p className="fds-small mt-3 flex-1">{p.resumo}</p>
                  <p className="fds-meta mt-6">
                    <time dateTime={p.data}>{p.dataFmt}</time> · {p.leitura} min
                  </p>
                </div>
              </Link>
            </Revela>
          ))}
        </div>
      )}
    </>
  )
}
