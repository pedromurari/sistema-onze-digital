'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Maximize2, Minimize2, ChevronLeft, ChevronRight, List, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CinemaModeWrapperProps {
  children: React.ReactNode
  lessonTitle: string
  prevHref?: string
  nextHref?: string
  moduleList?: React.ReactNode
}

export function CinemaModeWrapper({
  children,
  lessonTitle,
  prevHref,
  nextHref,
  moduleList,
}: CinemaModeWrapperProps) {
  const [cinema, setCinema] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mostrar controles e reiniciar timer de ocultamento
  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setControlsVisible(false), 3000)
  }, [])

  // Atalhos de teclado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!cinema) return
      if (e.key === 'Escape') { setCinema(false); setSidebarOpen(false) }
      if (e.key === 'f' || e.key === 'F') setCinema(c => !c)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cinema])

  // Iniciar timer ao entrar em cinema
  useEffect(() => {
    if (cinema) {
      showControls()
    } else {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      setControlsVisible(true)
      setSidebarOpen(false)
    }
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [cinema, showControls])

  if (!cinema) {
    return (
      <div className="relative">
        {/* Botão para ativar cinema */}
        <button
          onClick={() => setCinema(true)}
          className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-lg bg-[#1a1a1a]/80 px-3 py-1.5 text-xs font-medium text-[#a0a0a0] hover:text-[#f0f0f0] hover:bg-[#242424] transition-colors backdrop-blur-sm border border-[#2a2a2a]"
          title="Modo cinema (F)"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Modo cinema</span>
        </button>
        {children}
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[#000000] flex flex-col"
      onMouseMove={showControls}
      onTouchStart={showControls}
    >
      {/* Vídeo centralizado — ocupa tudo */}
      <div className="flex-1 flex items-center justify-center min-h-0 px-0">
        <div className="w-full max-h-full" style={{ maxWidth: '90vw' }}>
          {children}
        </div>
      </div>

      {/* Barra de controles flutuante — some após 3s */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 transition-opacity duration-300',
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        <div className="bg-gradient-to-t from-[#000]/90 to-transparent px-4 pb-5 pt-8">
          <div className="flex items-center justify-between gap-4">

            {/* Título + navegação */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => { setCinema(false); setSidebarOpen(false) }}
                className="flex-shrink-0 p-1.5 rounded-lg text-[#a0a0a0] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] transition-colors"
                title="Sair do modo cinema (Esc)"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
              <span className="text-sm text-[#f0f0f0] font-medium truncate">{lessonTitle}</span>
            </div>

            {/* Controles de navegação */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {prevHref && (
                <Link
                  href={prevHref}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-[#a0a0a0] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Anterior
                </Link>
              )}
              {nextHref && (
                <Link
                  href={nextHref}
                  className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-bold bg-[#FFB800] text-[#0f0f0f] hover:bg-[#FFC933] transition-colors"
                >
                  Próxima <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
              <button
                onClick={() => setSidebarOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#a0a0a0] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] transition-colors"
              >
                {sidebarOpen ? <X className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">Módulos</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar de módulos (slide da direita) */}
      <div
        className={cn(
          'absolute right-0 top-0 bottom-0 w-72 bg-[#0f0f0f] border-l border-[#1a1a1a] transition-transform duration-300 overflow-y-auto z-10',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
          <span className="text-xs font-semibold text-[#f0f0f0]">Conteúdo do curso</span>
          <button onClick={() => setSidebarOpen(false)} className="text-[#606060] hover:text-[#f0f0f0]">
            <X className="h-4 w-4" />
          </button>
        </div>
        {moduleList}
      </div>
    </div>
  )
}
