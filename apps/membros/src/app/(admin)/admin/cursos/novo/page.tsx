'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCourse } from '@/lib/actions/admin-courses'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'

const inputCls = "w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-[#FFA902]"
const inputStyle = { background: '#0d0d0d', border: '1px solid #2a2a2a' }

export default function AdminNovoCursoPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [productType, setProductType] = useState('course')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setErr('Título obrigatório.'); return }
    setErr(null)

    startTransition(async () => {
      const result = await createCourse({
        title: title.trim(),
        description: description.trim() || null,
        thumbnail_url: thumbnailUrl.trim() || null,
        product_type: productType,
      })
      if (result.error) {
        setErr(result.error)
      } else {
        router.push(`/admin/cursos/${result.slug}/editar`)
      }
    })
  }

  return (
    <div className="max-w-xl space-y-6 pb-10">
      <div className="flex items-center gap-3">
        <Link href="/admin/cursos" className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors" style={{ background: '#1a1a1a', color: '#888' }}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">Novo produto</h1>
          <p className="text-xs" style={{ color: '#555' }}>Preencha as informações básicas para começar.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl p-5 space-y-4" style={{ background: '#111', border: '1px solid #1a1a1a' }}>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold" style={{ color: '#aaa' }}>Título *</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ex: NPA 2.0 — Numerologia Profunda Avançada"
            required
            className={inputCls}
            style={inputStyle}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold" style={{ color: '#aaa' }}>Tipo</label>
          <select value={productType} onChange={e => setProductType(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="course">Curso</option>
            <option value="ebook">E-book</option>
            <option value="bundle">Bundle</option>
            <option value="mentorship">Mentoria</option>
            <option value="event">Evento</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold" style={{ color: '#aaa' }}>Descrição</label>
          <textarea
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Descrição do produto..."
            className={inputCls}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold" style={{ color: '#aaa' }}>URL da thumbnail</label>
          <input
            type="url"
            value={thumbnailUrl}
            onChange={e => setThumbnailUrl(e.target.value)}
            placeholder="https://..."
            className={inputCls}
            style={inputStyle}
          />
        </div>

        {err && (
          <p className="text-sm px-3 py-2 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
            {err}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-60"
          style={{ background: '#FFA902', color: '#0a0a0a' }}
        >
          {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</> : 'Criar produto'}
        </button>
      </form>
    </div>
  )
}
