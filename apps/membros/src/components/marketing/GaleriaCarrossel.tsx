'use client'

/**
 * Galeria em carrossel das turmas presenciais (pedido do Pedro, 24/11/2026):
 * duas faixas de fotos passando em sentidos opostos, sem parar. Passar o
 * mouse pausa a faixa; clicar abre a foto grande, com setas pra navegar.
 *
 * As fotos vêm das páginas antigas do IDM pelo Brasil (pasta
 * public/images/turmas/galeria, 01..26) + as 5 que já estavam no site.
 *
 * O `!important` nas animações é de propósito, igual ao FaixaLetreiro: o
 * globals.css zera animação quando o sistema pede menos movimento.
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

type Foto = { src: string; w: number; h: number }

const DIMS: [number, number][] = [
  [900, 1200], [1200, 540], [1200, 900], [900, 1200], [900, 1200], [900, 1200], [1200, 900], [900, 1200], [900, 1200], [1200, 540],
  [1200, 900], [900, 1200], [1200, 900], [1200, 676], [900, 1200], [900, 1200], [900, 1200], [900, 1200], [900, 1200], [900, 1200],
  [900, 1200], [900, 1200], [1200, 900], [900, 1200], [900, 1200], [900, 1200],
]

const DA_GALERIA: Foto[] = DIMS.map(([w, h], i) => ({ src: `/images/turmas/galeria/${String(i + 1).padStart(2, '0')}.jpg`, w, h }))
const DO_SITE: Foto[] = [
  { src: '/images/turmas/turma-certificados.jpg', w: 4, h: 3 },
  { src: '/images/turmas/turma-escada.jpg', w: 3, h: 4 },
  { src: '/images/turmas/rodrygo-alunas.jpg', w: 4, h: 3 },
  { src: '/images/turmas/turma-grupo.jpg', w: 4, h: 3 },
  { src: '/images/turmas/aula-sala-cheia.jpg', w: 16, h: 9 },
]

// Intercala pra as fotos de grupo não ficarem todas juntas.
const TODAS: Foto[] = []
for (let i = 0; i < Math.max(DA_GALERIA.length, DO_SITE.length * 5); i++) {
  if (DA_GALERIA[i]) TODAS.push(DA_GALERIA[i])
  if (i % 5 === 2 && DO_SITE[Math.floor(i / 5)]) TODAS.push(DO_SITE[Math.floor(i / 5)])
}
const FAIXA_A = TODAS.filter((_, i) => i % 2 === 0)
const FAIXA_B = TODAS.filter((_, i) => i % 2 === 1)

const CSS = `
.gal-faixa { overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); }
.gal-trilho { display: flex; width: max-content; gap: 14px; }
.gal-trilho--esq { animation: gal-esq 90s linear infinite !important; animation-duration: 90s !important; animation-iteration-count: infinite !important; }
.gal-trilho--dir { animation: gal-dir 100s linear infinite !important; animation-duration: 100s !important; animation-iteration-count: infinite !important; }
.gal-faixa:hover .gal-trilho { animation-play-state: paused !important; }
.gal-foto { height: var(--gal-h); flex-shrink: 0; border-radius: 10px; overflow: hidden; cursor: zoom-in; border: 1px solid var(--fds-line); background: #111; padding: 0; }
.gal-foto img { height: 100%; width: auto; display: block; object-fit: cover; transition: transform .6s cubic-bezier(.22,1,.36,1), filter .4s; filter: saturate(.92); }
.gal-foto:hover img { transform: scale(1.06); filter: saturate(1.08); }
@keyframes gal-esq { from { transform: translateX(0) } to { transform: translateX(-50%) } }
@keyframes gal-dir { from { transform: translateX(-50%) } to { transform: translateX(0) } }
.gal-caixa { position: fixed; inset: 0; z-index: 100; background: rgba(4,5,8,.92); display: flex; align-items: center; justify-content: center; padding: 24px; }
.gal-caixa img { max-width: min(1100px, 100%); max-height: 86vh; border-radius: 10px; animation: gal-zoom .35s cubic-bezier(.22,1,.36,1) !important; animation-duration: .35s !important; }
@keyframes gal-zoom { from { opacity: 0; transform: scale(.94) } to { opacity: 1; transform: scale(1) } }
.gal-seta { position: absolute; top: 50%; transform: translateY(-50%); width: 48px; height: 48px; border-radius: 999px; display: grid; place-items: center; background: rgba(255,255,255,.08); color: #fff; border: 1px solid rgba(255,255,255,.15); }
.gal-seta:hover { background: var(--fds-accent); color: var(--fds-accent-ink); }
`

function Faixa({ fotos, sentido, abrir }: { fotos: Foto[]; sentido: 'esq' | 'dir'; abrir: (src: string) => void }) {
  const dobradas = [...fotos, ...fotos]
  return (
    <div className="gal-faixa">
      <div className={`gal-trilho gal-trilho--${sentido}`}>
        {dobradas.map((f, i) => (
          <button
            key={`${f.src}-${i}`}
            type="button"
            className="gal-foto"
            style={{ aspectRatio: `${f.w} / ${f.h}` }}
            onClick={() => abrir(f.src)}
            aria-label="Ver foto da turma em tamanho grande"
            aria-hidden={i >= fotos.length || undefined}
            tabIndex={i >= fotos.length ? -1 : 0}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.src} alt="Turma do IDM pelo Brasil com os certificados" decoding="async" />
          </button>
        ))}
      </div>
    </div>
  )
}

/** `compacta`: uma faixa só e fotos menores (bloco do IDM pelo Brasil na home). */
export function GaleriaCarrossel({ compacta = false }: { compacta?: boolean }) {
  const [aberta, setAberta] = useState<number | null>(null)
  // As fotos só começam a baixar quando a galeria chega perto da tela.
  // (loading="lazy" não serve aqui: a foto entra na tela pelo transform do
  // letreiro e o navegador não dispara o carregamento a tempo.)
  const caixa = useRef<HTMLDivElement>(null)
  const [perto, setPerto] = useState(false)
  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setPerto(true); io.disconnect() } }, { rootMargin: '800px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const abrir = (src: string) => setAberta(TODAS.findIndex(f => f.src === src))
  const passo = (d: number) => setAberta(a => (a === null ? a : (a + d + TODAS.length) % TODAS.length))

  useEffect(() => {
    if (aberta === null) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberta(null)
      if (e.key === 'ArrowRight') passo(1)
      if (e.key === 'ArrowLeft') passo(-1)
    }
    document.addEventListener('keydown', tecla)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', tecla); document.body.style.overflow = '' }
  }, [aberta])

  return (
    <div ref={caixa} style={{ display: 'grid', gap: 14, minHeight: compacta ? 'clamp(150px, 18vw, 210px)' : 'calc(2 * clamp(180px, 26vw, 300px) + 14px)', ['--gal-h' as string]: compacta ? 'clamp(150px, 18vw, 210px)' : 'clamp(180px, 26vw, 300px)' }}>
      <style>{CSS}</style>
      {perto && <Faixa fotos={compacta ? TODAS : FAIXA_A} sentido="esq" abrir={abrir} />}
      {perto && !compacta && <Faixa fotos={FAIXA_B} sentido="dir" abrir={abrir} />}

      {aberta !== null && (
        <div className="gal-caixa" role="dialog" aria-modal="true" onClick={() => setAberta(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={aberta} src={TODAS[aberta].src} alt="Turma do IDM pelo Brasil" onClick={e => e.stopPropagation()} />
          <button type="button" className="gal-seta" style={{ left: 16 }} aria-label="Foto anterior" onClick={e => { e.stopPropagation(); passo(-1) }}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" className="gal-seta" style={{ right: 16 }} aria-label="Próxima foto" onClick={e => { e.stopPropagation(); passo(1) }}>
            <ChevronRight className="h-5 w-5" />
          </button>
          <button type="button" className="gal-seta" style={{ top: 32, right: 16, transform: 'none' }} aria-label="Fechar" onClick={() => setAberta(null)}>
            <X className="h-5 w-5" />
          </button>
          <p className="fds-meta" style={{ position: 'absolute', bottom: 20, left: 0, right: 0, textAlign: 'center' }}>
            {aberta + 1} / {TODAS.length}
          </p>
        </div>
      )}
    </div>
  )
}
