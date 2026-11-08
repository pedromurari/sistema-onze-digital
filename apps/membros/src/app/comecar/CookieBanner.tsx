'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const STORAGE_KEY = 'idm_cookie_consent'

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true)
  }, [])

  function accept() {
    localStorage.setItem(STORAGE_KEY, 'accepted')
    setVisible(false)
  }

  function reject() {
    localStorage.setItem(STORAGE_KEY, 'rejected')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] md:bottom-5 md:left-5 md:right-auto md:w-[420px]">
      <div className="bg-[#111111] border border-[#2a2a2a] md:rounded-2xl px-5 py-4 shadow-2xl">
        <p className="text-[13px] text-[#a0a0a0] leading-relaxed">
          Utilizamos cookies para melhorar sua experiência e personalizar conteúdo. Leia nossa{' '}
          <Link href="/privacidade" className="text-[#FFB800] hover:underline font-medium">
            Política de Privacidade
          </Link>
          .
        </p>
        <div className="flex gap-2 mt-3">
          <button
            onClick={reject}
            className="flex-1 py-2 rounded-xl text-xs font-semibold text-[#606060] border border-[#2a2a2a] hover:border-[#404040] hover:text-[#a0a0a0] transition-colors"
          >
            Rejeitar
          </button>
          <button
            onClick={accept}
            className="flex-1 py-2 rounded-xl text-xs font-bold bg-[#FFB800] text-[#080808] hover:bg-[#FFC933] transition-colors"
          >
            Aceitar cookies
          </button>
        </div>
      </div>
    </div>
  )
}
