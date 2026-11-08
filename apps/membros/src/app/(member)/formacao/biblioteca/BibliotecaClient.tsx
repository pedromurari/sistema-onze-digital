'use client'

import Link from 'next/link'
import { ArrowLeft, Library, FileText, Image as ImageIcon, Video as VideoIcon, ExternalLink, Download } from 'lucide-react'
import type { FormacaoMaterial } from '@/lib/formacao-queries'

const TYPE_ICON = { pdf: FileText, image: ImageIcon, video: VideoIcon, link: ExternalLink } as const

export function BibliotecaClient({ files }: { files: FormacaoMaterial[] }) {
  return (
    <div className="min-h-screen bg-[#0D1638] px-4 sm:px-6 lg:px-10 py-6">
      <div className="max-w-[820px] mx-auto">
        <Link href="/formacao" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Formação IDM
        </Link>

        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-[rgba(255,184,0,0.1)] border border-[rgba(255,184,0,0.2)] flex items-center justify-center">
            <Library className="w-4 h-4 text-[#FFB800]" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Biblioteca</h1>
        </div>
        <p className="text-sm text-white/50 ml-11 mb-6">Apostilas, e-books e materiais de apoio da turma.</p>

        <div className="space-y-2">
          {files.map((f) => {
            const Icon = TYPE_ICON[f.type as keyof typeof TYPE_ICON] ?? FileText
            return (
              <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-white/[0.08] p-4 hover:border-[rgba(255,184,0,0.3)] transition-colors"
                style={{ background: '#0A1232' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,184,0,0.1)' }}>
                  <Icon className="w-4 h-4 text-[#FFB800]" />
                </div>
                <p className="flex-1 min-w-0 text-sm font-medium text-white truncate">{f.title}</p>
                <Download className="w-4 h-4 text-white/30 shrink-0" />
              </a>
            )
          })}
          {files.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/[0.08] p-10 text-center">
              <p className="text-sm text-white/40">Nenhum arquivo disponível ainda.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
