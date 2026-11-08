'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, ShoppingBag, Award, Sparkles } from 'lucide-react'

const baseTabs = [
  { href: '/lancamento', label: 'Semana', icon: CalendarDays },
]

export function MobileTabBar({ hasNpaAccess = false, hasNpsAccess = false }: { hasNpaAccess?: boolean; hasNpsAccess?: boolean }) {
  const pathname = usePathname()
  const tabs = [
    ...baseTabs,
    ...(hasNpaAccess ? [{ href: '/mentoria-npa', label: 'Mentoria NPA', icon: Sparkles, badge: 'NOVO' }] : []),
    ...(hasNpsAccess ? [{ href: '/mentoria-nps', label: 'Mentoria NPS', icon: Sparkles, badge: undefined as string | undefined }] : []),
  ]

  function isActive(href: string) {
    return pathname.startsWith(href)
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden"
      style={{
        background: 'rgba(10,18,50,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 6px)',
      }}
    >
      <div className="flex items-stretch justify-around px-1 pt-1.5 pb-0.5">
        {tabs.map(({ href, label, icon: Icon, badge }: { href: string; label: string; icon: typeof Sparkles; badge?: string }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 px-1 py-1.5 rounded-xl transition-all duration-200 relative"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {/* Pill indicator */}
              {active && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full"
                  style={{ background: 'linear-gradient(90deg, #FFB800, #FFC933)' }}
                />
              )}

              <div
                className="relative flex items-center justify-center w-9 h-7 rounded-xl transition-all duration-200"
                style={{
                  background: active ? 'rgba(255,184,0,0.12)' : 'transparent',
                }}
              >
                {badge && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full"
                    style={{ background: '#FFB800' }}
                  />
                )}
                <Icon
                  style={{
                    width: '1.125rem',
                    height: '1.125rem',
                    color: active ? '#FFB800' : 'rgba(255,255,255,0.30)',
                    strokeWidth: active ? 2.5 : 1.8,
                    transition: 'color 0.2s, stroke-width 0.2s',
                  }}
                />
              </div>
              <span
                className="text-[9.5px] font-semibold leading-none transition-colors duration-200 truncate max-w-full"
                style={{ color: active ? '#FFB800' : 'rgba(255,255,255,0.30)' }}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
