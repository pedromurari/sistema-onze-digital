'use client'

import { useState, useRef } from 'react'
import { Loader2, Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateProfile, uploadAvatar } from '@/lib/actions/profile'
import type { Profile } from '@/types'

export function ProfileForm({ profile, userEmail }: { profile: Profile; userEmail: string }) {
  const [loading, setLoading] = useState(false)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setSuccess(null)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const result = await updateProfile(fd)
    setLoading(false)
    if (result?.error) setError(result.error)
    if (result?.success) setSuccess(result.success)
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarLoading(true)
    const fd = new FormData()
    fd.append('avatar', file)
    const result = await uploadAvatar(fd)
    setAvatarLoading(false)
    if (result?.avatarUrl) setAvatarUrl(result.avatarUrl)
    if (result?.error) setError(result.error)
  }

  const initials = profile.full_name?.charAt(0)?.toUpperCase() ?? 'U'

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold overflow-hidden"
            style={{ background: 'rgba(255,184,0,0.15)', color: '#FFB800', border: '2px solid rgba(255,184,0,0.30)' }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : initials}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center transition-colors"
            style={{ background: 'linear-gradient(135deg, #FFB800, #FFC933)', color: '#0D1638' }}
          >
            {avatarLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>
        <div>
          <p className="font-semibold text-white">{profile.full_name ?? 'Usuário'}</p>
          <p className="text-xs text-white/40">{userEmail}</p>
        </div>
      </div>

      {/* Formulário */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="full_name" className="text-sm font-medium text-white">Nome completo</Label>
          <Input
            id="full_name"
            name="full_name"
            defaultValue={profile.full_name ?? ''}
            className="h-11 bg-secondary border-border text-white focus-visible:ring-primary"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-white/40">E-mail</Label>
          <Input
            value={userEmail}
            disabled
            className="h-11 border-border text-white/40"
            style={{ background: '#091028' }}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bio" className="text-sm font-medium text-white">Bio <span className="text-white/30">(opcional)</span></Label>
          <textarea
            id="bio"
            name="bio"
            defaultValue={profile.bio ?? ''}
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg text-sm text-white resize-none outline-none transition-colors focus:ring-2 focus:ring-primary"
            style={{ background: '#0A1232', border: '1px solid rgba(255,255,255,0.08)', color: '#ffffff' }}
            placeholder="Conte um pouco sobre você..."
          />
        </div>

        {error && (
          <div className="text-sm px-3 py-2 rounded-md" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}
        {success && (
          <div className="text-sm px-3 py-2 rounded-md" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
            {success}
          </div>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="h-11 px-6 text-sm font-semibold"
          style={{ background: 'linear-gradient(135deg, #FFB800, #FFC933)', color: '#0D1638', boxShadow: '0 4px 12px rgba(255,184,0,0.20)' }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar alterações'}
        </Button>
      </form>
    </div>
  )
}
