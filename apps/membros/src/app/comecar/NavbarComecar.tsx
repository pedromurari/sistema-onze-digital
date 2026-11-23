'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, X, ChevronDown, User } from 'lucide-react'

type DropdownItem = { label: string; href: string }
type NavItem = { label: string; href: string; dropdown?: DropdownItem[] }

// Âncoras sempre apontam pra raiz explicitamente -- antes eram "#sobre"
// etc. direto, o que só funcionava se você já estivesse na home. Clicar
// nesses itens de dentro de uma página de programa (que reusa esta mesma
// navbar) não levava a lugar nenhum, só empilhava o fragmento na URL atual.
const NAV_ITEMS: NavItem[] = [
  { label: 'Início', href: '/' },
  // "A IDM" saiu em 21/11/2026 a pedido do Pedro: o dropdown inteiro
  // (Sobre o Instituto / Nossa Metodologia / Resultados) só apontava pra
  // âncoras da própria home — menu que abre pra levar a pessoa pra um
  // pedaço da página em que ela já está é peso sem função.
  {
    label: 'Programas',
    href: '/#programas',
    dropdown: [
      { label: 'Psicanálise Integrativa', href: '/programas/psicanalise-integrativa' },
      { label: 'Despertar Sistêmico (Constelação Familiar)', href: '/programas/constelacao-familiar' },
      { label: 'Mentoria NPS', href: '/programas/mentoria-nps' },
      { label: 'Mentoria NPA', href: '/programas/mentoria-npa' },
      { label: 'Practitioner em PNL', href: '/programas/practitioner-pnl' },
      { label: 'IDM Pelo Brasil', href: '/programas/idm-pelo-brasil' },
      { label: 'Divã IDM (terapia)', href: '/programas/diva-idm' },
      { label: 'Ver todos os programas', href: '/loja' },
    ],
  },
  { label: 'Blog', href: '/blog' },
  { label: 'Contato', href: '/contato' },
]

function DropdownPanel({ items }: { items: DropdownItem[] }) {
  // O respiro entre o botão e o painel é PADDING deste wrapper, não margin do
  // painel. Com `mt-2` havia 8px que não pertenciam a elemento nenhum: ao
  // descer o mouse pra clicar num programa, o cursor saía da área de hover no
  // meio do caminho, o onMouseLeave disparava e o menu fechava na cara da
  // pessoa (achado do Pedro, 21/11/2026). Como padding, o vão continua
  // existindo visualmente mas faz parte da área que mantém o menu aberto.
  return (
    <div className="absolute top-full left-1/2 z-50 w-60 -translate-x-1/2 pt-2">
      <div className="rounded-xl border border-white/10 bg-[#09122C] py-1.5">
        {items.map(item => (
          <a
            key={item.label}
            href={item.href}
            className="block px-4 py-2.5 text-sm text-white/65 transition-colors hover:bg-white/6 hover:text-white"
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  )
}

function NavItemDesktop({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Fecha com um respiro de 150ms em vez de na hora: quem desce o mouse na
  // diagonal (do botão pro último item da lista) passa de raspão por fora da
  // área, e fechar instantaneamente nesse caso faz o menu "fugir" do cursor.
  const fecharTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const abrir = () => {
    if (fecharTimer.current) {
      clearTimeout(fecharTimer.current)
      fecharTimer.current = null
    }
    setOpen(true)
  }
  const fecharComDelay = () => {
    if (fecharTimer.current) clearTimeout(fecharTimer.current)
    fecharTimer.current = setTimeout(() => setOpen(false), 150)
  }

  useEffect(() => () => {
    if (fecharTimer.current) clearTimeout(fecharTimer.current)
  }, [])

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
      onMouseEnter={abrir}
      onMouseLeave={fecharComDelay}
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
