'use client'

import { useState } from 'react'
import { Share2, Check } from 'lucide-react'

interface ShareCertificateButtonProps {
  userName: string
  certType: string
  issuedAt: string
}

export function ShareCertificateButton({ userName, certType, issuedAt }: ShareCertificateButtonProps) {
  const [shared, setShared] = useState(false)
  const [usedNativeShare, setUsedNativeShare] = useState(false)

  async function handleShare() {
    const date = new Date(issuedAt).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })

    const text =
      `✨ Acabei de conquistar meu certificado de "${certType}" no Instituto Despertamente!\n\n` +
      `📅 ${date}\n` +
      `🌱 Cada passo importa na jornada de autoconhecimento.\n\n` +
      `#InstitutoDespertamente #Autoconhecimento #Certificado`

    const hasNativeShare = typeof navigator.share === 'function'
    if (hasNativeShare) {
      await navigator.share({ title: `Certificado — ${certType}`, text })
      setUsedNativeShare(true)
    } else {
      await navigator.clipboard.writeText(text)
      setUsedNativeShare(false)
    }

    setShared(true)
    setTimeout(() => setShared(false), 3000)
  }

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all"
      style={{
        background: 'rgba(255,184,0,0.12)',
        color: shared ? '#FFB800' : 'rgba(255,255,255,0.6)',
        border: '1px solid rgba(255,184,0,0.20)',
      }}
    >
      {shared ? (
        <>
          <Check className="h-3.5 w-3.5 text-[#FFB800]" />
          {usedNativeShare ? 'Compartilhado!' : 'Texto copiado!'}
        </>
      ) : (
        <>
          <Share2 className="h-3.5 w-3.5" />
          Compartilhar conquista
        </>
      )}
    </button>
  )
}
