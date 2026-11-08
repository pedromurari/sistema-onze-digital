'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Check, Lock,
  Play, Download, Video, Calendar, Bell,
  Award, ExternalLink, Zap, MessageCircle,
} from 'lucide-react'

// ─────────────────────────────────────────────
// CONFIG — edite aqui sem tocar no restante
// ─────────────────────────────────────────────

const WA_GROUP_URL   = 'https://chat.whatsapp.com/KoK9CDjElOcJ3nkjjd96jW'
const INTRO_VIDEO_ID = ''
const EBOOK_URL      = '#'
const BANNER_URL     = ''  // ex: '/banner-sdw42.png'

const OFERTA = {
  ativo: false,
  atencao:    'Você acabou de provar que é diferente.',
  interesse:  'A maioria das pessoas para na teoria. Você foi até aqui — e isso muda tudo. Agora existe um caminho mais rápido para ir além.',
  nome:       'Nome do produto aqui',
  descricao:  'Uma frase de impacto sobre a transformação que o produto entrega.',
  beneficios: [
    'O que a pessoa vai conseguir fazer',
    'Resultado específico em X tempo',
    'O que ela vai parar de sofrer',
    'Bônus ou acesso exclusivo',
  ],
  preco_original: 'R$ 297',
  preco:          'R$ 47',
  parcelamento:   'ou 3× de R$ 16,90',
  urgencia:       'Disponível só durante a Semana do Despertar.',
  url:            '#',
}

const AULAS: Aula[] = [
  {
    id: 1,
    titulo: 'Aula 1 — O Despertar',
    data: '28/07 · Terça-feira',
    horario: '20h (Horário de Brasília)',
    youtubeUrl: 'https://youtube.com/live/z5d6twnYiGg',
    imageUrl: 'https://img.youtube.com/vi/z5d6twnYiGg/maxresdefault.jpg',
    gcal: { titulo: 'SDW #42 — Aula 1', inicio: '20260728T230000Z', fim: '20260729T010000Z', desc: 'Aula 1 da Semana do Despertar #42 · IDM' },
  },
  {
    id: 2,
    titulo: 'Aula 2 — A Cura',
    data: '29/07 · Quarta-feira',
    horario: '20h (Horário de Brasília)',
    youtubeUrl: 'https://youtube.com/live/_cNu6ECHml8',
    imageUrl: 'https://img.youtube.com/vi/_cNu6ECHml8/maxresdefault.jpg',
    gcal: { titulo: 'SDW #42 — Aula 2', inicio: '20260729T230000Z', fim: '20260730T010000Z', desc: 'Aula 2 da Semana do Despertar #42 · IDM' },
  },
  {
    id: 3,
    titulo: 'Aula 3 — A Revelação',
    data: '30/07 · Quinta-feira',
    horario: '20h (Horário de Brasília)',
    youtubeUrl: 'https://youtube.com/live/1mHLICt7ag4',
    imageUrl: 'https://img.youtube.com/vi/1mHLICt7ag4/maxresdefault.jpg',
    gcal: { titulo: 'SDW #42 — Aula 3', inicio: '20260730T230000Z', fim: '20260731T010000Z', desc: 'Aula 3 da Semana do Despertar #42 · IDM' },
  },
]

const XP_PER_STEP = 200
const TOTAL_STEPS  = 3
const STORAGE_KEY  = 'sdw42_progress'

// 22h Horário de Brasília em 30/07/2026 (última aula) = 01h UTC do dia 31/07/2026
const CERT_UNLOCK = new Date('2026-07-31T01:00:00Z')

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
interface Aula {
  id: number; titulo: string; data: string; horario: string; youtubeUrl: string; imageUrl: string
  gcal: { titulo: string; inicio: string; fim: string; desc: string }
}
interface Progress {
  step1_vip: boolean
  step4_aula1: boolean; step4_aula2: boolean; step4_aula3: boolean
}
const EMPTY: Progress = {
  step1_vip: false,
  step4_aula1: false, step4_aula2: false, step4_aula3: false,
}
type StepStatus = 'locked' | 'available' | 'done'

// ─────────────────────────────────────────────
// CALENDAR UTIL
// ─────────────────────────────────────────────
function openCalendar(aula: Aula) {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const { titulo, inicio, fim, desc } = aula.gcal
  const descFull = `${desc}\n\nAssista em: ${aula.youtubeUrl}`
  if (isIOS) {
    const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//IDM//SDW42//PT','BEGIN:VEVENT',
      `SUMMARY:${titulo}`,`DTSTART:${inicio}`,`DTEND:${fim}`,
      `DESCRIPTION:${descFull.replace(/\n/g,'\\n')}`,`URL:${aula.youtubeUrl}`,
      'END:VEVENT','END:VCALENDAR'].join('\r\n')
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `sdw42-aula${aula.id}.ics` })
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    return
  }
  window.open(
    `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(titulo)}&dates=${inicio}/${fim}&details=${encodeURIComponent(descFull)}&location=${encodeURIComponent(aula.youtubeUrl)}`,
    '_blank','noopener'
  )
}

// ─────────────────────────────────────────────
// PROGRESS TRACKER
// ─────────────────────────────────────────────
function ProgressTracker({ done, total, xp }: { done: number; total: number; xp: number }) {
  const pct = Math.round((done / total) * 100)
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-[#FFB800]" />
          <span className="text-sm font-semibold text-[#FFB800]">{xp} XP</span>
          <span className="text-xs text-white/30">· {done}/{total} etapas</span>
        </div>
        <span className="text-xs font-mono text-white/25">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #FFB800, #FFC933)' }}
        />
      </div>
      <div className="flex justify-between">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${i < done ? 'bg-[#FFB800]' : 'bg-white/10'}`} />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// STEP BADGE
// ─────────────────────────────────────────────
function StepBadge({ numero, status, showNum }: { numero: number; status: StepStatus; showNum?: boolean }) {
  if (status === 'done') {
    return (
      <div className="w-10 h-10 rounded-full bg-[#22c55e]/15 border-2 border-[#22c55e]/40 flex items-center justify-center shrink-0">
        <Check className="h-4 w-4 text-[#22c55e]" />
      </div>
    )
  }
  if (status === 'locked' && !showNum) {
    return (
      <div className="w-10 h-10 rounded-full bg-white/[0.04] border-2 border-white/10 flex items-center justify-center shrink-0">
        <Lock className="h-3.5 w-3.5 text-white/20" />
      </div>
    )
  }
  if (status === 'locked' && showNum) {
    return (
      <div className="w-10 h-10 rounded-full bg-[#FFB800]/[0.06] border-2 border-[#FFB800]/20 flex items-center justify-center shrink-0">
        <span className="text-sm font-bold text-[#FFB800]/40">{numero}</span>
      </div>
    )
  }
  return (
    <div className="w-10 h-10 rounded-full bg-[#FFB800]/15 border-2 border-[#FFB800]/50 flex items-center justify-center shrink-0 relative">
      <span className="text-sm font-bold text-[#FFB800]">{numero}</span>
      <span className="absolute inset-0 rounded-full border border-[#FFB800]/30 animate-ping" />
    </div>
  )
}

// ─────────────────────────────────────────────
// STEP CARD
// ─────────────────────────────────────────────
function StepCard({
  numero, titulo, status, subtitle, badge, children, forceContent,
}: {
  numero: number; titulo: string; status: StepStatus
  subtitle?: string; badge?: React.ReactNode; children?: React.ReactNode
  forceContent?: boolean
}) {
  const border =
    status === 'done'        ? 'border-[#22c55e]/15' :
    status === 'available'   ? 'border-[#FFB800]/25'  :
    forceContent             ? 'border-[#FFB800]/12'  :
                               'border-white/[0.08]'

  const bg = (status === 'available' || forceContent) ? 'bg-[#0F1940]' : 'bg-[#0A1232]'

  return (
    <div className={`rounded-2xl border ${border} ${bg} overflow-hidden transition-all duration-300 ${status === 'locked' && !forceContent ? 'opacity-40' : ''}`}>
      <div className="flex items-start gap-4 px-5 py-5">
        <StepBadge numero={numero} status={status} showNum={forceContent} />
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-base font-semibold leading-snug ${status === 'locked' && !forceContent ? 'text-white/25' : 'text-white/90'}`}>
              {titulo}
            </p>
            {badge}
          </div>
          {status === 'done' && !subtitle && (
            <p className="text-xs text-[#22c55e]/60 mt-0.5">Concluído ✓</p>
          )}
          {status === 'locked' && !forceContent && (
            <p className="text-xs text-white/20 mt-0.5">Complete a etapa anterior para desbloquear.</p>
          )}
          {subtitle && (status !== 'locked' || forceContent) && (
            <p className="text-xs text-white/35 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {(status !== 'locked' || forceContent) && children && (
        <div className="border-t border-white/[0.08] px-5 pb-5 pt-4">
          {children}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// CERT RESGATE FORM
// ─────────────────────────────────────────────
function CertResgateForm() {
  const [palavras, setPalavras] = useState(['', '', ''])
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'sucesso' | 'erro'>('idle')
  const [erroMsg, setErroMsg] = useState('')

  const handleSubmit = async () => {
    if (palavras.some(p => !p.trim())) return
    setEstado('enviando')
    setErroMsg('')
    try {
      const res = await fetch('/api/certificado/resgatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ palavra1: palavras[0], palavra2: palavras[1], palavra3: palavras[2] }),
      })
      const data = await res.json()
      if (res.ok) {
        setEstado('sucesso')
      } else {
        setEstado('erro')
        setErroMsg(data.error ?? 'Erro ao resgatar. Tente novamente.')
      }
    } catch {
      setEstado('erro')
      setErroMsg('Erro de conexão. Tente novamente.')
    }
  }

  if (estado === 'sucesso') {
    return (
      <div className="text-center space-y-4 py-2">
        <div className="w-14 h-14 rounded-full bg-[#22c55e]/15 border-2 border-[#22c55e]/30 flex items-center justify-center mx-auto">
          <Check className="h-6 w-6 text-[#22c55e]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white/90">Certificado emitido!</p>
          <p className="text-xs text-white/35 mt-0.5">Parabéns por concluir a Semana do Despertar #42.</p>
        </div>
        <Link href="/certificados?celebrar=true"
          className="inline-flex items-center gap-2 rounded-xl py-3 px-6 text-sm font-bold text-[#0D1638] transition-all"
          style={{ background: '#FFB800', boxShadow: '0 6px 20px rgba(255,184,0,0.30)' }}>
          <Award className="h-4 w-4" /> Ver meu certificado
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/35">Insira as 3 palavras-chave reveladas nas aulas ao vivo:</p>
      {[0, 1, 2].map(i => (
        <div key={i}>
          <label className="text-[10px] text-white/25 mb-1 block">Palavra {i + 1}</label>
          <input
            type="text"
            value={palavras[i]}
            onChange={e => {
              const next = [...palavras]
              next[i] = e.target.value
              setPalavras(next)
            }}
            placeholder={`Palavra ${i + 1}`}
            disabled={estado === 'enviando'}
            className="w-full rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/15 outline-none transition-colors"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(255,184,0,0.35)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}
          />
        </div>
      ))}
      {estado === 'erro' && erroMsg && (
        <p className="text-xs text-red-400 leading-relaxed">{erroMsg}</p>
      )}
      <button
        onClick={handleSubmit}
        disabled={estado === 'enviando' || palavras.some(p => !p.trim())}
        className="w-full rounded-xl py-3.5 text-sm font-bold text-[#0D1638] disabled:opacity-40 transition-all active:scale-[0.98]"
        style={{ background: '#FFB800', boxShadow: palavras.every(p => p.trim()) ? '0 6px 20px rgba(255,184,0,0.25)' : 'none' }}
      >
        {estado === 'enviando' ? 'Verificando...' : 'Resgatar meu Certificado'}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────
// MINI TIMELINE — jornada dos 5 passos
// ─────────────────────────────────────────────
function MiniTimeline({ currentStep }: { currentStep: number }) {
  const steps = ['VIP', 'Aulas', 'Cert.']
  return (
    <div className="flex items-center">
      {steps.map((label, i) => {
        const idx = i + 1
        const done = idx < currentStep
        const active = idx === currentStep
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors duration-500 ${
                done   ? 'bg-[#22c55e]/80 text-white' :
                active ? 'bg-[#FFB800] text-[#0D1638]' :
                         'border border-white/[0.12] text-white/20'
              }`}>
                {done ? '✓' : idx}
              </div>
              <span className={`text-[9px] uppercase tracking-[0.06em] transition-colors duration-500 ${
                done ? 'text-[#22c55e]/50' : active ? 'text-[#FFB800]' : 'text-white/15'
              }`}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-1.5 mb-3.5 transition-colors duration-500 ${done ? 'bg-[#22c55e]/20' : 'bg-white/[0.08]'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export function SemanaDespertar42({ firstName }: { firstName: string }) {
  const [progress, setProgress] = useState<Progress>(EMPTY)
  const [hydrated, setHydrated] = useState(false)
  const [now, setNow] = useState<Date>(() => new Date())

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setProgress({ ...EMPTY, ...JSON.parse(raw) })
    } catch {}
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (now >= CERT_UNLOCK) return
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [now])

  const mark = useCallback((key: keyof Progress) => {
    setProgress(prev => {
      const next = { ...prev, [key]: true }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  if (!hydrated) return null

  const { step1_vip, step4_aula1, step4_aula2, step4_aula3 } = progress
  const todasAulasFeitas = step4_aula1 && step4_aula2 && step4_aula3
  const certUnlocked = now >= CERT_UNLOCK

  const certDiff = CERT_UNLOCK.getTime() - now.getTime()
  const timeLeft = certDiff > 0 ? {
    days:  Math.floor(certDiff / 86_400_000),
    hours: Math.floor((certDiff % 86_400_000) / 3_600_000),
    mins:  Math.floor((certDiff % 3_600_000) / 60_000),
  } : null

  const s1: StepStatus = step1_vip         ? 'done'   : 'available'
  const s2: StepStatus = !step1_vip        ? 'locked' : todasAulasFeitas ? 'done' : 'available'
  const s3: StepStatus = !step1_vip        ? 'locked' : (todasAulasFeitas && certUnlocked) ? 'available' : 'locked'

  const stepsCompleted = [step1_vip, todasAulasFeitas, todasAulasFeitas && certUnlocked].filter(Boolean).length
  const xp = stepsCompleted * XP_PER_STEP
  const currentStep = stepsCompleted + 1

  return (
    <div className="min-h-screen w-full bg-[#0D1638]">
        <div className="w-full max-w-2xl mx-auto px-5 sm:px-8 pt-10 pb-24">

          {/* ── BANNER OPCIONAL ─────────────────────────── */}
          {BANNER_URL && (
            <div className="w-full rounded-xl overflow-hidden mb-8 relative">
              <img
                src={BANNER_URL}
                alt="Semana do Despertar #42"
                className="w-full block"
                style={{ maxHeight: 260, objectFit: 'cover' }}
              />
              <div
                className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none rounded-b-xl"
                style={{ background: 'linear-gradient(to bottom, transparent, #0D1638)' }}
              />
            </div>
          )}

          {/* ── HERO EDITORIAL (Atenção + Interesse) ────── */}
          <div className="mb-10">
            {/* Barra superior editorial */}
            <div className="flex items-center justify-between border-t border-b border-white/[0.08] py-2.5 mb-7">
              <span className="text-[10px] uppercase tracking-[0.22em] text-white/30 font-medium">Instituto Despertamente</span>
              <span className="text-[10px] uppercase tracking-[0.15em] text-white/25 border border-white/[0.12] px-2 py-0.5 rounded">SDW #42</span>
            </div>

            {/* Headline */}
            <h1
              className="font-display text-[2.6rem] sm:text-[3.4rem] font-bold text-white mb-5"
              style={{ lineHeight: 0.97 }}
            >
              🎉 Parabéns{firstName ? `, ${firstName}` : ''}
              <br />
              <span style={{ color: '#c79a3b' }}>pelo seu cadastro!</span>
            </h1>

            {/* Separador */}
            <div className="h-px bg-white/[0.08] mb-5" />

            {/* Copy */}
            <p className="text-sm text-white/60 leading-relaxed mb-7">
              Você garantiu sua vaga no <span className="text-white/80 font-semibold">Curso Gratuito!</span> O evento será nos dias{' '}
              <span className="text-white/80 font-semibold">28, 29 e 30 de Julho.</span>
              <br />
              Siga as etapas abaixo para garantir seu acesso completo.
            </p>

            {/* Mini timeline */}
            <MiniTimeline currentStep={step1_vip ? currentStep : 1} />
          </div>

          {/* ── AÇÃO ÚNICA — FOCO TOTAL (Hick's Law) ────── */}
          {!step1_vip && (
            <div className="mb-8">
              <p className="text-[11px] text-white/30 mb-3">
                ⬇ &nbsp;Comece agora — apenas 1 passo:
              </p>

              <div
                className="rounded-2xl p-6 mb-4"
                style={{
                  border: '1px solid rgba(37,211,102,0.28)',
                  background: 'linear-gradient(160deg, rgba(37,211,102,0.07) 0%, rgba(37,211,102,0.03) 100%)',
                }}
              >
                <p className="text-[10px] uppercase tracking-[0.22em] mb-3" style={{ color: 'rgba(37,211,102,0.55)' }}>
                  Passo imediato
                </p>
                <h2
                  className="font-display text-2xl sm:text-[1.75rem] font-bold text-white mb-3"
                  style={{ lineHeight: 1.12 }}
                >
                  Entre no<br />Grupo VIP
                </h2>
                <p className="text-sm text-white/55 leading-relaxed mb-6">
                  Lá você recebe os links das aulas ao vivo, materiais e comunicados
                  em primeira mão — antes de qualquer outra pessoa.
                </p>
                <a
                  href={WA_GROUP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => mark('step1_vip')}
                  className="flex items-center justify-center gap-3 rounded-xl py-4 text-[15px] font-bold text-white transition-all active:scale-[0.98]"
                  style={{ background: '#25D366', boxShadow: '0 8px 32px rgba(37,211,102,0.25)' }}
                >
                  <MessageCircle className="h-5 w-5" />
                  Entrar no Grupo WhatsApp
                </a>
                <button
                  onClick={() => mark('step1_vip')}
                  className="w-full mt-3 py-2 text-[11px] text-white/20 hover:text-white/45 transition-colors"
                >
                  Já entrei no grupo — continuar ›
                </button>
              </div>

              {/* Próximos passos como chips bloqueados */}
              <div className="flex flex-wrap gap-2">
                {['Aulas ao Vivo', 'Certificado'].map(label => (
                  <span
                    key={label}
                    className="text-[10px] text-white/20 border border-white/[0.08] rounded-md px-2.5 py-1"
                  >
                    🔒 {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── PROGRESSO + ETAPAS (após step 1 concluído) ── */}
          {step1_vip && (
            <>
              {/* Progress tracker */}
              <div className="rounded-2xl border border-white/[0.08] bg-[#0A1232] mb-6 px-5 py-4">
                <ProgressTracker done={stepsCompleted} total={TOTAL_STEPS} xp={xp} />
              </div>

              <div className="space-y-3">

                {/* ETAPA 1 — sempre com botão visível e em destaque */}
                <StepCard numero={1} titulo="Grupo VIP" status={s1}>
                  <div
                    className="rounded-2xl p-5"
                    style={{
                      border: '1px solid rgba(37,211,102,0.28)',
                      background: 'linear-gradient(160deg, rgba(37,211,102,0.07) 0%, rgba(37,211,102,0.03) 100%)',
                    }}
                  >
                    <h2 className="font-display text-xl font-bold text-white mb-1">Grupo VIP da Turma</h2>
                    <p className="text-sm text-white/50 leading-relaxed mb-5">
                      Links das aulas ao vivo, materiais e comunicados em primeira mão — antes de qualquer outra pessoa.
                    </p>
                    <a
                      href={WA_GROUP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-3 rounded-xl py-4 text-[15px] font-bold text-white transition-all active:scale-[0.98]"
                      style={{ background: '#25D366', boxShadow: '0 8px 32px rgba(37,211,102,0.30)' }}
                    >
                      <MessageCircle className="h-5 w-5" />
                      Entrar no Grupo WhatsApp
                    </a>
                  </div>
                </StepCard>

                {/* ETAPA 2 — 3 AULAS AO VIVO */}
                <StepCard
                  numero={2}
                  titulo="Assista às 3 Aulas ao Vivo"
                  status={s2}
                  subtitle={`${[step4_aula1, step4_aula2, step4_aula3].filter(Boolean).length}/3 aulas assistidas`}
                >
                  <div className="space-y-3">
                    {AULAS.map((aula) => {
                      const aulaKey = `step4_aula${aula.id}` as keyof Progress
                      const aulaFeita = progress[aulaKey]
                      return (
                        <div key={aula.id}
                          className="rounded-xl border overflow-hidden transition-all duration-300"
                          style={{
                            borderColor: aulaFeita ? 'rgba(34,197,94,0.20)' : 'rgba(255,255,255,0.08)',
                            background: aulaFeita ? 'rgba(34,197,94,0.04)' : '#091028',
                          }}>
                          {/* Thumbnail clicável */}
                          <a href={aula.youtubeUrl} target="_blank" rel="noopener noreferrer"
                            onClick={() => mark(aulaKey)}
                            className="block relative w-full" style={{ aspectRatio: '16/9' }}>
                            <img
                              src={aula.imageUrl}
                              alt={aula.titulo}
                              className="w-full h-full object-cover block"
                              onError={(e) => {
                                (e.currentTarget.parentElement as HTMLElement).style.display = 'none'
                              }}
                            />
                            {aulaFeita ? (
                              <div className="absolute inset-0 flex items-center justify-center"
                                style={{ background: 'rgba(0,0,0,0.45)' }}>
                                <div className="w-11 h-11 rounded-full bg-[#22c55e] flex items-center justify-center shadow-lg">
                                  <Check className="h-5 w-5 text-white" />
                                </div>
                              </div>
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center"
                                style={{ background: 'rgba(0,0,0,0.25)' }}>
                                <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl"
                                  style={{ background: 'rgba(255,0,0,0.85)', backdropFilter: 'blur(4px)' }}>
                                  <Play className="h-6 w-6 text-white" fill="white" style={{ marginLeft: 3 }} />
                                </div>
                              </div>
                            )}
                          </a>
                          {/* Conteúdo */}
                          <div className="p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[11px] font-mono text-white/25">Aula {aula.id}</p>
                                <p className="text-sm font-semibold text-white/85 leading-snug mt-0.5">{aula.titulo}</p>
                                <p className="text-xs text-white/35 mt-1">{aula.data} · {aula.horario}</p>
                              </div>
                              {aulaFeita && (
                                <div className="w-7 h-7 rounded-full bg-[#22c55e]/15 border border-[#22c55e]/25 flex items-center justify-center shrink-0">
                                  <Check className="h-3.5 w-3.5 text-[#22c55e]" />
                                </div>
                              )}
                            </div>
                            {/* Botão grande YouTube */}
                            <a href={aula.youtubeUrl} target="_blank" rel="noopener noreferrer"
                              onClick={() => mark(aulaKey)}
                              className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white transition-all active:scale-[0.98]"
                              style={{ background: '#FF0000', boxShadow: '0 6px 20px rgba(255,0,0,0.25)' }}>
                              <Play className="h-4 w-4" fill="white" />
                              Assistir ao Vivo no YouTube
                              <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                            </a>
                            {/* Aviso lembrete — só texto, não botão */}
                            <p className="text-[10px] text-white/20 text-center leading-relaxed">
                              🔔 Ative o lembrete e o like no YouTube para não perder nada
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </StepCard>

                {/* ETAPA 3 — CERTIFICADO */}
                <StepCard
                  numero={3}
                  titulo="Resgate seu Certificado"
                  status={s3}
                  forceContent={true}
                  subtitle={
                    certUnlocked
                      ? (todasAulasFeitas ? 'Disponível para resgate!' : 'Complete as 3 aulas para resgatar.')
                      : 'Libera às 22h · 30/07 · após a última aula'
                  }
                >
                  <div className="space-y-4">
                    {/* Prévia do certificado */}
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-[#FFB800]/[0.08] border border-[#FFB800]/15 flex items-center justify-center shrink-0">
                        <Award className="h-6 w-6 text-[#FFB800]/50" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white/75">Certificado da Semana do Despertar #42</p>
                        <p className="text-xs text-white/30 leading-relaxed mt-0.5">
                          Ao final do curso, você retorna aqui e insere as 3 palavras-chave reveladas nas aulas para resgatar seu certificado.
                        </p>
                      </div>
                    </div>

                    {!certUnlocked ? (
                      /* ── COUNTDOWN até 22h/02-07 ── */
                      <div className="rounded-xl border border-[#FFB800]/12 p-4"
                        style={{ background: 'rgba(255,184,0,0.03)' }}>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-[#FFB800]/40 mb-3">Libera em</p>
                        <div className="flex items-end gap-3 mb-3">
                          {timeLeft && timeLeft.days > 0 && (
                            <>
                              <div className="text-center">
                                <p className="text-2xl font-bold tabular-nums" style={{ color: 'rgba(255,184,0,0.55)' }}>{timeLeft.days}</p>
                                <p className="text-[9px] text-white/20 mt-0.5">dias</p>
                              </div>
                              <span className="text-[#FFB800]/20 text-lg font-light mb-4">:</span>
                            </>
                          )}
                          <div className="text-center">
                            <p className="text-2xl font-bold tabular-nums" style={{ color: 'rgba(255,184,0,0.55)' }}>{String(timeLeft?.hours ?? 0).padStart(2, '0')}</p>
                            <p className="text-[9px] text-white/20 mt-0.5">horas</p>
                          </div>
                          <span className="text-[#FFB800]/20 text-lg font-light mb-4">:</span>
                          <div className="text-center">
                            <p className="text-2xl font-bold tabular-nums" style={{ color: 'rgba(255,184,0,0.55)' }}>{String(timeLeft?.mins ?? 0).padStart(2, '0')}</p>
                            <p className="text-[9px] text-white/20 mt-0.5">min</p>
                          </div>
                        </div>
                        <p className="text-[11px] text-white/25 leading-relaxed">
                          📅 30/07 às 22h (Horário de Brasília) — ao final da 3ª aula ao vivo
                        </p>
                      </div>
                    ) : todasAulasFeitas ? (
                      /* ── LIBERADO + AULAS CONCLUÍDAS — form inline ── */
                      <CertResgateForm />
                    ) : (
                      /* ── LIBERADO MAS AULAS PENDENTES ── */
                      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-center">
                        <p className="text-xs text-white/30">Assista às 3 aulas ao vivo para liberar o resgate.</p>
                      </div>
                    )}
                  </div>
                </StepCard>

              </div>
            </>
          )}
        </div>
      </div>
  )
}
