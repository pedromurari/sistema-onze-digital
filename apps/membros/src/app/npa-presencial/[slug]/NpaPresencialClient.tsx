'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Lock, Sparkles, BookOpen, MessageCircle, CheckCircle2, Gift,
} from 'lucide-react'
import { SiInstagram } from 'react-icons/si'

const EQUIPE_WHATSAPP = '5511919434040'
const INSTAGRAM_RODRYGO = 'murarirodrygo'
const INSTAGRAM_DESPERTAMENTE = 'institutodespertamente'
const REFRESH_INTERVAL_MS = 20000

interface EventoInfo {
  nome: string
  local: string | null
  data_evento: string | null
  professor_convidado: string | null
}

interface Identificacao {
  leadId: string
  nome: string
}

function storageKey(slug: string) {
  return `npa-presencial:${slug}`
}

export function NpaPresencialClient({ slug }: { slug: string }) {
  const [loadingEvento, setLoadingEvento] = useState(true)
  const [eventoNaoEncontrado, setEventoNaoEncontrado] = useState(false)
  const [evento, setEvento] = useState<EventoInfo | null>(null)

  const [identificacao, setIdentificacao] = useState<Identificacao | null>(null)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [ebookUrl, setEbookUrl] = useState<string | null>(null)
  const [telasLiberado, setTelasLiberado] = useState(false)
  const [telasUrl, setTelasUrl] = useState<string | null>(null)
  const [mostrarOferta, setMostrarOferta] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelado = false
    fetch('/api/npa-presencial/evento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    })
      .then(async (res) => {
        if (cancelado) return
        if (res.status === 404) {
          setEventoNaoEncontrado(true)
          return
        }
        if (!res.ok) throw new Error('Erro ao buscar evento')
        const data = await res.json()
        setEvento(data)
      })
      .catch(() => {
        if (!cancelado) setEventoNaoEncontrado(true)
      })
      .finally(() => {
        if (!cancelado) setLoadingEvento(false)
      })
    return () => {
      cancelado = true
    }
  }, [slug])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(slug))
      if (raw) {
        const parsed = JSON.parse(raw) as Identificacao
        if (parsed?.leadId) setIdentificacao(parsed)
      }
    } catch {
      // localStorage indisponível — segue pedindo identificação normalmente
    }
  }, [slug])

  async function buscarEstadoAtual(leadId: string) {
    try {
      const res = await fetch('/api/npa-presencial/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, lead_id: leadId }),
      })
      if (res.status === 404) {
        // Cadastro não existe mais nesse evento (ex.: sincronização externa do CRM
        // substituiu os leads) — limpa a identificação salva e volta pro formulário,
        // em vez de ficar travado mostrando um estado antigo pra sempre.
        try {
          localStorage.removeItem(storageKey(slug))
        } catch {
          // segue mesmo assim
        }
        setIdentificacao(null)
        setEbookUrl(null)
        setTelasLiberado(false)
        setTelasUrl(null)
        return
      }
      if (!res.ok) return
      const data = await res.json()
      setEbookUrl(data.ebook_url ?? null)
      setTelasLiberado(!!data.telas_liberado)
      setTelasUrl(data.telas_url ?? null)
    } catch {
      // silencioso — próxima tentativa de polling cobre isso
    }
  }

  useEffect(() => {
    if (!identificacao) return

    buscarEstadoAtual(identificacao.leadId)

    function tick() {
      if (identificacao) buscarEstadoAtual(identificacao.leadId)
    }
    function onFocus() {
      tick()
    }

    pollRef.current = setInterval(tick, REFRESH_INTERVAL_MS)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identificacao?.leadId, slug])

  useEffect(() => {
    if (telasLiberado && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [telasLiberado])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!nome.trim() || (!email.trim() && !whatsapp.trim())) {
      setErro('Preencha seu nome e pelo menos e-mail ou WhatsApp.')
      return
    }

    setEnviando(true)
    try {
      const res = await fetch('/api/npa-presencial/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, nome, email, whatsapp }),
      })
      const data = await res.json()

      if (!res.ok) {
        setErro(data?.error || 'Não conseguimos confirmar seus dados. Tente de novo.')
        return
      }

      const nova: Identificacao = { leadId: data.lead_id, nome }
      setIdentificacao(nova)
      try {
        localStorage.setItem(storageKey(slug), JSON.stringify(nova))
      } catch {
        // segue sem persistir — funciona igual nesta sessão
      }

      setEbookUrl(data.ebook_url ?? null)
      setTelasLiberado(!!data.telas_liberado)
      setTelasUrl(data.telas_url ?? null)
    } catch {
      setErro('Erro de conexão. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  function handleVerTelas() {
    if (telasUrl) window.open(telasUrl, '_blank', 'noopener,noreferrer')
    setMostrarOferta(true)
  }

  const whatsappGeral = `https://wa.me/${EQUIPE_WHATSAPP}?text=${encodeURIComponent(
    'Olá! Estou na página de entrega do material do NPA e preciso de ajuda.'
  )}`

  const whatsappOferta = `https://wa.me/${EQUIPE_WHATSAPP}?text=${encodeURIComponent(
    `Olá! Sou ${identificacao?.nome ?? ''}, estive no ${
      evento?.nome ?? 'NPA'
    } e quero garantir minha sessão promocional de R$300 com o Rodrygo.`
  )}`

  const inputClass =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-[15px] text-white placeholder:text-white/30 focus:outline-none focus:border-[#FFB800]/50 transition-colors'

  const ctaClass =
    'w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#FFB800] px-6 py-3.5 text-sm font-bold text-[#0D1638] hover:bg-[#FFC933] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed'

  const primeiroNome = identificacao?.nome.split(' ')[0] ?? ''

  return (
    <div className="min-h-screen w-full bg-[#0D1638]">
      <div className="w-full max-w-2xl mx-auto px-5 sm:px-8 pt-10 pb-32">
        {/* ── BARRA SUPERIOR ─────────────────────── */}
        <div className="flex items-center justify-between border-t border-b border-white/[0.08] py-2.5 mb-7">
          <span className="text-[10px] uppercase tracking-[0.22em] text-white/30 font-medium">
            Instituto Despertamente
          </span>
          <span
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] px-2 py-0.5 rounded"
            style={{ border: '1px solid rgba(255,184,0,0.3)', color: '#FFB800' }}
          >
            {telasLiberado ? (
              <>
                <Sparkles className="h-2.5 w-2.5" /> Telas liberadas
              </>
            ) : (
              <>
                <Lock className="h-2.5 w-2.5" /> {evento?.nome ?? 'NPA'}
              </>
            )}
          </span>
        </div>

        {loadingEvento && <p className="text-center text-sm text-white/40 py-24">Carregando...</p>}

        {!loadingEvento && eventoNaoEncontrado && (
          <div className="text-center py-10">
            <h1 className="font-display text-3xl font-bold text-white mb-3">Evento não encontrado</h1>
            <p className="text-sm text-white/50 leading-relaxed">
              Confira o link com a equipe do NPA — ele pode ter mudado.
            </p>
          </div>
        )}

        {!loadingEvento && !eventoNaoEncontrado && evento && (
          <>
            {/* ── HERO ─────────────────────────────── */}
            <div className="mb-8">
              <h1
                className="font-display text-[2.2rem] sm:text-[2.8rem] font-bold text-white mb-4"
                style={{ lineHeight: 1.05 }}
              >
                {identificacao ? (
                  <>
                    Olá, {primeiroNome} 👋
                    <br />
                    <span style={{ color: '#FFB800' }}>Seu material chegou</span>
                  </>
                ) : (
                  <>
                    Sua entrega
                    <br />
                    <span style={{ color: '#FFB800' }}>está aqui</span>
                  </>
                )}
              </h1>

              <div className="h-px bg-white/[0.08] mb-5" />

              <p className="text-sm text-white/60 leading-relaxed">
                {identificacao ? (
                  <>
                    Seu e-book já está liberado abaixo. As telas numerológicas entram no ar{' '}
                    <span className="text-white/85 font-semibold">ao vivo, no fim da aula de hoje</span> — deixa essa
                    página aberta que ela avisa sozinha.
                  </>
                ) : (
                  <>
                    Esse é o lugar onde você resgata o material da sua aula do{' '}
                    <span className="text-white/85 font-semibold">{evento.nome}</span>. Preencha seus dados abaixo
                    pra liberar o seu.
                  </>
                )}
              </p>
            </div>

            {/* ── FORMULÁRIO (não identificado) ────── */}
            {!identificacao && (
              <div className="rounded-2xl border border-white/[0.08] bg-[#0A1232] p-6">
                <form onSubmit={handleSubmit} className="space-y-3">
                  <input
                    className={inputClass}
                    placeholder="Nome completo"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    autoComplete="name"
                  />
                  <input
                    className={inputClass}
                    placeholder="E-mail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                  <input
                    className={inputClass}
                    placeholder="WhatsApp"
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    autoComplete="tel"
                  />
                  {erro && <p className="text-sm text-red-300 text-center">{erro}</p>}
                  <button type="submit" disabled={enviando} className={`${ctaClass} mt-1`}>
                    {enviando ? 'Enviando...' : 'Liberar meu material'}
                  </button>
                </form>
              </div>
            )}

            {/* ── E-BOOK ───────────────────────────── */}
            {identificacao && (
              <div
                className="rounded-2xl p-5 mb-5 flex items-center gap-4"
                style={{ border: '1px solid rgba(255,255,255,0.08)', background: '#0A1232' }}
              >
                <div className="w-12 h-12 rounded-2xl bg-[#FFB800]/10 border border-[#FFB800]/20 flex items-center justify-center shrink-0">
                  <BookOpen className="h-6 w-6 text-[#FFB800]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white/90">Seu e-book</p>
                  <p className="text-xs text-white/40 mt-0.5 leading-relaxed">Acesso liberado agora</p>
                </div>
                {ebookUrl ? (
                  <a
                    href={ebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold text-[#0D1638] transition-all active:scale-[0.98]"
                    style={{ background: '#FFB800' }}
                  >
                    Abrir
                  </a>
                ) : (
                  <span className="shrink-0 text-[11px] text-white/30">em breve</span>
                )}
              </div>
            )}

            {/* ── TELAS — bloqueadas ───────────────── */}
            {identificacao && !telasLiberado && (
              <div className="relative rounded-2xl border border-white/[0.08] overflow-hidden mb-5 min-h-[168px]">
                <div
                  className="absolute -inset-6 blur-2xl"
                  style={{
                    background:
                      'radial-gradient(circle at 50% 50%, rgba(255,184,0,0.30) 0%, transparent 22%), repeating-conic-gradient(from 0deg, rgba(255,184,0,0.22) 0deg 8deg, transparent 8deg 24deg), radial-gradient(circle at 30% 70%, rgba(255,201,51,0.16) 0%, transparent 30%), radial-gradient(circle at 70% 30%, rgba(255,184,0,0.18) 0%, transparent 30%)',
                  }}
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'radial-gradient(circle at 50% 40%, rgba(10,18,50,0.55) 0%, rgba(10,18,50,0.94) 75%)',
                  }}
                />
                <div className="relative p-7 flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center mb-3">
                    <Lock className="h-5 w-5 text-white/60" />
                  </div>
                  <p className="font-display text-lg font-semibold text-white/85">Suas Telas Numerológicas</p>
                  <p className="text-white/40 text-xs mt-1.5">Libera ao vivo, no fim da aula de hoje</p>
                </div>
              </div>
            )}

            {/* ── TELAS — liberadas ────────────────── */}
            {identificacao && telasLiberado && (
              <div
                className="rounded-2xl p-5 mb-5 flex items-center gap-4"
                style={{ border: '1px solid rgba(255,184,0,0.3)', background: 'rgba(255,184,0,0.06)' }}
              >
                <div className="w-12 h-12 rounded-2xl bg-[#FFB800]/15 border border-[#FFB800]/25 flex items-center justify-center shrink-0">
                  <Sparkles className="h-6 w-6 text-[#FFB800]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white/90">Suas Telas Numerológicas</p>
                  <p className="text-xs text-white/40 mt-0.5">Liberado agora!</p>
                </div>
                <button
                  onClick={handleVerTelas}
                  className="shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold text-[#0D1638] transition-all active:scale-[0.98]"
                  style={{ background: '#FFB800' }}
                >
                  Ver telas
                </button>
              </div>
            )}

            {/* ── OFERTA RODRYGO ───────────────────── */}
            {identificacao && telasLiberado && mostrarOferta && (
              <div
                className="rounded-2xl p-5 mb-5"
                style={{ border: '1px solid rgba(255,184,0,0.18)', background: 'rgba(255,184,0,0.04)' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Gift className="h-4 w-4 text-[#FFB800]" />
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#FFB800]">
                    Oferta exclusiva de hoje
                  </p>
                </div>
                <h2 className="font-display text-xl font-bold text-white mb-1">
                  Sessão individual do seu mapa com o Rodrygo
                </h2>
                <p className="text-sm text-white/50 mb-4">Vagas limitadas hoje</p>

                <ul className="space-y-2 mb-4">
                  {[
                    'Leitura individual do seu mapa numerológico completo',
                    'Direto com o Rodrygo, sem intermediários',
                    'Poucas vagas — só pra quem esteve na aula de hoje',
                  ].map((txt) => (
                    <li key={txt} className="flex items-start gap-2.5 text-sm text-white/65 leading-relaxed">
                      <CheckCircle2 className="h-4 w-4 text-[#FFB800]/70 shrink-0 mt-0.5" />
                      {txt}
                    </li>
                  ))}
                </ul>

                <div className="flex items-baseline gap-3 mb-4">
                  <span className="text-sm text-white/30 line-through">R$850</span>
                  <span className="font-display text-3xl font-bold text-[#FFC933]">R$300</span>
                </div>

                <a href={whatsappOferta} target="_blank" rel="noopener noreferrer" className={ctaClass}>
                  Quero garantir minha vaga
                </a>

                <div className="flex justify-center gap-6 text-xs text-white/40 mt-5 pt-4 border-t border-white/[0.06]">
                  <a
                    href={`https://instagram.com/${INSTAGRAM_RODRYGO}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-[#FFB800] transition-colors"
                  >
                    <SiInstagram className="h-3.5 w-3.5" /> @{INSTAGRAM_RODRYGO}
                  </a>
                  <a
                    href={`https://instagram.com/${INSTAGRAM_DESPERTAMENTE}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-[#FFB800] transition-colors"
                  >
                    <SiInstagram className="h-3.5 w-3.5" /> @{INSTAGRAM_DESPERTAMENTE}
                  </a>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── CTA WHATSAPP — sempre visível ────────── */}
      <div
        className="fixed left-0 right-0 bottom-0 z-50 border-t"
        style={{ borderColor: 'rgba(37,211,102,0.25)', background: 'rgba(13,22,56,0.92)', backdropFilter: 'blur(12px)' }}
      >
        <div className="w-full max-w-2xl mx-auto px-5 sm:px-8 py-3.5">
          <a
            href={whatsappGeral}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl py-3.5 px-4 text-[15px] font-bold text-white text-center whitespace-nowrap transition-all active:scale-[0.98]"
            style={{ background: '#25D366', boxShadow: '0 8px 32px rgba(37,211,102,0.30)' }}
          >
            <MessageCircle className="h-5 w-5 shrink-0" />
            Falar com a equipe no WhatsApp
          </a>
        </div>
      </div>
    </div>
  )
}
