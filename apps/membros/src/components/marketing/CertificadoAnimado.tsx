'use client'

/**
 * Certificado com uma "graça" (pedido do Pedro, 24/11/2026): flutua de leve,
 * um brilho dourado passa por cima de tempos em tempos e, no desktop, inclina
 * em 3D seguindo o mouse. Frente e verso ficam empilhados como duas folhas.
 *
 * O `!important` nas animações é de propósito, igual ao FaixaLetreiro: o
 * globals.css zera animação quando o sistema pede menos movimento, e no PC do
 * Pedro as animações do Windows estão desligadas.
 */

import { useRef, useState } from 'react'

export function CertificadoAnimado({ frente, verso, alt }: { frente: string; verso?: string; alt: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  function mover(e: React.MouseEvent) {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    setTilt({ x: py * -8, y: px * 10 })
  }

  const folha = (src: string, legenda: string, atraso: string) => (
    <div className="cert-folha" style={{ animationDelay: atraso }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={legenda} loading="lazy" className="block w-full" style={{ borderRadius: 6 }} />
      <span className="cert-brilho" style={{ animationDelay: atraso }} aria-hidden />
    </div>
  )

  return (
    <div
      ref={ref}
      onMouseMove={mover}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      style={{ perspective: 1200 }}
    >
      <style>{`
        .cert-palco { transition: transform .35s cubic-bezier(.22,1,.36,1); transform-style: preserve-3d; }
        .cert-folha { position: relative; overflow: hidden; border-radius: 6px;
          box-shadow: 0 18px 40px -18px rgba(0,0,0,.65), 0 0 0 1px rgba(255,184,0,.18);
          animation: cert-flutua 6s ease-in-out infinite !important; animation-duration: 6s !important; animation-iteration-count: infinite !important; }
        .cert-brilho { position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(115deg, transparent 35%, rgba(255,214,102,.0) 40%, rgba(255,231,160,.55) 50%, rgba(255,214,102,0) 60%, transparent 65%);
          background-size: 250% 100%; mix-blend-mode: screen;
          animation: cert-brilha 4.5s ease-in-out infinite !important; animation-duration: 4.5s !important; animation-iteration-count: infinite !important; }
        @keyframes cert-flutua { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
        @keyframes cert-brilha { 0% { background-position: 150% 0 } 55%,100% { background-position: -60% 0 } }
      `}</style>
      <div className="cert-palco" style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}>
        {folha(frente, alt, '0s')}
        {verso && <div className="mt-4">{folha(verso, `${alt}, verso`, '1.2s')}</div>}
      </div>
    </div>
  )
}
