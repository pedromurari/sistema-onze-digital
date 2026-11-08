'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Sparkles, Loader2 } from 'lucide-react'
import { useAbrirPerfilNpa, useAbrirMapaEsferas } from './useAbrirPerfilNpa'

export function VoltarButton() {
  const router = useRouter()

  function voltar() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <button
      onClick={voltar}
      className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white transition-colors"
    >
      <ArrowLeft className="w-3.5 h-3.5" /> Voltar
    </button>
  )
}

function SsoCard({ href, ready, title, subtitle }: { href: string; ready: boolean; title: string; subtitle: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={!ready}
      className="group relative w-full flex items-center gap-4 rounded-2xl p-5 text-left transition-all duration-300 hover:-translate-y-0.5"
      style={{
        background: 'linear-gradient(160deg, rgba(255,184,0,0.05), rgba(10,18,50,0) 65%), #0A1232',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div
        className="absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none"
        style={{ border: '1px solid rgba(255,184,0,0.30)', boxShadow: 'var(--gold-glow, 0 0 24px rgba(255,184,0,0.20))' }}
      />
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105"
        style={{ background: 'linear-gradient(135deg, rgba(255,184,0,0.18), rgba(255,184,0,0.06))', border: '1px solid rgba(255,184,0,0.25)' }}
      >
        {!ready ? <Loader2 className="w-4 h-4 text-[#FFB800] animate-spin" /> : <Sparkles className="w-4 h-4 text-[#FFB800]" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white">{title}</p>
        <p className="text-sm text-white/50">{subtitle}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-white/20 shrink-0 transition-all duration-300 group-hover:text-[#FFB800] group-hover:translate-x-0.5" />
    </a>
  )
}

export function PerfilNumerologicoCard() {
  const { href, ready } = useAbrirPerfilNpa()
  return <SsoCard href={href} ready={ready} title="Acessar Perfil Numerológico" subtitle="Incluso na sua Mentoria NPA." />
}

export function MapaEsferasCard() {
  const { href, ready } = useAbrirMapaEsferas()
  return <SsoCard href={href} ready={ready} title="Acessar Mapa 7 Esferas" subtitle="Seu mapa fica salvo — é só abrir de novo aqui." />
}
