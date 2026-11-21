'use client'

/**
 * Formulário de entrada das páginas de formação (site institucional).
 *
 * Coleta nome/WhatsApp/e-mail e manda a pessoa pra ficha de inscrição do CRM
 * (sistema.idmpsi.com.br/inscricao/<slug>) já com tudo preenchido por query
 * string — ninguém digita os mesmos dados duas vezes.
 *
 * O lead em si é registrado pela própria ficha assim que ela abre com os
 * dados válidos (edge function `formacao-inscricao-criar`), então quem
 * preenche aqui e desiste antes de pagar continua aparecendo no Kanban da
 * vendedora. Uma fonte só criando lead = sem card duplicado.
 */

import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'

const CRM_URL = 'https://sistema.idmpsi.com.br'

function formatarWhatsapp(valor: string) {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function FormacaoInscricaoForm({
  slug,
  ctaLabel = 'Garantir minha vaga',
}: {
  slug: string
  ctaLabel?: string
}) {
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState('')
  const [indo, setIndo] = useState(false)

  const digitos = whatsapp.replace(/\D/g, '')

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (nome.trim().length < 2) return setErro('Digite seu nome completo.')
    if (digitos.length < 10) return setErro('Digite o WhatsApp com DDD.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErro('Digite um e-mail válido.')

    setErro('')
    setIndo(true)
    const params = new URLSearchParams({
      nome: nome.trim(),
      whatsapp: digitos,
      email: email.trim().toLowerCase(),
    })
    window.location.href = `${CRM_URL}/inscricao/${slug}?${params.toString()}`
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <input
        type="text"
        value={nome}
        onChange={e => setNome(e.target.value)}
        placeholder="Seu nome completo"
        autoComplete="name"
        className="fds-field"
      />
      <input
        type="tel"
        value={whatsapp}
        onChange={e => setWhatsapp(formatarWhatsapp(e.target.value))}
        placeholder="WhatsApp com DDD"
        autoComplete="tel"
        inputMode="numeric"
        className="fds-field"
      />
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Seu melhor e-mail"
        autoComplete="email"
        className="fds-field"
      />

      {erro && <p style={{ fontSize: 'var(--fds-caption)', color: '#ff8a8a' }}>{erro}</p>}

      <button
        type="submit"
        disabled={indo}
        className="fds-btn fds-btn--primary group w-full" style={{ paddingBlock: 'var(--fds-4)' }}
      >
        {indo ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            {ctaLabel}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </>
        )}
      </button>

      <p className="text-[11px] text-[#383838] text-center leading-relaxed">
        Pagamento seguro via Mercado Pago · Pix ou cartão
      </p>
    </form>
  )
}
