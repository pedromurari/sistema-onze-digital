'use client'

import dynamic from 'next/dynamic'

export const HeroCarousel = dynamic(
  () => import('./HeroCarousel').then(m => ({ default: m.HeroCarousel })),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full bg-[#0D1638]"
        style={{ height: 'clamp(340px, 60vw, 600px)' }}
        aria-hidden="true"
      />
    ),
  }
)
