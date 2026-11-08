'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { Plus, Pencil, Trash2, Eye, EyeOff, GripVertical, LayoutTemplate, Megaphone, X, Loader2, Check } from 'lucide-react'
import { createBannerSlide, updateBannerSlide, deleteBannerSlide, toggleBannerActive } from '@/lib/actions/banners'
import type { BannerSlide } from '@/lib/actions/banners'

const PLACEMENT_LABEL: Record<string, string> = {
  hero: 'Hero (Banner principal)',
  promo: 'Propaganda (entre seções)',
}

const PLACEMENT_COLOR: Record<string, string> = {
  hero: '#c79a3b',
  promo: '#3b82f6',
}

const EMPTY: Partial<BannerSlide> = {
  title: '',
  subtitle: '',
  badge_label: '',
  image_url: '',
  cta_label: 'Saiba mais',
  cta_url: '',
  open_in_new: false,
  placement: 'hero',
  sort_order: 0,
  is_active: true,
}

export function BannersClient({ initialSlides }: { initialSlides: BannerSlide[] }) {
  const [slides, setSlides] = useState(initialSlides)
  const [editing, setEditing] = useState<Partial<BannerSlide> | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  function openNew() {
    setEditingId(null)
    setEditing({ ...EMPTY })
  }

  function openEdit(slide: BannerSlide) {
    setEditingId(slide.id)
    setEditing({ ...slide })
  }

  function closeEdit() {
    setEditingId(null)
    setEditing(null)
    setFeedback(null)
  }

  function showFeedback(type: 'ok' | 'err', msg: string) {
    setFeedback({ type, msg })
    if (type === 'ok') setTimeout(() => setFeedback(null), 3000)
  }

  function handleSave() {
    if (!editing) return
    const fd = new FormData()
    Object.entries(editing).forEach(([k, v]) => {
      if (v !== undefined && v !== null) fd.set(k, String(v))
    })

    startTransition(async () => {
      const res = editingId
        ? await updateBannerSlide(editingId, fd)
        : await createBannerSlide(fd)

      if (res?.error) {
        showFeedback('err', res.error)
        return
      }

      showFeedback('ok', editingId ? 'Banner atualizado!' : 'Banner criado!')
      // Reload slides
      window.location.reload()
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Excluir este banner?')) return
    startTransition(async () => {
      await deleteBannerSlide(id)
      setSlides(s => s.filter(x => x.id !== id))
    })
  }

  function handleToggle(slide: BannerSlide) {
    startTransition(async () => {
      await toggleBannerActive(slide.id, !slide.is_active)
      setSlides(s => s.map(x => x.id === slide.id ? { ...x, is_active: !x.is_active } : x))
    })
  }

  const heroSlides = slides.filter(s => s.placement === 'hero')
  const promoSlides = slides.filter(s => s.placement === 'promo')

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Banners & Propaganda</h1>
          <p className="text-sm mt-1 text-[#606060]">Configure os slides do hero e as seções de propaganda do dashboard.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors"
          style={{ background: '#c79a3b', color: '#0a0a0a' }}
        >
          <Plus className="h-4 w-4" /> Novo banner
        </button>
      </div>

      {/* Hero slides */}
      <SlideGroup
        title="Hero — Carrossel principal"
        icon={<LayoutTemplate className="h-4 w-4" />}
        color="#c79a3b"
        slides={heroSlides}
        onEdit={openEdit}
        onDelete={handleDelete}
        onToggle={handleToggle}
        hint="Aparecem no banner rotativo no topo do dashboard dos membros."
      />

      {/* Promo slides */}
      <SlideGroup
        title="Propaganda — Entre seções"
        icon={<Megaphone className="h-4 w-4" />}
        color="#3b82f6"
        slides={promoSlides}
        onEdit={openEdit}
        onDelete={handleDelete}
        onToggle={handleToggle}
        hint="Aparecem como cards de propaganda entre os carrosséis de cursos."
      />

      {/* Modal de edição */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={e => e.target === e.currentTarget && closeEdit()}
        >
          <div className="w-full max-w-lg rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
            style={{ background: '#111111', border: '1px solid #222222' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{editingId ? 'Editar banner' : 'Novo banner'}</h2>
              <button onClick={closeEdit} className="text-[#606060] hover:text-white transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Posição */}
              <Field label="Posição">
                <select
                  value={editing.placement ?? 'hero'}
                  onChange={e => setEditing(v => ({ ...v, placement: e.target.value as 'hero' | 'promo' }))}
                  className="w-full h-10 px-3 rounded-xl text-sm text-white outline-none"
                  style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
                >
                  <option value="hero">Hero (Banner principal)</option>
                  <option value="promo">Propaganda (entre seções)</option>
                </select>
              </Field>

              {/* Título */}
              <Field label="Título *">
                <input
                  value={editing.title ?? ''}
                  onChange={e => setEditing(v => ({ ...v, title: e.target.value }))}
                  placeholder="Ex: Nova Turma de Psicanálise"
                  className="w-full h-10 px-3 rounded-xl text-sm text-white outline-none"
                  style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
                />
              </Field>

              {/* Subtítulo */}
              <Field label="Subtítulo">
                <textarea
                  value={editing.subtitle ?? ''}
                  onChange={e => setEditing(v => ({ ...v, subtitle: e.target.value }))}
                  placeholder="Descrição curta do banner..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl text-sm text-white resize-none outline-none"
                  style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
                />
              </Field>

              {/* Badge */}
              <Field label="Badge (etiqueta)">
                <input
                  value={editing.badge_label ?? ''}
                  onChange={e => setEditing(v => ({ ...v, badge_label: e.target.value }))}
                  placeholder="Ex: Próxima Turma, Novo, Exclusivo..."
                  className="w-full h-10 px-3 rounded-xl text-sm text-white outline-none"
                  style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
                />
              </Field>

              {/* Imagem */}
              <Field label="URL da imagem">
                <input
                  value={editing.image_url ?? ''}
                  onChange={e => setEditing(v => ({ ...v, image_url: e.target.value }))}
                  placeholder="https://..."
                  type="url"
                  className="w-full h-10 px-3 rounded-xl text-sm text-white outline-none"
                  style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
                />
              </Field>

              {/* Preview imagem */}
              {editing.image_url && (
                <div className="relative h-28 rounded-xl overflow-hidden">
                  <Image src={editing.image_url} alt="Preview" fill className="object-cover" />
                </div>
              )}

              {/* CTA */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Texto do botão">
                  <input
                    value={editing.cta_label ?? ''}
                    onChange={e => setEditing(v => ({ ...v, cta_label: e.target.value }))}
                    placeholder="Ex: Garantir vaga"
                    className="w-full h-10 px-3 rounded-xl text-sm text-white outline-none"
                    style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
                  />
                </Field>
                <Field label="Link do botão">
                  <input
                    value={editing.cta_url ?? ''}
                    onChange={e => setEditing(v => ({ ...v, cta_url: e.target.value }))}
                    placeholder="/lancamento ou https://..."
                    className="w-full h-10 px-3 rounded-xl text-sm text-white outline-none"
                    style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
                  />
                </Field>
              </div>

              {/* Ordem + configurações */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ordem de exibição">
                  <input
                    type="number"
                    value={editing.sort_order ?? 0}
                    onChange={e => setEditing(v => ({ ...v, sort_order: Number(e.target.value) }))}
                    className="w-full h-10 px-3 rounded-xl text-sm text-white outline-none"
                    style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
                  />
                </Field>
                <Field label="Status">
                  <div className="flex items-center gap-3 h-10">
                    <button
                      type="button"
                      onClick={() => setEditing(v => ({ ...v, is_active: !v?.is_active }))}
                      className="flex items-center gap-2 text-sm font-medium transition-colors"
                      style={{ color: editing.is_active ? '#22c55e' : '#606060' }}
                    >
                      <div className="w-10 h-5 rounded-full flex items-center transition-colors px-0.5"
                        style={{ background: editing.is_active ? 'rgba(34,197,94,0.3)' : '#1a1a1a', border: '1px solid', borderColor: editing.is_active ? '#22c55e' : '#333' }}>
                        <div className="w-4 h-4 rounded-full transition-all"
                          style={{ background: editing.is_active ? '#22c55e' : '#333', transform: editing.is_active ? 'translateX(20px)' : 'translateX(0)' }} />
                      </div>
                      {editing.is_active ? 'Ativo' : 'Inativo'}
                    </button>
                  </div>
                </Field>
              </div>
            </div>

            {/* Feedback */}
            {feedback && (
              <div className="text-sm px-3 py-2 rounded-xl flex items-center gap-2"
                style={{
                  background: feedback.type === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  color: feedback.type === 'ok' ? '#22c55e' : '#ef4444',
                  border: `1px solid ${feedback.type === 'ok' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                }}>
                {feedback.type === 'ok' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {feedback.msg}
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSave}
                disabled={isPending || !editing.title?.trim()}
                className="flex-1 h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
                style={{ background: 'linear-gradient(135deg, #c79a3b, #e8b84b)', color: '#0a0a0a' }}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {editingId ? 'Salvar alterações' : 'Criar banner'}
              </button>
              <button onClick={closeEdit} className="h-11 px-4 rounded-xl text-sm font-medium text-[#606060] hover:text-white transition-colors"
                style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-[#888888] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

function SlideGroup({
  title, icon, color, slides, hint, onEdit, onDelete, onToggle
}: {
  title: string
  icon: React.ReactNode
  color: string
  slides: BannerSlide[]
  hint: string
  onEdit: (s: BannerSlide) => void
  onDelete: (id: string) => void
  onToggle: (s: BannerSlide) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: `${color}18`, color }}>
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">{title}</h2>
          <p className="text-xs text-[#606060]">{hint}</p>
        </div>
      </div>

      {slides.length === 0 ? (
        <div className="rounded-xl px-5 py-8 text-center text-sm text-[#444444]"
          style={{ border: '1px dashed #222222' }}>
          Nenhum banner configurado nesta posição.
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1a1a1a' }}>
          {slides.map((slide, i) => (
            <div
              key={slide.id}
              className="flex items-center gap-4 px-4 py-3"
              style={{ background: '#111111', borderBottom: i < slides.length - 1 ? '1px solid #1a1a1a' : 'none' }}
            >
              <GripVertical className="h-4 w-4 text-[#333] shrink-0 cursor-grab" />

              {/* Thumbnail */}
              <div className="w-16 h-10 rounded-lg overflow-hidden shrink-0"
                style={{ background: '#1a1a1a', border: '1px solid #222' }}>
                {slide.image_url ? (
                  <Image src={slide.image_url} alt={slide.title} width={64} height={40} className="object-cover w-full h-full" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#333] text-xs">sem img</div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white truncate">{slide.title}</p>
                  {slide.badge_label && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-bold"
                      style={{ background: `${color}18`, color }}>
                      {slide.badge_label}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#555] truncate">{slide.subtitle ?? slide.cta_url ?? '—'}</p>
              </div>

              {/* Ordem */}
              <span className="text-xs text-[#444] shrink-0">#{slide.sort_order}</span>

              {/* Ações */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onToggle(slide)}
                  className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[#1a1a1a]"
                  title={slide.is_active ? 'Desativar' : 'Ativar'}
                  style={{ color: slide.is_active ? '#22c55e' : '#444' }}
                >
                  {slide.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => onEdit(slide)}
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-[#888] hover:text-white hover:bg-[#1a1a1a] transition-colors"
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDelete(slide.id)}
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-[#555] hover:text-red-400 hover:bg-red-950/20 transition-colors"
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
