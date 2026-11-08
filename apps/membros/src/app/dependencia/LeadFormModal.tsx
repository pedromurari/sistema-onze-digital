'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2 } from 'lucide-react'

function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{4})$/, '$1-$2')
}

export function LeadFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  if (!open) return null

  const submeter = async () => {
    setErro('')
    setEnviando(true)
    try {
      const utm = new URLSearchParams(window.location.search)
      const res = await fetch('/api/leads/dependencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome, email, whatsapp,
          utm_source: utm.get('utm_source'),
          utm_medium: utm.get('utm_medium'),
          utm_campaign: utm.get('utm_campaign'),
          utm_content: utm.get('utm_content'),
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setErro(json.error || 'Erro ao enviar. Tente novamente.')
        setEnviando(false)
        return
      }

      router.push('/dependencia/obrigado')
    } catch {
      setErro('Erro ao conectar. Tente novamente.')
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-[#0D1638] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl p-6 sm:p-7">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors" aria-label="Fechar">
          <X className="h-5 w-5" />
        </button>

        <div className="space-y-5">
          <div>
            <p style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-2xl font-bold text-white">
              Quero entrar na lista de espera
            </p>
            <p className="text-sm text-white/45 mt-1">Você é avisada em primeira mão quando abrir, com condição de lançamento</p>
          </div>
          <div className="space-y-3">
            <input
              value={nome} onChange={e => setNome(e.target.value)}
              placeholder="Nome completo"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#FFB800]/50"
            />
            <input
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="E-mail"
              type="email"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#FFB800]/50"
            />
            <input
              value={whatsapp} onChange={e => setWhatsapp(maskPhone(e.target.value))}
              placeholder="WhatsApp"
              inputMode="numeric"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#FFB800]/50"
            />
          </div>
          {erro && <p className="text-sm text-red-300">{erro}</p>}
          <button
            onClick={submeter}
            disabled={enviando || !nome || !email || whatsapp.replace(/\D/g, '').length < 10}
            className="w-full py-3.5 rounded-xl bg-[#FFB800] text-[#0D1638] font-bold text-sm hover:bg-[#FFC933] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            {enviando ? 'Enviando...' : 'Entrar na lista de espera'}
          </button>
          <p className="text-[11px] text-white/30 text-center">
            Você recebe um e-mail e uma mensagem da Renata no WhatsApp confirmando sua entrada na lista.
          </p>
        </div>
      </div>
    </div>
  )
}
