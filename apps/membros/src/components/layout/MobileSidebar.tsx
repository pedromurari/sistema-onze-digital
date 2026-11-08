'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, LayoutDashboard, BookOpen, User, Award, Video, LogOut } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { signOut } from '@/lib/actions/auth'
import { IdmWordmark } from './IdmWordmark'
import type { Profile } from '@/types'

const navItems = [
  { href: '/dashboard', label: 'Início', icon: LayoutDashboard },
  { href: '/cursos', label: 'Meus Cursos', icon: BookOpen },
  { href: '/ao-vivo', label: 'Aulas ao Vivo', icon: Video },
  { href: '/certificados', label: 'Certificados', icon: Award },
  { href: '/perfil', label: 'Meu Perfil', icon: User },
]

export function MobileSidebar({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
          style={{ color: '#1a2430', background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(23,36,50,0.08)' }}>
          <Menu className="w-5 h-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-60 p-0" style={{ background: '#fffaf3', borderRight: '1px solid rgba(23,36,50,0.08)' }}>
        <div className="flex items-center px-5 h-16" style={{ borderBottom: '1px solid rgba(23,36,50,0.07)' }}>
          <IdmWordmark size="md" />
        </div>
        <nav className="px-3 py-5 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'))
            return (
              <Link key={href} href={href} onClick={() => setOpen(false)}
                className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
                  active ? 'text-white' : 'text-[#5f6b78] hover:text-[#1a2430] hover:bg-[rgba(23,36,50,0.04)]')}
                style={active ? { background: 'linear-gradient(135deg, #1a2430, #2d3f52)', boxShadow: '0 4px 12px rgba(23,36,50,0.2)' } : undefined}>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={active ? { background: 'rgba(255,255,255,0.12)' } : { background: 'rgba(23,36,50,0.05)' }}>
                  <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
                </span>
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 px-3 pb-5 space-y-1" style={{ borderTop: '1px solid rgba(23,36,50,0.07)', paddingTop: '12px' }}>
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(23,36,50,0.03)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, #FFB800, #FFC933)' }}>
              {profile.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
            </div>
            <p className="text-sm font-bold text-[#1a2430] truncate">{profile.full_name ?? 'Usuário'}</p>
          </div>
          <form action={signOut}>
            <button type="submit" className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-[#5f6b78] hover:text-red-500 hover:bg-red-50 transition-all">
              <LogOut className="w-4 h-4" />Sair
            </button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
