'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { verifyParceirasPassword } from '@/lib/actions/parceirasAuth'

const inputCls =
  'w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-[#FFA902]'
const inputStyle = { background: '#0d0d0d', border: '1px solid #2a2a2a' }

export function ParceirasLoginForm() {
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErr(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await verifyParceirasPassword(formData)
      if (result?.error) setErr(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold" style={{ color: '#aaa' }}>
          Senha
        </label>
        <input
          type="password"
          name="password"
          autoFocus
          required
          className={inputCls}
          style={inputStyle}
        />
      </div>

      {err && (
        <p
          className="text-sm px-3 py-2 rounded-xl"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          {err}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
        style={{ background: '#FFA902', color: '#0a0a0a' }}
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Entrando...
          </>
        ) : (
          'Entrar'
        )}
      </button>
    </form>
  )
}
