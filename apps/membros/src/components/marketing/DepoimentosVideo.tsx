'use client'

/**
 * Faixa de depoimentos em vídeo, servidos do nosso R2 (nunca embed de
 * YouTube -- regra do Pedro). Os vídeos são verticais (9:16): o card mostra a
 * capa e o player só monta no clique, pra página não baixar todos de uma vez.
 */

import { useEffect, useState } from 'react'
import { Play, X } from 'lucide-react'

export const R2_DEPOIMENTOS =
  'https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev/site/depoimentos'

/** Ids dos Shorts originais, usados como nome dos arquivos no R2. */
export const DEPOIMENTOS_VIDEO = [
  'wDQiV0VoBT4',
  'D4xbxCXSWoM',
  'g5-wCsj1D_0',
  'PxDfmS4vvM8',
  'B_lpIOk1RQo',
  'aYncgEhrXgs',
]

export function DepoimentosVideo({ ids = DEPOIMENTOS_VIDEO }: { ids?: string[] }) {
  const [aberto, setAberto] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    const fecha = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(null)
    document.addEventListener('keydown', fecha)
    return () => document.removeEventListener('keydown', fecha)
  }, [aberto])

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {ids.map((id, i) => (
          <button
            key={id}
            type="button"
            onClick={() => setAberto(id)}
            className="group relative overflow-hidden text-left"
            style={{ borderRadius: 10, border: '1px solid var(--fds-line)', aspectRatio: '9 / 16' }}
            aria-label={`Assistir depoimento ${i + 1} de aluno do Instituto`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${R2_DEPOIMENTOS}/${id}.jpg`}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <span
              className="absolute inset-0"
              style={{ background: 'linear-gradient(180deg, rgba(8,9,13,0) 45%, rgba(8,9,13,0.85) 100%)' }}
            />
            <span
              className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
              style={{ background: 'var(--fds-accent)', color: 'var(--fds-accent-ink)' }}
            >
              <Play className="h-5 w-5 translate-x-px" fill="currentColor" />
            </span>
            <span className="fds-meta absolute bottom-3 left-3" style={{ color: 'var(--fds-ink)' }}>
              Aluno IDM
            </span>
          </button>
        ))}
      </div>

      {aberto && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setAberto(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Depoimento em vídeo"
        >
          <div className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setAberto(null)}
              className="mb-3 ml-auto flex items-center gap-2"
              style={{ color: 'var(--fds-ink-2)' }}
            >
              <X className="h-5 w-5" /> <span className="fds-meta">Fechar</span>
            </button>
            <div style={{ borderRadius: 8, overflow: 'hidden', aspectRatio: '9 / 16', background: '#000' }}>
              <video
                src={`${R2_DEPOIMENTOS}/${aberto}.mp4`}
                poster={`${R2_DEPOIMENTOS}/${aberto}.jpg`}
                controls
                autoPlay
                playsInline
                className="h-full w-full"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
