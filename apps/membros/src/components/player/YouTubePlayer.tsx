'use client'

import { useCallback, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { CheckCircle, Loader2 } from 'lucide-react'
import { markLessonComplete } from '@/lib/actions/progress'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactPlayer = dynamic(() => import('react-player'), { ssr: false }) as any

interface YouTubePlayerProps {
  videoUrl: string
  lessonId: string
  productSlug: string
  initialCompleted?: boolean
}

export function YouTubePlayer({ videoUrl, lessonId, productSlug, initialCompleted }: YouTubePlayerProps) {
  const [completed, setCompleted] = useState(initialCompleted ?? false)
  const [marking, setMarking] = useState(false)
  const [ready, setReady] = useState(false)
  const completedRef = useRef(false)

  const handleProgress = useCallback(
    async (state: { played: number }) => {
      if (state.played >= 0.9 && !completedRef.current) {
        completedRef.current = true
        setMarking(true)
        await markLessonComplete(lessonId, productSlug)
        setCompleted(true)
        setMarking(false)
      }
    },
    [lessonId, productSlug]
  )

  return (
    <div className="space-y-2">
      {/* Player wrapper 16:9 */}
      <div
        className="relative w-full rounded-xl overflow-hidden"
        style={{ paddingBottom: '56.25%', background: '#000' }}
      >
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#0a0a0a' }}>
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#FFA902' }} />
          </div>
        )}
        <div className="absolute inset-0">
          <ReactPlayer
            url={videoUrl}
            width="100%"
            height="100%"
            controls
            onReady={() => setReady(true)}
            onProgress={handleProgress}
            config={{
              youtube: {
                playerVars: { rel: 0, modestbranding: 1 },
              },
            }}
          />
        </div>
      </div>

      {/* Status de conclusão */}
      {completed && (
        <div
          className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg"
          style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}
        >
          <CheckCircle className="w-4 h-4" />
          Aula concluída!
        </div>
      )}
      {marking && (
        <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg" style={{ color: '#888888' }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Marcando como concluída...
        </div>
      )}
    </div>
  )
}
