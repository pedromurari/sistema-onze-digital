'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, BookOpen, Users, LogOut, Sparkles, BarChart3, Rocket, Plus, Settings, ShoppingBag, Star, Image, Radio, GraduationCap, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut } from '@/lib/actions/auth'
import type { Profile } from '@/types'

const adminNavItems = [
  { href: '/admin',              label: 'Dashboard',   icon: BarChart3,    exact: true },
  { href: '/admin/cursos',       label: 'Cursos',      icon: BookOpen },
  { href: '/admin/formacao',     label: 'Formação',    icon: GraduationCap },
  { href: '/admin/mentoria-npa/calendario', label: 'Mentoria NPA', icon: CalendarClock },
  { href: '/admin/mentoria-nps/calendario', label: 'Mentoria NPS', icon: CalendarClock },
  { href: '/admin/loja',         label: 'Loja',        icon: ShoppingBag },
  { href: '/admin/banners',      label: 'Banners',     icon: Image },
  { href: '/admin/ao-vivo',      label: 'Ao Vivo',     icon: Radio },
  { href: '/admin/depoimentos',  label: 'Depoimentos', icon: Star },
  { href: '/admin/lancamento',   label: 'Lançamento',  icon: Rocket },
  { href: '/admin/alunos',       label: 'Alunos',      icon: Users },
  { href: '/admin/configuracoes',label: 'Config',      icon: Settings },
]

export function AdminSidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname()

  function isActive(href: string, exact = false) {
    return exact ? pathname === href : pathname.startsWith(href)
  }

  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 sticky top-0 h-screen overflow-y-auto bg-[#0d0d0d] border-r border-[#1e1e1e]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-[#1e1e1e] shrink-0">
        <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-[#c79a3b]/15">
          <Sparkles className="h-4 w-4 text-[#c79a3b]" />
        </div>
        <div>
          <p className="text-sm font-bold text-[#f0f0f0]">IDM Admin</p>
          <p className="text-[10px] text-[#606060]">Painel administrativo</p>
        </div>
      </div>

      {/* Botão criar curso */}
      <div className="px-3 pt-4 pb-2">
        <Link href="/admin/cursos/novo"
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-[#c79a3b] py-2.5 text-xs font-bold text-[#0a0a0a] hover:bg-[#e8b84b] transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Novo Curso
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {adminNavItems.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact)
          return (
            <Link key={href} href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                active
                  ? 'bg-[#c79a3b]/10 text-[#c79a3b]'
                  : 'text-[#606060] hover:text-[#f0f0f0] hover:bg-[#1a1a1a]'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-5 pt-3 border-t border-[#1e1e1e] space-y-1">
        <Link href="/dashboard"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[#606060] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] transition-colors"
        >
          <LayoutDashboard className="h-4 w-4" /> Área do Aluno
        </Link>
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[#1a1a1a]">
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#c79a3b] to-[#e8b84b] flex items-center justify-center text-[11px] font-bold text-[#0a0a0a] flex-shrink-0">
            {profile.full_name?.charAt(0)?.toUpperCase() ?? 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[#f0f0f0] truncate">{profile.full_name ?? 'Admin'}</p>
            <p className="text-[10px] text-[#606060]">Admin</p>
          </div>
        </div>
        <form action={signOut}>
          <button type="submit" className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[#606060] hover:text-red-400 hover:bg-red-950/20 transition-colors">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </form>
      </div>
    </aside>
  )
}
