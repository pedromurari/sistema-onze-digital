'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, X, ChevronDown, User } from 'lucide-react'

type DropdownItem = { label: string; href: string }
type NavItem = { label: string; href: string; dropdown?: DropdownItem[] }

const NAV_ITEMS: NavItem[] = [
  { label: 'Início', href: '/' },
  {
    label: 'A IDM',
    href: '#sobre',
    dropdown: [
      { label: 'Sobre o Instituto', href: '#sobre' },
      { label: 'Nossa Metodologia', href: '#metodologia' },
      { label: 'Resultados', href: '#depoimentos' },
    ],
  },
  {
    label: 'Programas',
    href: '#programas',
    dropdown: [
      { label: 'Psicanálise Integrativa', href: '/programas/psicanalise-integrativa' },
      { label: 'IDM Pelo Brasil', href: '/programas/idm-pelo-brasil' },
      { label: 'NPA 2.0', href: '/loja' },
      { label: 'Ver todos os programas', href: '/loja' },
    ],
  },
  { label: 'Blog', href: '#blog' },
  { label: 'Contato', href: '#contato' },
]

function DropdownPanel({ items }: { items: DropdownItem[] }) {
  return (
    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 rounded-xl bg-[#09122C] border border-white/10 shadow-2xl shadow-black/40 py-1.5 z-50">
      {items.map(item => (
        <a
          key={item.label}
          href={item.href}
          className="block px-4 py-2.5 text-sm text-white/65 hover:text-white hover:bg-white/6 transition-colors"
        >
          {item.label}
        </a>
      ))}
    </div>
  )
}

function NavItemDesktop({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!item.dropdown) {
    return (
      <a href={item.href} className="text-sm font-medium text-white/60 hover:text-white transition-colors">
        {item.label}
      </a>
    )
  }

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        className="flex items-center gap-1 text-sm font-medium text-white/60 hover:text-white transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        {item.label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <DropdownPanel items={item.dropdown} />}
    </div>
  )
}

export function NavbarComecar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  return (
    <>
      <nav className="fixed top-0 inset-x-0 z-50 bg-[#09122C] border-b border-white/8 shadow-md">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-10 h-[72px] flex items-center justify-between gap-6">

          {/* Logo */}
          <a href="/" className="flex items-center gap-2.5 shrink-0 select-none">
            <Image
              src="/despertamente-simbolo-branco.png"
              alt="IDM"
              width={30}
              height={30}
              className="object-contain"
            />
            <span
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              className="text-[15px] font-bold text-white"
            >
              Instituto <span className="text-[#FFB800]">Despertamente</span>
            </span>
          </a>

          {/* Desktop nav links */}
          <div className="hidden lg:flex items-center gap-7 flex-1 justify-center">
            {NAV_ITEMS.map(item => (
              <NavItemDesktop key={item.label} item={item} />
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <a
              href="https://www.idmpsifranquia.com.br"
              className="text-sm font-semibold px-4 py-2 rounded-lg border border-[#FFB800]/50 text-[#FFB800] hover:bg-[#FFB800]/10 hover:border-[#FFB800] transition-all duration-200"
            >
              Seja um Franqueado
            </a>
            <Link
              href="/login"
              className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg bg-[#FFB800] text-[#09122C] hover:bg-[#FFC933] active:scale-[0.97] transition-all duration-200"
            >
              <User className="h-3.5 w-3.5" />
              Acesso Aluno
            </Link>
          </div>

          {/* Hamburger */}
          <button
            className="lg:hidden p-2 text-white/60 hover:text-white transition-colors"
            onClick={() => setMobileOpen(v => !v)}
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="absolute top-[72px] left-0 right-0 bg-[#09122C] border-b border-white/8 px-5 py-4 max-h-[calc(100vh-72px)] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="space-y-0.5">
              {NAV_ITEMS.map(item => (
                <div key={item.label}>
                  {item.dropdown ? (
                    <>
                      <button
                        className="w-full flex items-center justify-between py-3 px-3 rounded-xl text-[15px] font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                        onClick={() => setExpanded(expanded === item.label ? null : item.label)}
                      >
                        {item.label}
                        <ChevronDown className={`h-4 w-4 transition-transform ${expanded === item.label ? 'rotate-180' : ''}`} />
                      </button>
                      {expanded === item.label && (
                        <div className="pl-3 pb-1 space-y-0.5">
                          {item.dropdown.map(sub => (
                            <a
                              key={sub.label}
                              href={sub.href}
                              className="block py-2.5 px-4 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition-colors"
                              onClick={() => setMobileOpen(false)}
                            >
                              {sub.label}
                            </a>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <a
                      href={item.href}
                      className="block py-3 px-3 rounded-xl text-[15px] font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                      onClick={() => setMobileOpen(false)}
                    >
                      {item.label}
                    </a>
                  )}
                </div>
              ))}
            </div>
            <div className="pt-4 mt-3 space-y-2 border-t border-white/8">
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 py-3.5 rounded-xl text-[15px] font-bold bg-[#FFB800] text-[#09122C] hover:bg-[#FFC933] transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                <User className="h-4 w-4" />
                Acesso Aluno
              </Link>
              <a
                href="https://www.idmpsifranquia.com.br"
                className="flex items-center justify-center py-3 rounded-xl text-[15px] font-semibold text-[#FFB800] border border-[#FFB800]/40 hover:bg-[#FFB800]/8 transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                Seja um Franqueado
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
