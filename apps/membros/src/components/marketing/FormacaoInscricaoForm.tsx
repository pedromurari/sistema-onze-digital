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
        className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 text-sm text-[#f0f0f0] placeholder:text-[#505050] outline-none focus:border-[#FFB800]/50 transition-colors"
      />
      <input
        type="tel"
        value={whatsapp}
        onChange={e => setWhatsapp(formatarWhatsapp(e.target.value))}
        placeholder="WhatsApp com DDD"
        autoComplete="tel"
        inputMode="numeric"
        className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 text-sm text-[#f0f0f0] placeholder:text-[#505050] outline-none focus:border-[#FFB800]/50 transition-colors"
      />
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Seu melhor e-mail"
        autoComplete="email"
        className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 text-sm text-[#f0f0f0] placeholder:text-[#505050] outline-none focus:border-[#FFB800]/50 transition-colors"
      />

      {erro && <p className="text-xs text-red-400/90">{erro}</p>}

      <button
        type="submit"
        disabled={indo}
        className="group w-full flex items-center justify-center gap-2.5 py-4 rounded-xl bg-[#FFB800] text-sm font-bold text-[#0D1638] hover:bg-[#FFC933] transition-colors disabled:opacity-70"
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
