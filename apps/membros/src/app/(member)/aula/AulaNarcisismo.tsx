'use client'

import { useState } from 'react'
import {
  Sparkles, Lock, CheckCircle2, Circle, Download, FileText,
  Gift, Brain, RotateCcw,
} from 'lucide-react'

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────

const DRIVE_FILE_ID = '1HfrGZwI9yn46d9CnxaFIw2VG-F3_L-Gc'
const VIDEO_EMBED_URL = `https://drive.google.com/file/d/${DRIVE_FILE_ID}/preview`

const WA_NUMBER = '5511919434040'
const WA_MESSAGE = 'Quero resgatar meu presente da aula'
const WA_URL = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(WA_MESSAGE)}`

const PDF_URL = '/api/aula/material-pdf?download=1'

type Question = { pergunta: string; opcoes: string[] }

const QUESTIONS: Question[] = [
  {
    pergunta: 'Quem introduziu formalmente o conceito de narcisismo na psicanálise, no texto "Sobre o Narcisismo: Uma Introdução" (1914)?',
    opcoes: ['Carl Gustav Jung', 'Sigmund Freud', 'Jacques Lacan', 'Wilhelm Reich'],
  },
  {
    pergunta: 'Freud diferencia dois tipos de narcisismo. Quais são eles?',
    opcoes: ['Consciente e inconsciente', 'Primário e secundário', 'Social e individual', 'Ativo e passivo'],
  },
  {
    pergunta: 'Qual autor pós-freudiano é referência no estudo do "self grandioso"?',
    opcoes: ['Heinz Kohut', 'Anna Freud', 'Donald Winnicott', 'Erik Erikson'],
  },
  {
    pergunta: 'Na ótica psicanalítica, por trás da grandiosidade de uma pessoa narcisista geralmente existe:',
    opcoes: [
      'Uma autoestima genuinamente elevada e estável',
      'Uma fragilidade do self mascarada por uma imagem idealizada',
      'Total ausência de conflitos emocionais',
      'Uma maturidade emocional plena',
    ],
  },
  {
    pergunta: 'Um dos principais desafios nas relações com traços narcisistas, segundo a psicanálise, é:',
    opcoes: [
      'O excesso de empatia pelo outro',
      'A dificuldade em reconhecer o outro como um sujeito separado, com necessidades próprias',
      'O medo constante de qualquer tipo de conflito',
      'A recusa em falar sobre si mesmo',
    ],
  },
]

// ─────────────────────────────────────────────
// QUIZ
// ─────────────────────────────────────────────
function Quiz({ initialResult, onDone }: {
  initialResult: { acertos: number; total: number } | null
  onDone: (r: { acertos: number; total: number }) => void
}) {
  const [respostas, setRespostas] = useState<(number | null)[]>(Array(QUESTIONS.length).fill(null))
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'erro'>('idle')
  const [erroMsg, setErroMsg] = useState('')
  const [result, setResult] = useState<{ acertos: number; total: number } | null>(initialResult)
  const [refazendo, setRefazendo] = useState(false)

  const completo = respostas.every((r) => r !== null)

  const handleSubmit = async () => {
    if (!completo) return
    setEstado('enviando')
    setErroMsg('')
    try {
      const res = await fetch('/api/aula/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respostas }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ acertos: data.acertos, total: data.total })
        setRefazendo(false)
        onDone({ acertos: data.acertos, total: data.total })
        setEstado('idle')
      } else {
        setEstado('erro')
        setErroMsg(data.error ?? 'Erro ao enviar. Tente novamente.')
      }
    } catch {
      setEstado('erro')
      setErroMsg('Erro de conexão. Tente novamente.')
    }
  }

  if (result && !refazendo) {
    return (
      <div className="text-center space-y-4 py-2">
        <div className="w-14 h-14 rounded-full bg-[#22c55e]/15 border-2 border-[#22c55e]/30 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-6 w-6 text-[#22c55e]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white/90">Quiz concluído!</p>
          <p className="text-xs text-white/40 mt-0.5">
            Você acertou <span className="text-[#FFB800] font-semibold">{result.acertos} de {result.total}</span> perguntas.
          </p>
        </div>
        <button
          onClick={() => { setRefazendo(true); setRespostas(Array(QUESTIONS.length).fill(null)) }}
          className="inline-flex items-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          <RotateCcw className="h-3 w-3" /> Refazer o quiz
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {QUESTIONS.map((q, qi) => (
        <div key={qi}>
          <p className="text-sm font-semibold text-white/85 leading-snug mb-3">
            <span className="text-[#FFB800]">{qi + 1}.</span> {q.pergunta}
          </p>
          <div className="space-y-2">
            {q.opcoes.map((op, oi) => {
              const selecionada = respostas[qi] === oi
              return (
                <button
                  key={oi}
                  type="button"
                  onClick={() => {
                    const next = [...respostas]
                    next[qi] = oi
                    setRespostas(next)
                  }}
                  className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition-all"
                  style={{
                    border: selecionada ? '1px solid rgba(255,184,0,0.45)' : '1px solid rgba(255,255,255,0.08)',
                    background: selecionada ? 'rgba(255,184,0,0.08)' : 'rgba(255,255,255,0.02)',
                    color: selecionada ? '#FFB800' : 'rgba(255,255,255,0.65)',
                  }}
                >
                  {selecionada
                    ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                    : <Circle className="h-4 w-4 shrink-0 text-white/15" />}
                  {op}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {estado === 'erro' && erroMsg && (
        <p className="text-xs text-red-400 leading-relaxed">{erroMsg}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!completo || estado === 'enviando'}
        className="w-full rounded-xl py-3.5 text-sm font-bold text-[#0D1638] disabled:opacity-40 transition-all active:scale-[0.98]"
        style={{ background: '#FFB800', boxShadow: completo ? '0 6px 20px rgba(255,184,0,0.25)' : 'none' }}
      >
        {estado === 'enviando' ? 'Enviando...' : 'Enviar respostas'}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export function AulaNarcisismo({
  firstName,
  quizResult,
}: {
  firstName: string
  quizResult: { acertos: number; total: number } | null
}) {
  const [result, setResult] = useState(quizResult)

  return (
    <div className="min-h-screen w-full bg-[#0D1638]">
      <div className="w-full max-w-2xl mx-auto px-5 sm:px-8 pt-10 pb-32">

        {/* ── HERO ─────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center justify-between border-t border-b border-white/[0.08] py-2.5 mb-7">
            <span className="text-[10px] uppercase tracking-[0.22em] text-white/30 font-medium">Instituto Despertamente</span>
            <span
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] px-2 py-0.5 rounded"
              style={{ border: '1px solid rgba(255,184,0,0.3)', color: '#FFB800' }}
            >
              <Lock className="h-2.5 w-2.5" /> Acesso Exclusivo
            </span>
          </div>

          <h1 className="font-display text-[2.4rem] sm:text-[3rem] font-bold text-white mb-4" style={{ lineHeight: 1.02 }}>
            Olá{firstName ? `, ${firstName}` : ''} 👋
            <br />
            <span style={{ color: '#FFB800' }}>Sua aula liberada</span>
          </h1>

          <div className="h-px bg-white/[0.08] mb-5" />

          <p className="text-sm text-white/60 leading-relaxed">
            <span className="text-white/85 font-semibold">Narcisismo na Ótica da Psicanálise</span> — um conteúdo
            que só quem chegou até aqui tem acesso. Assista com atenção, baixe o ebook de apoio e, ao final,
            resgate um presente especial no WhatsApp.
          </p>
        </div>

        {/* ── POR QUE VALE A PENA ─────────────── */}
        <div
          className="rounded-2xl p-5 mb-8"
          style={{ border: '1px solid rgba(255,184,0,0.18)', background: 'rgba(255,184,0,0.04)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-[#FFB800]" />
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#FFB800]">Por que concluir essa aula</p>
          </div>
          <ul className="space-y-2.5">
            {[
              'Conteúdo raro sobre narcisismo direto da ótica da psicanálise — não é senso comum de internet.',
              'Vai te ajudar a reconhecer padrões narcisistas em relações reais, com mais clareza e menos culpa.',
              'O ebook de apoio já está liberado aqui embaixo, pra você aprofundar no seu tempo.',
              'Ao concluir, você resgata um presente exclusivo direto no WhatsApp.',
            ].map((txt, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-white/65 leading-relaxed">
                <CheckCircle2 className="h-4 w-4 text-[#FFB800]/70 shrink-0 mt-0.5" />
                {txt}
              </li>
            ))}
          </ul>
        </div>

        {/* ── VÍDEO ────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="h-4 w-4 text-[#FFB800]" />
            <p className="text-sm font-semibold text-white/85">Assista a aula completa</p>
          </div>
          <div
            className="rounded-2xl overflow-hidden border border-white/[0.08]"
            style={{ aspectRatio: '16/9', background: '#000' }}
          >
            <iframe
              src={VIDEO_EMBED_URL}
              allow="autoplay"
              allowFullScreen
              className="w-full h-full"
              style={{ border: 0 }}
            />
          </div>
        </div>

        {/* ── QUIZ ─────────────────────────────── */}
        <div
          className="rounded-2xl border border-white/[0.08] bg-[#0A1232] p-5 mb-8"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-white/40">Quiz rápido</span>
          </div>
          <h2 className="font-display text-xl font-bold text-white mb-1">Testou o que aprendeu?</h2>
          <p className="text-xs text-white/35 mb-5">5 perguntas rápidas sobre o tema da aula.</p>
          <Quiz initialResult={result} onDone={setResult} />
        </div>

        {/* ── MATERIAL DE APOIO ────────────────── */}
        <div
          className="rounded-2xl p-5 mb-8 flex items-center gap-4"
          style={{ border: '1px solid rgba(255,255,255,0.08)', background: '#0A1232' }}
        >
          <div className="w-12 h-12 rounded-2xl bg-[#FFB800]/10 border border-[#FFB800]/20 flex items-center justify-center shrink-0">
            <FileText className="h-6 w-6 text-[#FFB800]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white/85">Ebook exclusivo — Desenvolvimento da Personalidade</p>
            <p className="text-xs text-white/35 mt-0.5 leading-relaxed">
              Material de apoio em PDF do Instituto Despertamente, aprofundando o tema da aula.
            </p>
          </div>
          <a
            href={PDF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-[#0D1638] transition-all active:scale-[0.98]"
            style={{ background: '#FFB800' }}
          >
            <Download className="h-3.5 w-3.5" /> Baixar
          </a>
        </div>

      </div>

      {/* ── CTA WHATSAPP — sempre visível ────── */}
      <div
        className="fixed left-0 right-0 z-50 border-t bottom-[60px] md:bottom-0"
        style={{ borderColor: 'rgba(37,211,102,0.25)', background: 'rgba(13,22,56,0.92)', backdropFilter: 'blur(12px)' }}
      >
        <div className="w-full max-w-2xl mx-auto px-5 sm:px-8 py-3.5">
          <a
            href={WA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl py-3.5 px-4 text-[15px] font-bold text-white text-center whitespace-nowrap transition-all active:scale-[0.98]"
            style={{ background: '#25D366', boxShadow: '0 8px 32px rgba(37,211,102,0.30)' }}
          >
            <Gift className="h-5 w-5 shrink-0" />
            <span className="hidden sm:inline">Resgatar meu presente no WhatsApp</span>
            <span className="sm:hidden">Resgatar presente</span>
          </a>
        </div>
      </div>
    </div>
  )
}
