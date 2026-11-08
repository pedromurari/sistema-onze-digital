'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Menu, X, ShoppingBag, Award, User, LogOut, ChevronDown, CalendarDays, Shield, Home, Sparkles, GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut } from '@/lib/actions/auth'
import { IdmWordmark } from './IdmWordmark'
import type { Profile } from '@/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'

type NavLink = { href: string; label: string; icon: typeof Home; highlight: boolean; badge?: string }

const BASE_LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Início', icon: Home, highlight: false },
  { href: '/lancamento', label: 'Semana do Despertar', icon: CalendarDays, highlight: true },
]

interface TopNavbarProps {
  profile: Profile
  hasNpaAccess?: boolean
  hasNpsAccess?: boolean
  formacaoEnrolled?: boolean
}

export function TopNavbar({ profile, hasNpaAccess = false, hasNpsAccess = false, formacaoEnrolled = false }: TopNavbarProps) {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Quem tem acesso à Formação/Mentoria vê essas abas em destaque logo após o Início —
  // são a área principal dela(s). O link da Formação só existe pra quem está matriculado,
  // e aponta pra trilha dedicada (/formacao), não pro visualizador genérico de cursos.
  const links: NavLink[] = [
    BASE_LINKS[0],
    ...(formacaoEnrolled ? [{ href: '/formacao', label: 'Formação', icon: GraduationCap, highlight: true }] : []),
    ...(hasNpaAccess ? [{ href: '/mentoria-npa', label: 'Mentoria NPA', icon: Sparkles, highlight: false, badge: 'NOVO' }] : []),
    ...(hasNpsAccess ? [{ href: '/mentoria-nps', label: 'Mentoria NPS', icon: Sparkles, highlight: false }] : []),
    BASE_LINKS[1],
  ]

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const initials = profile.full_name
    ? profile.full_name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
    : 'U'

  return (
    <>
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-40 h-14 flex items-center transition-all duration-300',
          scrolled ? 'navbar-scrolled border-b border-white/[0.08]' : 'navbar-transparent'
        )}
      >
        <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 flex items-center gap-6">

          {/* Logo */}
          <Link href="/dashboard" className="flex-shrink-0">
            <IdmWordmark size="sm" variant="white" />
          </Link>

          {/* Nav links — desktop */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
            {links.map(({ href, label, badge }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150',
                  isActive(href)
                    ? 'text-[#FFB800] bg-[rgba(255,184,0,0.12)]'
                    : 'text-white/50 hover:text-white hover:bg-white/[0.07]'
                )}
              >
                {label}
                {badge && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#FFB800] text-[#0D1638] leading-none">
                    {badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          {/* Ações direita */}
          <div className="flex items-center gap-2 ml-auto">

            {/* Notificações */}
            <button
              className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.07] transition-colors relative"
              aria-label="Notificações"
            >
              <Bell className="h-4 w-4" />
            </button>

            {/* Avatar + dropdown — desktop */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="hidden md:flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.07] transition-colors">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#FFB800] to-[#FFC933] flex items-center justify-center text-[11px] font-bold text-[#0D1638] flex-shrink-0">
                    {initials}
                  </div>
                  <span className="text-xs text-white/50 max-w-[80px] truncate hidden lg:block">
                    {profile.full_name?.split(' ')[0] ?? 'Aluno'}
                  </span>
                  <ChevronDown className="h-3 w-3 text-white/30" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48 bg-[#0A1232] border-white/[0.10] text-white"
              >
                <DropdownMenuLabel className="text-white/40 font-normal text-xs">
                  {profile.full_name ?? 'Aluno'}
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/[0.08]" />
                <DropdownMenuItem asChild className="cursor-pointer hover:bg-white/[0.07] focus:bg-white/[0.07]">
                  <Link href="/perfil" className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5" /> Meu Perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer hover:bg-white/[0.07] focus:bg-white/[0.07]">
                  <Link href="/certificados" className="flex items-center gap-2">
                    <Award className="h-3.5 w-3.5" /> Certificados
                  </Link>
                </DropdownMenuItem>
                {profile.role === 'admin' && (
                  <DropdownMenuItem asChild className="cursor-pointer hover:bg-white/[0.07] focus:bg-white/[0.07]">
                    <Link href="/admin" className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5" /> Painel Admin
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator className="bg-white/[0.08]" />
                <DropdownMenuItem className="cursor-pointer text-red-400 hover:bg-white/[0.07] focus:bg-white/[0.07]" asChild>
                  <form action={signOut}>
                    <button type="submit" className="flex items-center gap-2 w-full">
                      <LogOut className="h-3.5 w-3.5" /> Sair
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Hamburger — mobile */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button className="md:hidden p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.07] transition-colors">
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 bg-[#0A1232] border-r border-white/[0.08] p-0">
                <div className="flex flex-col h-full">
                  {/* Header do Sheet */}
                  <div className="flex items-center justify-between px-5 h-14 border-b border-white/[0.08]">
                    <IdmWordmark size="sm" variant="white" />
                    <button onClick={() => setMobileOpen(false)} className="text-white/30 hover:text-white">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Perfil mobile */}
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.08]">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#FFB800] to-[#FFC933] flex items-center justify-center text-sm font-bold text-[#0D1638]">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{profile.full_name ?? 'Aluno'}</p>
                      <p className="text-xs text-white/35">{profile.role === 'admin' ? 'Admin' : 'Aluno'}</p>
                    </div>
                  </div>

                  {/* Links mobile */}
                  <nav className="flex-1 px-3 py-4 space-y-1">
                    {[
                      ...links,
                      { href: '/perfil', label: 'Meu Perfil', icon: User },
                      ...(profile.role === 'admin' ? [{ href: '/admin', label: 'Painel Admin', icon: Shield }] : []),
                    ].map(({ href, label, icon: Icon, badge }: { href: string; label: string; icon: typeof Home; badge?: string }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                          isActive(href)
                            ? 'bg-[rgba(255,184,0,0.12)] text-[#FFB800]'
                            : 'text-white/50 hover:text-white hover:bg-white/[0.07]'
                        )}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        {label}
                        {badge && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#FFB800] text-[#0D1638] leading-none">
                            {badge}
                          </span>
                        )}
                      </Link>
                    ))}
                  </nav>

                  {/* Sair mobile */}
                  <div className="px-3 pb-6 border-t border-white/[0.08] pt-3">
                    <form action={signOut}>
                      <button type="submit" className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-950/30 transition-colors">
                        <LogOut className="h-4 w-4" /> Sair da conta
                      </button>
                    </form>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Spacer para compensar navbar fixed */}
      <div className="h-14" aria-hidden="true" />
    </>
  )
}
