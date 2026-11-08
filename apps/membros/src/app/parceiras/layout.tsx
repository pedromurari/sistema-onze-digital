import type { Metadata } from 'next'
import Link from 'next/link'
import { requireParceirasAuth, parceirasLogout } from '@/lib/actions/parceirasAuth'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function ParceirasLayout({ children }: { children: React.ReactNode }) {
  await requireParceirasAuth()

  return (
    <div className="min-h-screen" style={{ background: '#0a0a0a' }}>
      <header style={{ borderBottom: '1px solid #1a1a1a' }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/parceiras" className="font-semibold tracking-tight text-white">
            Instituto Despertamente <span style={{ color: '#555' }}>/ parceiras</span>
          </Link>
          <form action={parceirasLogout}>
            <button type="submit" className="text-sm hover:text-white" style={{ color: '#888' }}>
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  )
}
