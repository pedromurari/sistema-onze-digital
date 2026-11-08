'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

function useSsoHandoff(baseUrl: string) {
  const [href, setHref] = useState(baseUrl)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      if (session) {
        const hash = new URLSearchParams({
          sso_at: session.access_token,
          sso_rt: session.refresh_token,
        }).toString()
        setHref(`${baseUrl}/#${hash}`)
      }
      setReady(true)
    })
    return () => { cancelled = true }
  }, [baseUrl])

  return { href, ready }
}

export function useAbrirPerfilNpa() {
  return useSsoHandoff('https://perfil-numerologico.vercel.app')
}

export function useAbrirMapaEsferas() {
  return useSsoHandoff('https://mapa.seunumerologo.com.br/mapa-7-esferas')
}
