'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function CopiarPix({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo)
    } catch {
      const area = document.createElement('textarea')
      area.value = codigo
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
    }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors"
      style={{
        background: copiado ? 'rgba(34,197,94,0.15)' : 'rgba(255,184,0,0.12)',
        color: copiado ? '#22c55e' : '#FFB800',
        border: `1px solid ${copiado ? 'rgba(34,197,94,0.35)' : 'rgba(255,184,0,0.30)'}`,
      }}
    >
      {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copiado ? 'Código copiado!' : 'Copiar código Pix'}
    </button>
  )
}
