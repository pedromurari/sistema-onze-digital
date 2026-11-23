'use client'

/**
 * Modal de captura: pede nome e WhatsApp, grava o lead no CRM e manda a
 * pessoa pro WhatsApp com a mensagem já escrita. Dois campos e nada mais --
 * cada campo extra aqui é gente desistindo no meio.
 *
 * Nasceu pra Formação em Psicanálise (que continua sendo o padrão, sem
 * nenhuma prop) e hoje serve também a lista de espera das turmas fechadas e
 * o agendamento do Divã. Quem chama decide pra onde o lead vai (`endpoint` +
 * `corpoExtra`) e em qual conversa a pessoa cai (`whatsappUrl`).
 */

import { useEffect, useState } from 'react'
import { Loader2, MessageCircle, X } from 'lucide-react'

const WHATSAPP_PSICANALISE = '5511965781940'
const MENSAGEM_PSICANALISE =
  'Olá! Quero receber informações sobre a Formação em Psicanálise Integrativa do IDM.'
const WHATSAPP_URL_PSICANALISE = `https://wa.me/${WHATSAPP_PSICANALISE}?text=${encodeURIComponent(MENSAGEM_PSICANALISE)}`

export type LeadModalConfig = {
  /** Rota que grava o lead. Padrão: funil da Psicanálise. */
  endpoint?: string
  /** Campos a mais no corpo (ex: `{ produto }`, `{ terapeuta_id }`). */
  corpoExtra?: Record<string, string>
  /** Conversa de WhatsApp que abre depois do cadastro. */
  whatsappUrl?: string
  eyebrow?: string
  titulo?: string
  descricao?: string
  textoBotao?: string
}

function formatarWhatsapp(valor: string) {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function LeadWhatsappModal({
  aberto,
  onFechar,
  endpoint = '/api/lead-psicanalise',
  corpoExtra,
  whatsappUrl = WHATSAPP_URL_PSICANALISE,
  eyebrow = 'Formação em Psicanálise',
  titulo = 'Fale com nossa equipe',
  descricao = 'Preencha seus dados e nossa equipe entra em contato agora pelo WhatsApp.',
  textoBotao = 'Enviar e falar com consultor',
}: LeadModalConfig & { aberto: boolean; onFechar: () => void }) {
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [website, setWebsite] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    if (!aberto) return
    const fechaNoEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !enviando) onFechar()
    }
    document.addEventListener('keydown', fechaNoEsc)
    return () => document.removeEventListener('keydown', fechaNoEsc)
  }, [aberto, enviando, onFechar])

  if (!aberto) return null

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const digitos = whatsapp.replace(/\D/g, '')
    if (nome.trim().length < 2) return setErro('Digite seu nome completo.')
    if (digitos.length < 10) return setErro('Digite o WhatsApp com DDD.')

    setErro('')
    setEnviando(true)

    try {
      const resposta = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          whatsapp: digitos,
          website,
          referrer: document.referrer || '',
          ...Object.fromEntries(new URLSearchParams(window.location.search)),
          ...corpoExtra,
        }),
      })

      if (!resposta.ok) throw new Error('falha ao registrar')

      setOk(true)
      // Pequena pausa pro usuário ver a confirmação antes de trocar de app.
      setTimeout(() => window.location.assign(whatsappUrl), 1000)
    } catch {
      setErro('Não foi possível registrar seus dados. Tente novamente em instantes.')
      setEnviando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={() => !enviando && onFechar()}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className="fds-card w-full max-w-md"
        style={{ background: 'var(--fds-deep)', padding: 'var(--fds-8)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="fds-eyebrow block">{eyebrow}</p>
            <h3 className="fds-h3 mt-3">{titulo}</h3>
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={enviando}
            aria-label="Fechar"
            style={{ color: 'var(--fds-ink-3)' }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {ok ? (
          <p className="fds-body mt-6" style={{ maxWidth: 'none' }}>
            Pronto. Estamos te levando pro WhatsApp agora.
          </p>
        ) : (
          <form onSubmit={enviar} className="mt-6 space-y-4">
            <p className="fds-small">{descricao}</p>

            {/* Honeypot: invisível pra gente, irresistível pra bot. */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              style={{ position: 'absolute', left: -9999, width: 1, height: 1 }}
            />

            <div>
              <label className="fds-meta block" htmlFor="lead-nome">
                Nome completo
              </label>
              <input
                id="lead-nome"
                className="fds-field mt-2"
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Seu nome completo"
                autoComplete="name"
                required
              />
            </div>

            <div>
              <label className="fds-meta block" htmlFor="lead-whatsapp">
                WhatsApp com DDD
              </label>
              <input
                id="lead-whatsapp"
                className="fds-field mt-2"
                value={whatsapp}
                onChange={e => setWhatsapp(formatarWhatsapp(e.target.value))}
                placeholder="(11) 99999-9999"
                inputMode="tel"
                autoComplete="tel"
                required
              />
            </div>

            {erro && (
              <p className="fds-small" style={{ color: '#ff8f6b' }}>
                {erro}
              </p>
            )}

            <button
              type="submit"
              className="fds-btn fds-btn--primary w-full"
              disabled={enviando}
            >
              {enviando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
                </>
              ) : (
                <>
                  <MessageCircle className="h-4 w-4" /> {textoBotao}
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

/** Botão que abre o modal. Sem config, é o CTA da Psicanálise. */
export function LeadWhatsappCta({
  texto = 'Quero garantir minha vaga',
  variante = 'primary',
  className = '',
  style,
  ...config
}: LeadModalConfig & {
  texto?: string
  variante?: 'primary' | 'ghost'
  className?: string
  style?: React.CSSProperties
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={`fds-btn fds-btn--${variante} ${className}`}
        style={style}
      >
        {texto}
      </button>
      <LeadWhatsappModal {...config} aberto={aberto} onFechar={() => setAberto(false)} />
    </>
  )
}
