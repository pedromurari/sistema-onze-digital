'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Eye, EyeOff, Trash2, Camera } from 'lucide-react'
import { deletePartner, setPartnerStatus, updatePartner, uploadPartnerAvatar } from '@/lib/actions/parceiras'
import { ParceiraThemePicker } from './ParceiraThemePicker'
import { ParceiraLinksManager } from './ParceiraLinksManager'
import type { Partner, PartnerLink, PartnerTheme } from '@/types'

const inputCls =
  'w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-[#FFA902]'
const inputStyle = { background: '#0d0d0d', border: '1px solid #2a2a2a' }

export function EditarParceiraForm({
  partner,
  themes,
  links,
}: {
  partner: Partner
  themes: PartnerTheme[]
  links: PartnerLink[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isStatusPending, startStatusTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [status, setStatus] = useState(partner.status)
  const [slug, setSlug] = useState(partner.slug)
  const [avatarUrl, setAvatarUrl] = useState(partner.avatar_url)
  const [avatarErr, setAvatarErr] = useState<string | null>(null)
  const [isUploadingAvatar, startAvatarTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarErr(null)

    const formData = new FormData()
    formData.set('avatar', file)

    startAvatarTransition(async () => {
      const result = await uploadPartnerAvatar(partner.id, slug, formData)
      if (result.error) {
        setAvatarErr(result.error)
      } else {
        setAvatarUrl(result.avatarUrl ?? null)
      }
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErr(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await updatePartner(partner.id, formData)
      if (result.error) {
        setErr(result.error)
      } else {
        setSlug(String(formData.get('slug')))
        router.refresh()
      }
    })
  }

  function handleToggleStatus() {
    const next = status === 'published' ? 'draft' : 'published'
    startStatusTransition(async () => {
      const result = await setPartnerStatus(partner.id, slug, next)
      if (!result.error) setStatus(next)
    })
  }

  function handleDelete() {
    if (!confirm(`Excluir "${partner.name}" permanentemente? Essa ação não pode ser desfeita.`)) return
    startTransition(async () => {
      await deletePartner(partner.id)
      router.push('/parceiras')
    })
  }

  return (
    <div className="max-w-2xl space-y-6 pb-16">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/parceiras"
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: '#1a1a1a', color: '#888' }}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white">{partner.name}</h1>
            <a
              href={`/${slug}`}
              target="_blank"
              className="text-xs underline"
              style={{ color: '#FFA902' }}
            >
              /{slug} ↗
            </a>
          </div>
        </div>

        <button
          type="button"
          onClick={handleToggleStatus}
          disabled={isStatusPending}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl font-medium disabled:opacity-60"
          style={
            status === 'published'
              ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e' }
              : { background: '#1a1a1a', color: '#888' }
          }
        >
          {status === 'published' ? (
            <>
              <Eye className="w-3.5 h-3.5" /> Publicada
            </>
          ) : (
            <>
              <EyeOff className="w-3.5 h-3.5" /> Rascunho
            </>
          )}
        </button>
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
            <input name="name" defaultValue={partner.name} required className={inputCls} style={inputStyle} />
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
                defaultValue={partner.slug}
                required
                pattern="[a-z0-9-]+"
                className="w-full bg-transparent text-sm text-white outline-none"
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold" style={{ color: '#aaa' }}>
            Frase de destaque
          </label>
          <input name="tagline" defaultValue={partner.tagline ?? ''} className={inputCls} style={inputStyle} />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold" style={{ color: '#aaa' }}>
            Bio curta
          </label>
          <textarea
            name="bio"
            rows={3}
            defaultValue={partner.bio ?? ''}
            className={inputCls}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold" style={{ color: '#aaa' }}>
            Foto
          </label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full disabled:opacity-60"
              style={{ background: '#0d0d0d', border: '1px solid #2a2a2a' }}
              aria-label="Trocar foto"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={partner.name} className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-6 w-6" style={{ color: '#555' }} />
              )}
              {isUploadingAvatar && (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.6)' }}
                >
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
            </button>
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                style={{ background: '#1a1a1a', color: '#fff' }}
              >
                {avatarUrl ? 'Trocar foto' : 'Adicionar foto'}
              </button>
              <p className="mt-1 text-xs" style={{ color: '#555' }}>
                JPG, PNG, WebP ou GIF — até 5MB
              </p>
              {avatarErr && <p className="mt-1 text-xs text-red-400">{avatarErr}</p>}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold" style={{ color: '#aaa' }}>
            Identidade visual
          </p>
          <ParceiraThemePicker themes={themes} defaultThemeId={partner.theme_id} />
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
              <Loader2 className="w-4 h-4 animate-spin" /> Salvando...
            </>
          ) : (
            'Salvar alterações'
          )}
        </button>
      </form>

      <div className="space-y-3">
        <h2 className="text-lg font-bold text-white">Links</h2>
        <ParceiraLinksManager partnerId={partner.id} slug={slug} initialLinks={links} />
      </div>

      <div className="pt-6" style={{ borderTop: '1px solid #1a1a1a' }}>
        <button
          type="button"
          onClick={handleDelete}
          className="flex items-center gap-1.5 text-sm hover:text-red-400"
          style={{ color: 'rgba(239,68,68,0.7)' }}
        >
          <Trash2 className="w-3.5 h-3.5" /> Excluir parceira permanentemente
        </button>
      </div>
    </div>
  )
}
