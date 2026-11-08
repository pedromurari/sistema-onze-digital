import { Bell, Search } from 'lucide-react'
import { MobileSidebar } from './MobileSidebar'
import type { Profile } from '@/types'

export function TopBar({ profile }: { profile: Profile }) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-5 h-16 shrink-0"
      style={{ background: 'rgba(246,240,231,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(23,36,50,0.07)' }}
    >
      <div className="flex items-center gap-3">
        <MobileSidebar profile={profile} />
        <div
          className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm"
          style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(23,36,50,0.08)', color: '#5f6b78', minWidth: '200px' }}
        >
          <Search className="w-4 h-4 shrink-0" />
          <span>Buscar conteúdo...</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
          style={{ color: '#5f6b78', background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(23,36,50,0.08)' }}
        >
          <Bell className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #FFB800, #FFC933)' }}
          >
            {profile.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
          </div>
          <span className="hidden md:block text-sm font-semibold text-[#1a2430]">
            {profile.full_name?.split(' ')[0] ?? 'Olá'}
          </span>
        </div>
      </div>
    </header>
  )
}
