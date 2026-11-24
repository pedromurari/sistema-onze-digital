'use client'

/**
 * Certificado animado (pedido do Pedro, 24/11/2026: "faz com vontade").
 *
 * - Entrada: quando aparece na tela, a folha gira em 3D e "pousa".
 * - Sempre: balança em 3D devagar (funciona no celular, sem mouse), flutua,
 *   tem um halo dourado pulsando, um brilho forte passando a cada 3s e
 *   estrelinhas piscando em volta.
 * - Desktop: além disso, inclina seguindo o mouse.
 *
 * O `!important` nas animações é de propósito, igual ao FaixaLetreiro: o
 * globals.css zera animação quando o sistema pede menos movimento, e no PC do
 * Pedro as animações do Windows estão desligadas.
 */

import { useEffect, useRef, useState } from 'react'

const ESTRELAS = [
  { top: '-14px', left: '8%', tam: 18, atraso: '0s' },
  { top: '12%', left: '-12px', tam: 12, atraso: '.8s' },
  { top: '-10px', left: '78%', tam: 14, atraso: '1.5s' },
  { top: '42%', left: 'calc(100% - 6px)', tam: 20, atraso: '.4s' },
  { top: 'calc(100% - 8px)', left: '30%', tam: 12, atraso: '1.1s' },
  { top: 'calc(100% - 12px)', left: '88%', tam: 16, atraso: '1.9s' },
]

const CSS = `
.cert-cena { position: relative; perspective: 1400px; }
.cert-inclina { transition: transform .4s cubic-bezier(.22,1,.36,1); transform-style: preserve-3d; }
.cert-balanco { transform-style: preserve-3d;
  animation: cert-balanca 7s ease-in-out infinite !important; animation-duration: 7s !important; animation-iteration-count: infinite !important; }
.cert-folha { position: relative; border-radius: 8px; opacity: 0; transform: rotateY(-70deg) translateY(40px) scale(.8); }
.cert-visivel .cert-folha { animation: cert-entra 1.1s cubic-bezier(.2,.9,.25,1.15) forwards, cert-flutua 5s ease-in-out 1.1s infinite !important;
  animation-duration: 1.1s, 5s !important; animation-iteration-count: 1, infinite !important; }
.cert-moldura { position: relative; overflow: hidden; border-radius: 8px;
  animation: cert-halo 3s ease-in-out infinite !important; animation-duration: 3s !important; animation-iteration-count: infinite !important; }
.cert-brilho { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: screen;
  background: linear-gradient(110deg, transparent 30%, rgba(255,214,102,0) 38%, rgba(255,240,190,.9) 50%, rgba(255,214,102,0) 62%, transparent 70%);
  background-size: 260% 100%;
  animation: cert-brilha 3s ease-in-out infinite !important; animation-duration: 3s !important; animation-iteration-count: infinite !important; }
.cert-estrela { position: absolute; z-index: 2; pointer-events: none; color: #FFD25A; filter: drop-shadow(0 0 6px rgba(255,200,60,.9));
  animation: cert-pisca 2.2s ease-in-out infinite !important; animation-duration: 2.2s !important; animation-iteration-count: infinite !important; }
@keyframes cert-entra { 0% { opacity: 0; transform: rotateY(-70deg) translateY(40px) scale(.8); }
  60% { opacity: 1; transform: rotateY(8deg) translateY(-6px) scale(1.03); }
  100% { opacity: 1; transform: rotateY(0) translateY(0) scale(1); } }
@keyframes cert-flutua { 0%,100% { opacity: 1; transform: translateY(0) } 50% { opacity: 1; transform: translateY(-12px) } }
@keyframes cert-balanca { 0%,100% { transform: rotateY(-7deg) rotateX(3deg) rotateZ(-.6deg) } 50% { transform: rotateY(7deg) rotateX(-3deg) rotateZ(.6deg) } }
@keyframes cert-halo { 0%,100% { box-shadow: 0 24px 50px -20px rgba(0,0,0,.7), 0 0 0 1px rgba(255,184,0,.25), 0 0 18px 0 rgba(255,184,0,.15) }
  50% { box-shadow: 0 30px 60px -20px rgba(0,0,0,.7), 0 0 0 1px rgba(255,184,0,.6), 0 0 44px 6px rgba(255,184,0,.38) } }
@keyframes cert-brilha { 0% { background-position: 160% 0 } 60%,100% { background-position: -70% 0 } }
@keyframes cert-pisca { 0%,100% { opacity: 0; transform: scale(.3) rotate(0deg) } 50% { opacity: 1; transform: scale(1.1) rotate(90deg) } }
`

function Estrela({ tam }: { tam: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M12 0c.6 6.6 5.4 11.4 12 12-6.6.6-11.4 5.4-12 12-.6-6.6-5.4-11.4-12-12C6.6 11.4 11.4 6.6 12 0z" />
    </svg>
  )
}

export function CertificadoAnimado({ frente, verso, alt }: { frente: string; verso?: string; alt: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisivel(true); io.disconnect() }
    }, { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  function mover(e: React.MouseEvent) {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    setTilt({ x: py * -16, y: px * 20 })
  }

  const folha = (src: string, legenda: string, atraso: number) => (
    <div className="cert-folha" style={{ animationDelay: `${atraso}s, ${atraso + 1.1}s` }}>
      <div className="cert-moldura" style={{ animationDelay: `${atraso}s` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={legenda} loading="lazy" className="block w-full" />
        <span className="cert-brilho" style={{ animationDelay: `${atraso}s` }} aria-hidden />
      </div>
      {ESTRELAS.map((s, i) => (
        <span key={i} className="cert-estrela" style={{ top: s.top, left: s.left, animationDelay: `calc(${s.atraso} + ${atraso}s)` }}>
          <Estrela tam={s.tam} />
        </span>
      ))}
    </div>
  )

  return (
    <div
      ref={ref}
      className={`cert-cena ${visivel ? 'cert-visivel' : ''}`}
      onMouseMove={mover}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
    >
      <style>{CSS}</style>
      <div className="cert-inclina" style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}>
        <div className="cert-balanco">
          {folha(frente, alt, 0)}
          {verso && <div className="mt-6">{folha(verso, `${alt}, verso`, 0.35)}</div>}
        </div>
      </div>
    </div>
  )
}
