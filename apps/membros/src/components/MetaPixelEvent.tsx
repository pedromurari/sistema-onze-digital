'use client'
import { useEffect } from 'react'

interface MetaPixelEventProps {
  event: string
  email?: string
  phone?: string
  name?: string
}

export function MetaPixelEvent({ event, email, phone, name }: MetaPixelEventProps) {
  useEffect(() => {
    const eventId = `${event}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', event, {}, { eventID: eventId })
    }

    // CAPI server-side — dedup com o pixel via eventID, cobre ad blockers e Safari ITP
    fetch('/api/meta-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: event,
        email,
        phone,
        name,
        sourceUrl: window.location.href,
        eventId,
      }),
      keepalive: true,
    }).catch(() => {})
  }, [event, email, phone, name])
  return null
}
