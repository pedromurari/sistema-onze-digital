'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { createPartner } from '@/lib/actions/parceiras'
import { ParceiraThemePicker } from './ParceiraThemePicker'
import type { PartnerTheme } from '@/types'

const inputCls =
  'w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-[#FFA902]'
const inputStyle = { background: '#0d0d0d', border: '1px solid #2a2a2a' }

export function NovaParceiraForm({ themes }: { themes: PartnerTheme[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErr(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await createPartner(formData)
      if (result.error) {
        setErr(result.error)
      } else {
        router.push(`/${result.slug}-admin`)
      }
    })
  }

  return (
    <div className="max-w-2xl space-y-6 pb-10">
      <div className="flex items-center gap-3">
        <Link
          href="/parceiras"
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
          style={{ background: '#1a1a1a', color: '#888' }}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">Nova parceira</h1>
          <p className="text-xs" style={{ color: '#555' }}>
            Preencha os dados básicos e escolha a identidade visual.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl p-5 space-y-4"
        style={{ background: '#111', border: '1px solid #1a1a1a' }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold" style={{ color: '#aaa' }}>
              Nome *
            </label>
            <input name="name" required className={inputCls} style={inputStyle} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold" style={{ color: '#aaa' }}>
              Slug (URL) *
            </label>
            <div
              className="flex items-center rounded-xl px-3 py-2.5 focus-within:ring-1 focus-within:ring-[#FFA902]"
              style={inputStyle}
            >
              <span style={{ color: '#555' }}>/</span>
              <input
                name="slug"
                required
                pattern="[a-z0-9-]+"
                title="apenas letras minúsculas, números e hífen"
                placeholder="nome-da-parceira"
                className="w-full bg-transparent text-sm text-white outline-none"
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold" style={{ color: '#aaa' }}>
            Frase de destaque
          </label>
          <input
            name="tagline"
            placeholder="Ex: Psicanálise e autoconhecimento"
            className={inputCls}
            style={inputStyle}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold" style={{ color: '#aaa' }}>
            Bio curta
          </label>
          <textarea
            name="bio"
            rows={3}
            className={inputCls}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold" style={{ color: '#aaa' }}>
            Identidade visual
          </p>
          <ParceiraThemePicker themes={themes} />
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
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-60"
          style={{ background: '#FFA902', color: '#0a0a0a' }}
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Criando...
            </>
          ) : (
            'Criar parceira'
          )}
        </button>
      </form>
    </div>
  )
}
