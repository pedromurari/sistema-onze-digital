'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:bg-white/10"
      style={{ color: copied ? '#FFB800' : 'rgba(255,255,255,0.4)' }}
      title="Copiar código"
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </button>
  )
}
