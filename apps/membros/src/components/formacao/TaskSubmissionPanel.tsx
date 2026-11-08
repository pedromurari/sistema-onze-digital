'use client'

import { useState } from 'react'
import { ClipboardCheck, Check, Loader2, CheckCircle2, Clock, ShieldCheck } from 'lucide-react'
import { submitFormacaoTask, submitFormacaoQuiz } from '@/lib/actions/formacao'
import type { StudentTask } from '@/lib/formacao-queries'

interface Props {
  tasks: StudentTask[]
}

export function TaskSubmissionPanel({ tasks }: Props) {
  if (tasks.length === 0) return null

  return (
    <div className="mb-6 space-y-3">
      <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
        <ClipboardCheck className="w-3.5 h-3.5" /> Tarefas do módulo
      </h2>
      {tasks.map((t) => (
        t.taskType === 'quiz' && t.quiz ? <QuizCard key={t.id} task={t} /> : <TaskCard key={t.id} task={t} />
      ))}
    </div>
  )
}

function TaskCard({ task }: { task: StudentTask }) {
  const [answer, setAnswer] = useState(task.mySubmission?.answer ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submission, setSubmission] = useState(task.mySubmission)

  async function handleSubmit() {
    if (!answer.trim()) return
    setSubmitting(true)
    setError('')
    const result = await submitFormacaoTask(task.id, answer)
    setSubmitting(false)
    if (!result.ok) { setError(result.error); return }
    setSubmission({
      answer, status: 'submitted', finalScore: null, finalFeedback: '', published: false,
      mcAnswers: null, mcScore: null, mcTotal: null, declarationAccepted: false,
    })
  }

  const overdue = task.dueAt ? new Date(task.dueAt) < new Date() : false

  return (
    <div className="rounded-xl bg-[#0A1232] border border-white/[0.08] p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-sm font-semibold text-white">{task.title}</p>
        {task.dueAt && (
          <span className={`flex items-center gap-1 text-[10px] uppercase tracking-wider flex-shrink-0 ${overdue && !submission ? 'text-red-400' : 'text-white/40'}`}>
            <Clock className="w-3 h-3" />
            {new Date(task.dueAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </span>
        )}
      </div>

      <p className="text-sm text-white/50 leading-relaxed mb-3 whitespace-pre-wrap">{task.instructions}</p>

      {submission?.published ? (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Nota: {submission.finalScore?.toFixed(1)}
          </div>
          {submission.finalFeedback && (
            <p className="text-sm text-white/70 leading-relaxed">{submission.finalFeedback}</p>
          )}
        </div>
      ) : (
        <>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={5}
            placeholder="Digite sua resposta aqui..."
            className="w-full rounded-lg bg-[#0D1638] border border-white/[0.08] px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-[rgba(255,184,0,0.4)] resize-none"
          />
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
          <div className="flex items-center justify-between mt-3">
            {submission ? (
              <span className="text-[11px] text-white/40">Enviado — aguardando correção</span>
            ) : (
              <span />
            )}
            <button
              onClick={handleSubmit}
              disabled={submitting || !answer.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFB800] text-[#0D1638] text-xs font-semibold rounded-lg hover:bg-[#FFC933] disabled:opacity-40 transition-colors"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {submission ? 'Reenviar' : 'Enviar resposta'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function QuizCard({ task }: { task: StudentTask }) {
  const quiz = task.quiz!
  const [mcAnswers, setMcAnswers] = useState<Record<string, string>>(task.mySubmission?.mcAnswers ?? {})
  const [essayAnswer, setEssayAnswer] = useState(task.mySubmission?.answer ?? '')
  const [declarationAccepted, setDeclarationAccepted] = useState(task.mySubmission?.declarationAccepted ?? false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submission, setSubmission] = useState(task.mySubmission)

  const allAnswered = quiz.mcQuestions.every((q) => mcAnswers[q.id])
  const overdue = task.dueAt ? new Date(task.dueAt) < new Date() : false

  async function handleSubmit() {
    if (!allAnswered || !essayAnswer.trim() || !declarationAccepted) return
    setSubmitting(true)
    setError('')
    const result = await submitFormacaoQuiz(task.id, { mcAnswers, essayAnswer, declarationAccepted })
    setSubmitting(false)
    if (!result.ok) { setError(result.error); return }
    const mcTotal = quiz.mcQuestions.filter((q) => q.correctKey).length
    const mcScore = quiz.mcQuestions.filter((q) => q.correctKey && mcAnswers[q.id] === q.correctKey).length
    setSubmission({
      answer: essayAnswer, status: 'submitted', finalScore: null, finalFeedback: '', published: false,
      mcAnswers, mcScore, mcTotal, declarationAccepted,
    })
  }

  return (
    <div className="rounded-xl bg-[#0A1232] border border-white/[0.08] p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-sm font-semibold text-white">{task.title}</p>
        {task.dueAt && (
          <span className={`flex items-center gap-1 text-[10px] uppercase tracking-wider flex-shrink-0 ${overdue && !submission ? 'text-red-400' : 'text-white/40'}`}>
            <Clock className="w-3 h-3" />
            {new Date(task.dueAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </span>
        )}
      </div>

      {submission?.published ? (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Nota final: {submission.finalScore?.toFixed(1)}
          </div>
          {submission.mcTotal !== null && submission.mcTotal > 0 && (
            <p className="text-xs text-white/50 mb-1">Múltipla escolha: {submission.mcScore}/{submission.mcTotal} corretas</p>
          )}
          {submission.finalFeedback && (
            <p className="text-sm text-white/70 leading-relaxed">{submission.finalFeedback}</p>
          )}
        </div>
      ) : submission ? (
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
          <p className="text-xs text-white/50">Enviado — aguardando correção do professor.</p>
          {submission.mcTotal !== null && submission.mcTotal > 0 && (
            <p className="text-xs text-white/40 mt-1">Múltipla escolha: {submission.mcScore}/{submission.mcTotal} corretas</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {quiz.mcQuestions.map((q, i) => (
            <div key={q.id}>
              <p className="text-sm text-white/80 mb-2">{i + 1}. {q.text}</p>
              <div className="space-y-1.5">
                {q.choices.map((c) => (
                  <label key={c.key} className="flex items-start gap-2 text-sm text-white/60 hover:text-white/80 cursor-pointer">
                    <input
                      type="radio"
                      name={`${task.id}-${q.id}`}
                      checked={mcAnswers[q.id] === c.key}
                      onChange={() => setMcAnswers((prev) => ({ ...prev, [q.id]: c.key }))}
                      className="mt-1 accent-[#FFB800]"
                    />
                    <span>{c.key}) {c.text}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div>
            <p className="text-sm text-white/80 mb-2">{quiz.essayPrompt}</p>
            <textarea
              value={essayAnswer}
              onChange={(e) => setEssayAnswer(e.target.value)}
              rows={6}
              placeholder="Digite sua resposta dissertativa aqui..."
              className="w-full rounded-lg bg-[#0D1638] border border-white/[0.08] px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-[rgba(255,184,0,0.4)] resize-none"
            />
          </div>

          {quiz.declarationText && (
            <label className="flex items-start gap-2 text-xs text-white/50 cursor-pointer">
              <input
                type="checkbox"
                checked={declarationAccepted}
                onChange={(e) => setDeclarationAccepted(e.target.checked)}
                className="mt-0.5 accent-[#FFB800]"
              />
              <span className="flex items-start gap-1"><ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{quiz.declarationText}</span>
            </label>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={submitting || !allAnswered || !essayAnswer.trim() || !declarationAccepted}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFB800] text-[#0D1638] text-xs font-semibold rounded-lg hover:bg-[#FFC933] disabled:opacity-40 transition-colors"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Enviar avaliação
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
