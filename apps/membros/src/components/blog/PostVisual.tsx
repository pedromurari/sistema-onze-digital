'use client'

/**
 * Peças visuais dos posts do blog (pedido do Pedro, 24/11/2026: "só tem texto
 * e fundo preto, quero imagem, animação, banner"). Tudo aqui é decorativo e
 * leve: barra de progresso de leitura, blocos que entram ao rolar, e três
 * diagramas em SVG animado (ciclo da repetição, tripé da formação, árvore
 * familiar). Os blocos em si são definidos em src/content/blog.ts.
 *
 * `!important` nas animações: o globals.css zera animação quando o sistema
 * pede menos movimento, e no PC do Pedro as animações do Windows estão
 * desligadas (mesma decisão do FaixaLetreiro).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'

export const CSS_POST = `
.post-revela { opacity: 0; transform: translateY(26px); transition: opacity .8s cubic-bezier(.22,1,.36,1), transform .8s cubic-bezier(.22,1,.36,1) !important; }
.post-revela.visivel { opacity: 1; transform: none; }
.post-capa-img { animation: post-zoom 18s ease-out forwards !important; animation-duration: 18s !important; }
@keyframes post-zoom { from { transform: scale(1.12) } to { transform: scale(1) } }
.post-dash { stroke-dasharray: 1200; stroke-dashoffset: 1200; }
.visivel .post-dash { animation: post-desenha 2.4s cubic-bezier(.6,0,.2,1) forwards !important; animation-duration: 2.4s !important; }
@keyframes post-desenha { to { stroke-dashoffset: 0 } }
.post-orbita { transform-origin: 200px 200px; animation: post-gira 9s linear infinite !important; animation-duration: 9s !important; animation-iteration-count: infinite !important; }
@keyframes post-gira { to { transform: rotate(360deg) } }
.post-no { opacity: 0; }
.visivel .post-no { animation: post-aparece .6s ease forwards !important; animation-duration: .6s !important; }
@keyframes post-aparece { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
.post-pilar { transform: scaleY(0); transform-origin: bottom; transform-box: fill-box; }
.visivel .post-pilar { animation: post-sobe 1s cubic-bezier(.22,1,.36,1) forwards !important; animation-duration: 1s !important; }
@keyframes post-sobe { to { transform: scaleY(1) } }
.post-pulso { animation: post-pulsa 2.4s ease-in-out infinite !important; animation-duration: 2.4s !important; animation-iteration-count: infinite !important; }
@keyframes post-pulsa { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
.post-card { transition: border-color .3s, transform .3s; }
.post-card:hover { border-color: rgba(255,184,0,.45); transform: translateY(-3px); }
`

/** Barra dourada no topo que enche conforme a leitura. */
export function ProgressoLeitura() {
  const [pct, setPct] = useState(0)
  useEffect(() => {
    const atualiza = () => {
      const el = document.getElementById('post-corpo')
      if (!el) return
      const r = el.getBoundingClientRect()
      const total = r.height - window.innerHeight * 0.6
      setPct(Math.max(0, Math.min(100, ((-r.top + window.innerHeight * 0.2) / total) * 100)))
    }
    atualiza()
    window.addEventListener('scroll', atualiza, { passive: true })
    return () => window.removeEventListener('scroll', atualiza)
  }, [])
  return (
    <div aria-hidden style={{ position: 'fixed', top: 73, left: 0, right: 0, height: 3, zIndex: 40, background: 'rgba(255,255,255,.05)' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--fds-accent)', transition: 'width .1s linear' }} />
    </div>
  )
}

/** Entra com fade + subida quando aparece na tela. */
export function Revela({ children, className = '', atraso = 0 }: { children: ReactNode; className?: string; atraso?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visivel, setVisivel] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisivel(true); io.disconnect() } }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={`post-revela ${visivel ? 'visivel' : ''} ${className}`} style={{ transitionDelay: `${atraso}ms` }}>
      {children}
    </div>
  )
}

const OURO = '#FFB800'
const TINTA = '#f2f2f3'
const APOIO = '#a7a8ae'

function DiagramaCiclo() {
  const nos = [
    { x: 200, y: 52, t: 'Gatilho', s: 'algo parecido com o passado' },
    { x: 348, y: 200, t: 'Emoção antiga', s: 'o corpo reage primeiro' },
    { x: 200, y: 348, t: 'Reação automática', s: 'a resposta de sempre' },
    { x: 52, y: 200, t: 'Mesmo desfecho', s: 'e a promessa de mudar' },
  ]
  return (
    <svg viewBox="0 0 400 400" className="mx-auto block w-full max-w-[420px]" role="img" aria-label="Ciclo da repetição: gatilho, emoção antiga, reação automática, mesmo desfecho">
      <circle cx="200" cy="200" r="148" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="2" />
      <circle className="post-dash" cx="200" cy="200" r="148" fill="none" stroke={OURO} strokeWidth="2" strokeLinecap="round" />
      <g className="post-orbita"><circle cx="200" cy="52" r="6" fill={OURO} /></g>
      <text x="200" y="192" textAnchor="middle" fill={APOIO} fontSize="11" letterSpacing="2">COMPULSÃO À</text>
      <text x="200" y="214" textAnchor="middle" fill={TINTA} fontSize="20" fontFamily="var(--fds-serif)" fontWeight="600">repetição</text>
      {nos.map((n, i) => (
        <g key={n.t} className="post-no" style={{ animationDelay: `${0.4 + i * 0.45}s` }}>
          <circle cx={n.x} cy={n.y} r="9" fill="#08090d" stroke={OURO} strokeWidth="2" />
          <text x={n.x} y={n.y + (n.y > 300 ? 30 : n.y < 100 ? -18 : 30)} textAnchor="middle" fill={TINTA} fontSize="13" fontWeight="600">{n.t}</text>
          <text x={n.x} y={n.y + (n.y > 300 ? 46 : n.y < 100 ? -34 : 46)} textAnchor="middle" fill={APOIO} fontSize="10">{n.s}</text>
        </g>
      ))}
    </svg>
  )
}

function DiagramaTripe() {
  const pilares = [
    { x: 70, t: 'Teoria', s: 'o mapa' },
    { x: 175, t: 'Análise pessoal', s: 'a experiência' },
    { x: 280, t: 'Supervisão', s: 'a prática segura' },
  ]
  return (
    <svg viewBox="0 0 400 330" className="mx-auto block w-full max-w-[460px]" role="img" aria-label="Tripé da formação: teoria, análise pessoal e supervisão sustentam o psicanalista">
      <g className="post-no" style={{ animationDelay: '1.4s' }}>
        <rect x="40" y="40" width="320" height="44" rx="6" fill="rgba(255,184,0,.12)" stroke={OURO} strokeWidth="1.5" />
        <text x="200" y="68" textAnchor="middle" fill={TINTA} fontSize="17" fontFamily="var(--fds-serif)" fontWeight="600">Psicanalista</text>
      </g>
      {pilares.map((p, i) => (
        <g key={p.t}>
          <rect className="post-pilar" style={{ animationDelay: `${0.2 + i * 0.3}s` }} x={p.x} y="96" width="50" height="160" rx="4" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.18)" />
          <g className="post-no" style={{ animationDelay: `${0.9 + i * 0.3}s` }}>
            <text x={p.x + 25} y="282" textAnchor="middle" fill={TINTA} fontSize="13" fontWeight="600">{p.t}</text>
            <text x={p.x + 25} y="300" textAnchor="middle" fill={APOIO} fontSize="11">{p.s}</text>
          </g>
        </g>
      ))}
      <line x1="30" y1="258" x2="370" y2="258" stroke="rgba(255,255,255,.15)" strokeWidth="2" />
    </svg>
  )
}

function DiagramaArvore() {
  const ger = [
    { y: 60, rot: 'Avós', nos: [80, 160, 240, 320] },
    { y: 170, rot: 'Pais', nos: [120, 280] },
    { y: 280, rot: 'Você', nos: [200] },
  ]
  return (
    <svg viewBox="0 0 400 340" className="mx-auto block w-full max-w-[440px]" role="img" aria-label="Árvore familiar: uma história que passa dos avós aos pais e chega até você">
      {[[80, 60, 120, 170], [160, 60, 120, 170], [240, 60, 280, 170], [320, 60, 280, 170], [120, 170, 200, 280], [280, 170, 200, 280]].map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,.12)" strokeWidth="1.5" />
      ))}
      <path className="post-dash" d="M 240 60 L 280 170 L 200 280" fill="none" stroke={OURO} strokeWidth="3" strokeLinecap="round" />
      {ger.map((g, gi) => (
        <g key={g.rot}>
          <text x="12" y={g.y + 4} fill={APOIO} fontSize="10" letterSpacing="1.5">{g.rot.toUpperCase()}</text>
          {g.nos.map((x, i) => {
            const marcado = (gi === 0 && x === 240) || (gi === 1 && x === 280) || gi === 2
            return (
              <g key={x} className="post-no" style={{ animationDelay: `${gi * 0.5 + i * 0.1}s` }}>
                {marcado && <circle className="post-pulso" cx={x} cy={g.y} r="20" fill="rgba(255,184,0,.18)" />}
                <circle cx={x} cy={g.y} r={gi === 2 ? 14 : 11} fill="#08090d" stroke={marcado ? OURO : 'rgba(255,255,255,.3)'} strokeWidth="2" />
              </g>
            )
          })}
        </g>
      ))}
      <text x="200" y="320" textAnchor="middle" fill={TINTA} fontSize="13" fontWeight="600">uma história que atravessa gerações</text>
    </svg>
  )
}

export function Diagrama({ nome, legenda }: { nome: 'ciclo' | 'tripe' | 'arvore'; legenda?: string }) {
  return (
    <figure className="fds-card" style={{ padding: 'var(--fds-8)', marginTop: 'var(--fds-12)', background: 'radial-gradient(500px 260px at 50% 0%, rgba(255,184,0,.07), transparent 70%), rgba(255,255,255,.015)' }}>
      {nome === 'ciclo' && <DiagramaCiclo />}
      {nome === 'tripe' && <DiagramaTripe />}
      {nome === 'arvore' && <DiagramaArvore />}
      {legenda && <figcaption className="fds-small mt-6 text-center">{legenda}</figcaption>}
    </figure>
  )
}
