'use client'

import { useState } from 'react'
import { Play } from 'lucide-react'

export function VideoPlayer({ youtubeId, title }: { youtubeId: string; title: string }) {
  const [playing, setPlaying] = useState(false)

  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black">
      {playing ? (
        <iframe
          className="absolute inset-0 w-full h-full"
          src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&controls=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 w-full h-full"
          aria-label={`Assistir: ${title}`}
        >
          <img
            src={`https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/30 transition-colors group-hover:from-black/60" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
              style={{ background: '#FFB800', boxShadow: '0 8px 32px rgba(255,184,0,0.35)' }}
            >
              <Play className="h-8 w-8 text-[#0D1638] ml-1" fill="#0D1638" />
            </div>
          </div>
        </button>
      )}
    </div>
  )
}
