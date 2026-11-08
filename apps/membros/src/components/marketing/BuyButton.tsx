'use client'

import { useState } from 'react'
import { ShoppingCart, Loader2, ExternalLink } from 'lucide-react'

interface BuyButtonProps {
  productId: string
  label?: string
  variant?: 'solid' | 'outline'
  className?: string
  checkoutUrl?: string | null
}

export function BuyButton({
  productId,
  label = 'Quero agora',
  variant = 'solid',
  className = '',
  checkoutUrl,
}: BuyButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleBuy() {
    setLoading(true)
    setError(null)

    // Fallback para checkout externo (Hotmart, etc.) se configurado
    if (checkoutUrl) {
      window.open(checkoutUrl, '_blank')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/payments/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 409) {
          setError('Você já possui acesso a este produto. Vá para Meus Cursos.')
        } else {
          setError(data.error ?? 'Erro ao processar. Tente novamente.')
        }
        return
      }

      // Redirecionar para o checkout do Mercado Pago
      window.location.href = data.initPoint
    } catch {
      setError('Falha de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const base =
    'inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all duration-200 cursor-pointer disabled:opacity-60'

  const variants = {
    solid:
      'bg-[#FFB800] hover:bg-[#FFC933] text-[#0D1638] shadow-md hover:shadow-lg hover:-translate-y-0.5',
    outline:
      'border-2 border-[#FFB800] text-[#FFB800] hover:bg-[#FFB800]/10 hover:-translate-y-0.5',
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleBuy}
        disabled={loading}
        className={`${base} ${variants[variant]} ${className}`}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : checkoutUrl ? (
          <ExternalLink className="h-4 w-4" />
        ) : (
          <ShoppingCart className="h-4 w-4" />
        )}
        {loading ? 'Processando...' : label}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
