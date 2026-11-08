'use client'

import Link from 'next/link'
import { ArrowLeft, GraduationCap } from 'lucide-react'
import type { MyGrade } from '@/lib/formacao-queries'

export function NotasClient({ grades }: { grades: MyGrade[] }) {
  return (
    <div className="min-h-screen bg-[#0D1638] px-4 sm:px-6 lg:px-10 py-6">
      <div className="max-w-[720px] mx-auto">
        <Link href="/formacao" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Formação IDM
        </Link>

        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-[rgba(255,184,0,0.1)] border border-[rgba(255,184,0,0.2)] flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-[#FFB800]" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Minhas notas</h1>
        </div>
        <p className="text-sm text-white/50 ml-11 mb-6">Suas tarefas já corrigidas e revisadas pelo professor.</p>

        <div className="space-y-3">
          {grades.map((g) => (
            <div key={g.taskId} className="rounded-2xl p-4 border border-white/[0.08]" style={{ background: '#0A1232' }}>
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{g.taskTitle}</p>
                  <p className="text-xs text-white/40">{g.moduleTitle}</p>
                </div>
                <span className="text-lg font-bold text-[#FFB800] flex-shrink-0">{g.finalScore.toFixed(1)}</span>
              </div>
              {g.finalFeedback && (
                <p className="text-xs text-white/60 leading-relaxed mt-2 whitespace-pre-wrap">{g.finalFeedback}</p>
              )}
            </div>
          ))}
          {grades.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/[0.08] p-10 text-center">
              <p className="text-sm text-white/40">Nenhuma nota publicada ainda.</p>
              <p className="text-xs text-white/25 mt-1">Assim que uma tarefa sua for revisada, ela aparece aqui.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
