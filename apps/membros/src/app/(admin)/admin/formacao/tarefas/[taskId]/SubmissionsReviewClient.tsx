'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Sparkles, Check, Loader2, CheckCircle2 } from 'lucide-react'
import { reviewFormacaoGrade } from '@/lib/actions/formacao'
import type { FormacaoTaskAdmin, TaskSubmissionRow } from '@/lib/formacao-queries'

interface Props {
  task: FormacaoTaskAdmin
  submissions: TaskSubmissionRow[]
}

export function SubmissionsReviewClient({ task, submissions }: Props) {
  return (
    <div className="max-w-[820px] space-y-6">
      <Link href="/admin/formacao/tarefas" className="inline-flex items-center gap-1.5 text-sm text-[#606060] hover:text-[#f0f0f0] transition-colors">
        <ArrowLeft className="w-4 h-4" /> Tarefas
      </Link>

      <div>
        <h1 className="text-xl font-bold text-[#f0f0f0]">{task.title}</h1>
        <p className="text-sm text-[#606060] mt-0.5">{task.moduleTitle} · {submissions.length} envios</p>
      </div>

      <div className="space-y-4">
        {submissions.map((s) => <SubmissionCard key={s.id} submission={s} />)}
        {submissions.length === 0 && (
          <p className="text-sm text-[#606060] text-center py-12">Nenhum aluno enviou essa tarefa ainda.</p>
        )}
      </div>
    </div>
  )
}

function SubmissionCard({ submission }: { submission: TaskSubmissionRow }) {
  const [finalScore, setFinalScore] = useState(submission.finalScore?.toString() ?? submission.aiScore?.toString() ?? '')
  const [finalFeedback, setFinalFeedback] = useState(submission.finalFeedback || submission.aiFeedback || '')
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null)
  const [published, setPublished] = useState(submission.published)

  async function handleSave(publish: boolean) {
    if (!submission.gradeId) return
    const score = parseFloat(finalScore)
    if (isNaN(score)) return
    setSaving(publish ? 'publish' : 'draft')
    const result = await reviewFormacaoGrade(submission.gradeId, { finalScore: score, finalFeedback, publish })
    setSaving(null)
    if (result.ok && publish) setPublished(true)
  }

  return (
    <div className={`rounded-xl border p-4 bg-[#111111] ${published ? 'border-emerald-500/20' : 'border-[#1e1e1e]'}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-[#f0f0f0]">{submission.studentName}</p>
        {published ? (
          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
            <CheckCircle2 className="w-2.5 h-2.5" /> Publicada
          </span>
        ) : submission.gradeId ? (
          <span className="text-[10px] text-[#c79a3b] uppercase tracking-wider font-bold">Aguardando revisão</span>
        ) : (
          <span className="text-[10px] text-[#606060] uppercase tracking-wider">IA ainda não corrigiu</span>
        )}
      </div>

      {submission.mcTotal !== null && submission.mcTotal > 0 && (
        <div className="rounded-lg bg-[#0d0d0d] border border-[#1a1a1a] p-3 mb-3">
          <p className="text-[10px] text-[#606060] uppercase tracking-wider mb-1">Múltipla escolha</p>
          <p className="text-sm text-[#c0c0c0]">{submission.mcScore}/{submission.mcTotal} corretas</p>
        </div>
      )}

      <div className="rounded-lg bg-[#0d0d0d] border border-[#1a1a1a] p-3 mb-3">
        <p className="text-[10px] text-[#606060] uppercase tracking-wider mb-1">Resposta dissertativa</p>
        <p className="text-sm text-[#c0c0c0] whitespace-pre-wrap">{submission.answer}</p>
      </div>

      {submission.aiScore !== null && (
        <div className="flex items-center gap-1.5 text-[11px] text-[#808080] mb-3">
          <Sparkles className="w-3 h-3 text-[#c79a3b]" />
          Sugestão da IA: nota {submission.aiScore.toFixed(1)} — &quot;{submission.aiFeedback}&quot;
        </div>
      )}

      {submission.gradeId && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#808080]">Nota final:</label>
            <input type="number" min={0} max={10} step={0.5} value={finalScore} onChange={(e) => setFinalScore(e.target.value)}
              className="w-20 bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-2 py-1 text-sm text-[#f0f0f0] outline-none focus:border-[#c79a3b]" />
          </div>
          <textarea value={finalFeedback} onChange={(e) => setFinalFeedback(e.target.value)} rows={3}
            placeholder="Feedback final pro aluno"
            className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-[#f0f0f0] placeholder-[#505050] outline-none resize-none focus:border-[#c79a3b]" />
          <div className="flex justify-end gap-2">
            <button onClick={() => handleSave(false)} disabled={saving !== null}
              className="px-3 py-1.5 text-xs text-[#808080] hover:text-[#f0f0f0] transition-colors disabled:opacity-40">
              {saving === 'draft' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Salvar rascunho'}
            </button>
            <button onClick={() => handleSave(true)} disabled={saving !== null}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#c79a3b] text-[#0a0a0a] text-xs font-bold rounded-lg hover:bg-[#e8b84b] disabled:opacity-40 transition-colors">
              {saving === 'publish' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Publicar nota
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
