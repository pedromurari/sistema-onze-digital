'use client'

import { useState, useEffect, useRef } from 'react'
import { Copy, Check, Loader2, X } from 'lucide-react'

type Step = 'form' | 'loading' | 'pix' | 'paid' | 'error'

function maskCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{4})$/, '$1-$2')
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export interface CheckoutModalProps {
  open: boolean
  onClose: () => void
  produtoSlug: string
  titulo: string
  valor: number
  onPago?: (identifier: string) => void
}

export function CheckoutModal({ open, onClose, produtoSlug, titulo, valor, onPago }: CheckoutModalProps) {
  const [step, setStep] = useState<Step>('form')
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [pixCode, setPixCode] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!open) {
      setStep('form')
      setErro('')
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [open])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  if (!open) return null

  const submeter = async () => {
    setErro('')
    setStep('loading')
    try {
      const res = await fetch('/api/payments/syncpay/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produtoSlug, comprador: { nome, cpf, email, telefone } }),
      })
      const json = await res.json()
      if (!res.ok) {
        setErro(json.error || 'Erro ao gerar o Pix. Tente novamente.')
        setStep('error')
        return
      }
      setPixCode(json.pixCode)
      setStep('pix')

      pollRef.current = setInterval(async () => {
        const r = await fetch(`/api/payments/syncpay/status/${json.identifier}`)
        if (!r.ok) return
        const s = await r.json()
        if (s.status === 'completed') {
          if (pollRef.current) clearInterval(pollRef.current)
          setStep('paid')
          onPago?.(json.identifier)
        }
      }, 4000)
    } catch {
      setErro('Erro ao conectar com o pagamento. Tente novamente.')
      setStep('error')
    }
  }

  const copiar = () => {
    navigator.clipboard.writeText(pixCode)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-[#0D1638] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl p-6 sm:p-7 max-h-[92vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors" aria-label="Fechar">
          <X className="h-5 w-5" />
        </button>

        {step === 'form' && (
          <div className="space-y-5">
            <div>
              <p style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-2xl font-bold text-white">
                {titulo}
              </p>
              <p className="text-sm text-white/45 mt-1">{formatBRL(valor)} · Pix</p>
            </div>
            <div className="space-y-3">
              <input
                value={nome} onChange={e => setNome(e.target.value)}
                placeholder="Nome completo"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#FFB800]/50"
              />
              <input
                value={cpf} onChange={e => setCpf(maskCpf(e.target.value))}
                placeholder="CPF"
                inputMode="numeric"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#FFB800]/50"
              />
              <input
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="E-mail"
                type="email"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#FFB800]/50"
              />
              <input
                value={telefone} onChange={e => setTelefone(maskPhone(e.target.value))}
                placeholder="WhatsApp"
                inputMode="numeric"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#FFB800]/50"
              />
            </div>
            <button
              onClick={submeter}
              disabled={!nome || cpf.replace(/\D/g, '').length !== 11 || !email || telefone.replace(/\D/g, '').length < 10}
              className="w-full py-3.5 rounded-xl bg-[#FFB800] text-[#0D1638] font-bold text-sm hover:bg-[#FFC933] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Gerar Pix — {formatBRL(valor)}
            </button>
          </div>
        )}

        {step === 'loading' && (
          <div className="py-16 flex flex-col items-center gap-3">
            <Loader2 className="h-7 w-7 text-[#FFB800] animate-spin" />
            <p className="text-sm text-white/50">Gerando seu Pix...</p>
          </div>
        )}

        {step === 'pix' && (
          <div className="space-y-5">
            <div>
              <p style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-xl font-bold text-white">
                Pague com Pix
              </p>
              <p className="text-sm text-white/45 mt-1">{formatBRL(valor)} · confirmação automática</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] font-mono text-white/40 break-all leading-relaxed">{pixCode}</p>
            </div>
            <button
              onClick={copiar}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#FFB800] text-[#0D1638] font-bold text-sm hover:bg-[#FFC933] transition-colors"
            >
              {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiado ? 'Copiado!' : 'Copiar código Pix'}
            </button>
            <p className="text-xs text-white/35 text-center flex items-center justify-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Aguardando confirmação do pagamento...
            </p>
          </div>
        )}

        {step === 'paid' && (
          <div className="py-10 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-[#FFB800]/15 flex items-center justify-center">
              <Check className="h-7 w-7 text-[#FFB800]" />
            </div>
            <p style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-xl font-bold text-white">
              Pagamento confirmado!
            </p>
            <p className="text-sm text-white/50 max-w-xs">
              Em breve você recebe os detalhes pelo WhatsApp e e-mail.
            </p>
          </div>
        )}

        {step === 'error' && (
          <div className="py-10 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-red-300">{erro}</p>
            <button onClick={() => setStep('form')} className="text-sm text-[#FFB800] hover:text-[#FFC933] transition-colors">
              Tentar novamente
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function useCheckoutModal() {
  const [open, setOpen] = useState(false)
  return { open, abrir: () => setOpen(true), fechar: () => setOpen(false) }
}
