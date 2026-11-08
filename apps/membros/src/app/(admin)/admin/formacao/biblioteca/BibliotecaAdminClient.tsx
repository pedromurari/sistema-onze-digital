'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { ArrowLeft, Library, Plus, Trash2, Loader2, FileText, Image as ImageIcon, Video as VideoIcon, ExternalLink } from 'lucide-react'
import { uploadFormacaoLibraryFile, deleteFormacaoMaterial } from '@/lib/actions/formacao'
import type { FormacaoMaterial } from '@/lib/formacao-queries'

const TYPE_ICON = { pdf: FileText, image: ImageIcon, video: VideoIcon, link: ExternalLink } as const

export function BibliotecaAdminClient({ files }: { files: FormacaoMaterial[] }) {
  const [items, setItems] = useState(files)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!title.trim() || !fileInputRef.current?.files?.[0]) {
      setError('Preencha o título e escolha um arquivo')
      return
    }
    setUploading(true)
    setError('')
    const fd = new FormData(e.currentTarget)
    const result = await uploadFormacaoLibraryFile(fd)
    setUploading(false)
    if (!result.ok) { setError(result.error); return }
    window.location.reload()
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este arquivo da biblioteca?')) return
    await deleteFormacaoMaterial(id)
    setItems((its) => its.filter((i) => i.id !== id))
  }

  return (
    <div className="max-w-[820px] space-y-6">
      <Link href="/admin/formacao" className="inline-flex items-center gap-1.5 text-sm text-[#606060] hover:text-[#f0f0f0] transition-colors">
        <ArrowLeft className="w-4 h-4" /> Formação IDM
      </Link>

      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-[#c79a3b]/10 border border-[#c79a3b]/20 flex items-center justify-center">
            <Library className="w-4 h-4 text-[#c79a3b]" />
          </div>
          <h1 className="text-xl font-bold text-[#f0f0f0] tracking-tight">Biblioteca</h1>
        </div>
        <p className="text-sm text-[#606060] ml-11">Arquivos gerais disponíveis pra toda a turma (apostilas, e-books, formulários...)</p>
      </div>

      <form onSubmit={handleUpload} className="rounded-xl border border-[#1e1e1e] bg-[#111111] p-4 space-y-3">
        <div className="grid sm:grid-cols-[1fr_auto] gap-3">
          <input
            name="title" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Título do arquivo (ex: Apostila Módulo 1)"
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0f0f0] placeholder:text-[#505050] outline-none focus:border-[#c79a3b]"
          />
          <input
            ref={fileInputRef} name="file" type="file"
            className="text-xs text-[#a0a0a0] file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#c79a3b] file:text-[#0a0a0a] hover:file:bg-[#e8b84b]"
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button type="submit" disabled={uploading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-[#0a0a0a] bg-[#c79a3b] hover:bg-[#e8b84b] disabled:opacity-50 transition-colors">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          {uploading ? 'Enviando...' : 'Subir arquivo'}
        </button>
      </form>

      <div className="space-y-2">
        {items.map((f) => {
          const Icon = TYPE_ICON[f.type as keyof typeof TYPE_ICON] ?? FileText
          return (
            <div key={f.id} className="flex items-center gap-3 rounded-xl border border-[#1e1e1e] bg-[#111111] p-3.5">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(199,154,59,0.1)' }}>
                <Icon className="w-4 h-4 text-[#c79a3b]" />
              </div>
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-sm text-[#f0f0f0] hover:text-[#c79a3b] truncate transition-colors">
                {f.title}
              </a>
              <button onClick={() => handleDelete(f.id)} className="p-1.5 text-[#606060] hover:text-red-400 hover:bg-red-950/20 rounded-lg transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
        {items.length === 0 && (
          <p className="text-sm text-[#606060] text-center py-12">Nenhum arquivo na biblioteca ainda.</p>
        )}
      </div>
    </div>
  )
}
