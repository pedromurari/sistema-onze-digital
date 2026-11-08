import type { Metadata } from 'next'
import { ParceirasLoginForm } from '@/components/admin/ParceirasLoginForm'

export const metadata: Metadata = {
  title: 'Acesso Parceiras | Instituto Despertamente',
  robots: { index: false, follow: false },
}

export default function ParceirasLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: '#0a0a0a' }}>
      <div
        className="w-full max-w-sm rounded-2xl p-8"
        style={{ background: '#111', border: '1px solid #1a1a1a' }}
      >
        <h1 className="text-xl font-semibold text-white">Instituto Despertamente</h1>
        <p className="mt-1 text-sm" style={{ color: '#888' }}>
          Gerenciar páginas das parceiras
        </p>

        <ParceirasLoginForm />
      </div>
    </div>
  )
}
