'use client'

import { useEffect } from 'react'

// Registra o service worker minimo (public/sw.js) — sem isso o navegador
// nao considera o site instalavel como PWA.
export function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('Falha ao registrar service worker:', error)
      })
    }
  }, [])

  return null
}
