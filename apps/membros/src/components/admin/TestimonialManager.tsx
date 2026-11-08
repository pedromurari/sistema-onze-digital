'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
  type AdminTestimonial,
} from '@/lib/actions/admin-store'
import { Pencil, Trash2, Plus, Star, Loader2, X, Check } from 'lucide-react'

const inputCls = "w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-[#FFA902]"
const inputStyle = { background: '#0d0d0d', border: '1px solid #2a2a2a' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold" style={{ color: '#aaa' }}>{label}</label>
      {children}
    </div>
  )
}

type FormState = {
  author_name: string
  author_role: string
  avatar_url: string
  content: string
  rating: string
  is_featured: boolean
  sort_order: string
}

const EMPTY: FormState = {
  author_name: '',
  author_role: '',
  avatar_url: '',
  content: '',
  rating: '5',
  is_featured: false,
  sort_order: '0',
}

function fromTestimonial(t: AdminTestimonial): FormState {
  return {
    author_name: t.author_name,
    author_role: t.author_role ?? '',
    avatar_url: t.avatar_url ?? '',
    content: t.content,
    rating: t.rating?.toString() ?? '5',
    is_featured: t.is_featured,
    sort_order: t.sort_order.toString(),
  }
}

export function TestimonialManager({ initial }: { initial: AdminTestimonial[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState<AdminTestimonial | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [err, setErr] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function openNew() {
    setEditing(null)
    setForm(EMPTY)
    setErr(null)
    setSuccess(false)
    setShowForm(true)
  }

  function openEdit(t: AdminTestimonial) {
    setEditing(t)
    setForm(fromTestimonial(t))
    setErr(null)
    setSuccess(false)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setForm(EMPTY)
    setErr(null)
  }

  function set(field: keyof FormState, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setSuccess(false)

    const payload = {
      author_name: form.author_name.trim(),
      author_role: form.author_role.trim() || null,
      avatar_url: form.avatar_url.trim() || null,
      content: form.content.trim(),
      rating: form.rating ? parseInt(form.rating) : null,
      is_featured: form.is_featured,
      sort_order: parseInt(form.sort_order) || 0,
    }

    if (!payload.author_name || !payload.content) {
      setErr('Nome e depoimento são obrigatórios.')
      return
    }

    startTransition(async () => {
      const result = editing
        ? await updateTestimonial(editing.id, payload)
        : await createTestimonial(payload)

      if (result.error) {
        setErr(result.error)
      } else {
        setSuccess(true)
        setTimeout(() => {
          closeForm()
          router.refresh()
        }, 800)
      }
    })
  }

  function handleDelete(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      await deleteTestimonial(id)
      setDeletingId(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 max-w-3xl pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Depoimentos</h1>
          <p className="text-sm mt-1" style={{ color: '#888' }}>Gerencie os depoimentos exibidos na loja e landing pages.</p>
        </div>
        {!showForm && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: '#FFA902', color: '#0a0a0a' }}
          >
            <Plus className="w-4 h-4" /> Novo depoimento
          </button>
        )}
      </div>

      {/* Formulário */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl p-5 space-y-4"
          style={{ background: '#111', border: '1px solid #1a1a1a' }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">{editing ? 'Editar depoimento' : 'Novo depoimento'}</h2>
            <button type="button" onClick={closeForm} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: '#555', background: '#1a1a1a' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Nome do autor *">
              <input
                type="text"
                value={form.author_name}
                onChange={e => set('author_name', e.target.value)}
                placeholder="João Silva"
                required
                className={inputCls}
                style={inputStyle}
              />
            </Field>
            <Field label="Cargo / Papel">
              <input
                type="text"
                value={form.author_role}
                onChange={e => set('author_role', e.target.value)}
                placeholder="Aluno do curso X"
                className={inputCls}
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Depoimento *">
            <textarea
              rows={3}
              value={form.content}
              onChange={e => set('content', e.target.value)}
              placeholder="Escreva o depoimento aqui..."
              required
              className={inputCls}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="URL do avatar">
              <input
                type="url"
                value={form.avatar_url}
                onChange={e => set('avatar_url', e.target.value)}
                placeholder="https://..."
                className={inputCls}
                style={inputStyle}
              />
            </Field>

            <Field label="Avaliação (1-5)">
              <select value={form.rating} onChange={e => set('rating', e.target.value)} className={inputCls} style={inputStyle}>
                {[5, 4, 3, 2, 1].map(n => (
                  <option key={n} value={n}>{n} estrela{n !== 1 ? 's' : ''}</option>
                ))}
              </select>
            </Field>

            <Field label="Ordem">
              <input
                type="number"
                min="0"
                value={form.sort_order}
                onChange={e => set('sort_order', e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </Field>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => set('is_featured', !form.is_featured)}
              className="relative w-9 h-5 rounded-full transition-colors shrink-0"
              style={{ background: form.is_featured ? '#FFA902' : '#2a2a2a' }}
            >
              <span
                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: form.is_featured ? 'translateX(16px)' : 'translateX(0)' }}
              />
            </div>
            <span className="text-sm text-white">Destaque</span>
            <span className="text-xs" style={{ color: '#555' }}>Aparece na loja sem filtro de produto</span>
          </label>

          {err && (
            <p className="text-sm px-3 py-2 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
              {err}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
            style={{ background: success ? '#22c55e' : '#FFA902', color: '#0a0a0a' }}
          >
            {isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
              : success
                ? <><Check className="w-4 h-4" /> Salvo!</>
                : editing ? 'Atualizar depoimento' : 'Criar depoimento'
            }
          </button>
        </form>
      )}

      {/* Lista */}
      <div className="space-y-2">
        {initial.map(t => (
          <div
            key={t.id}
            className="flex items-start gap-4 px-5 py-4 rounded-xl"
            style={{ background: '#111', border: '1px solid #1a1a1a' }}
          >
            {/* Avatar */}
            {t.avatar_url
              ? <img src={t.avatar_url} alt={t.author_name} className="w-10 h-10 rounded-full object-cover shrink-0" />
              : (
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: '#FFA90220', color: '#FFA902' }}>
                  {t.author_name.charAt(0).toUpperCase()}
                </div>
              )
            }

            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-white">{t.author_name}</p>
                {t.author_role && <p className="text-xs" style={{ color: '#555' }}>{t.author_role}</p>}
                {t.is_featured && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,169,2,0.15)', color: '#FFA902' }}>
                    Destaque
                  </span>
                )}
              </div>
              {t.rating && (
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-3 h-3" style={{ color: i < t.rating! ? '#FFA902' : '#333', fill: i < t.rating! ? '#FFA902' : 'transparent' }} />
                  ))}
                </div>
              )}
              <p className="text-sm" style={{ color: '#bbb' }}>{t.content}</p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => openEdit(t)}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#1a1a1a]"
                style={{ color: '#555' }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDelete(t.id)}
                disabled={deletingId === t.id}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-red-950/30 disabled:opacity-40"
                style={{ color: '#555' }}
              >
                {deletingId === t.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />
                }
              </button>
            </div>
          </div>
        ))}

        {initial.length === 0 && !showForm && (
          <div className="text-center py-16 rounded-xl" style={{ background: '#111', border: '1px solid #1a1a1a' }}>
            <Star className="w-8 h-8 mx-auto mb-3" style={{ color: '#333' }} />
            <p className="text-sm font-medium" style={{ color: '#555' }}>Nenhum depoimento ainda.</p>
            <p className="text-xs mt-1" style={{ color: '#444' }}>Clique em "Novo depoimento" para adicionar o primeiro.</p>
          </div>
        )}
      </div>
    </div>
  )
}
