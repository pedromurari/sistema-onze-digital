'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Check, Loader2, Trash2, Pencil, ClipboardList, Users, AlertCircle, X } from 'lucide-react'
import { createFormacaoTask, updateFormacaoTask, deleteFormacaoTask, createFormacaoQuizTask, updateFormacaoQuizTask } from '@/lib/actions/formacao'
import type { FormacaoTaskAdmin, McQuestion } from '@/lib/formacao-queries'

const CHOICE_KEYS = ['A', 'B', 'C', 'D', 'E']

function emptyQuestion(n: number): McQuestion {
  return { id: `q${Date.now()}${n}`, text: '', choices: CHOICE_KEYS.map((k) => ({ key: k, text: '' })), correctKey: null }
}

interface ModuleOption { id: string; title: string }

interface Props {
  tasks: FormacaoTaskAdmin[]
  modules: ModuleOption[]
}

export function TarefasClient({ tasks, modules }: Props) {
  const [creating, setCreating] = useState<'text' | 'quiz' | null>(null)

  return (
    <div className="max-w-[820px] space-y-6">
      <Link href="/admin/formacao" className="inline-flex items-center gap-1.5 text-sm text-[#606060] hover:text-[#f0f0f0] transition-colors">
        <ArrowLeft className="w-4 h-4" /> Formação IDM
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-xl bg-[#c79a3b]/10 border border-[#c79a3b]/20 flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-[#c79a3b]" />
            </div>
            <h1 className="text-xl font-bold text-[#f0f0f0] tracking-tight">Tarefas</h1>
          </div>
          <p className="text-sm text-[#606060] ml-11">{tasks.length} tarefas cadastradas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreating('text')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-[#0a0a0a] bg-[#c79a3b] hover:bg-[#e8b84b] transition-colors"
          >
            <Plus className="w-4 h-4" /> Tarefa dissertativa
          </button>
          <button
            onClick={() => setCreating('quiz')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-[#f0f0f0] bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#c79a3b]/40 transition-colors"
          >
            <Plus className="w-4 h-4" /> Avaliação (quiz)
          </button>
        </div>
      </div>

      {creating === 'text' && <TaskForm modules={modules} onDone={() => setCreating(null)} />}
      {creating === 'quiz' && <QuizForm modules={modules} onDone={() => setCreating(null)} />}

      <div className="space-y-2">
        {tasks.map((t) => <TaskRow key={t.id} task={t} modules={modules} />)}
        {tasks.length === 0 && !creating && (
          <p className="text-sm text-[#606060] text-center py-12">Nenhuma tarefa criada ainda.</p>
        )}
      </div>
    </div>
  )
}

function TaskRow({ task, modules }: { task: FormacaoTaskAdmin; modules: ModuleOption[] }) {
  const [editing, setEditing] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); return }
    setDeleting(true)
    await deleteFormacaoTask(task.id)
  }

  if (editing) {
    return task.taskType === 'quiz'
      ? <QuizForm modules={modules} initial={task} onDone={() => setEditing(false)} />
      : <TaskForm modules={modules} initial={task} onDone={() => setEditing(false)} />
  }

  const missingAnswerKeys = task.quiz?.mcQuestions.filter((q) => !q.correctKey).length ?? 0

  return (
    <div className="rounded-xl border border-[#1e1e1e] bg-[#111111] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[#f0f0f0]">{task.title}</p>
            {task.taskType === 'quiz' && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#c79a3b]/10 text-[#c79a3b]">Quiz</span>
            )}
          </div>
          <p className="text-[11px] text-[#606060] mt-0.5">{task.moduleTitle}</p>
          {task.dueAt && (
            <p className="text-[11px] text-[#808080] mt-1">
              Prazo: {new Date(task.dueAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          )}
          {missingAnswerKeys > 0 && (
            <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {missingAnswerKeys} questões sem gabarito definido
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setEditing(true)} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#606060] hover:text-[#c79a3b] hover:bg-[#c79a3b]/10 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${confirmDel ? 'text-red-400 bg-red-950/30' : 'text-[#606060] hover:text-red-400 hover:bg-red-950/20'}`}>
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#1e1e1e]">
        <Link href={`/admin/formacao/tarefas/${task.id}`} className="flex items-center gap-1.5 text-xs text-[#808080] hover:text-[#c79a3b] transition-colors">
          <Users className="w-3.5 h-3.5" /> {task.submissionCount} {task.submissionCount === 1 ? 'envio' : 'envios'}
        </Link>
        {task.pendingCount > 0 && (
          <Link href={`/admin/formacao/tarefas/${task.id}`} className="flex items-center gap-1.5 text-xs text-[#c79a3b]">
            <AlertCircle className="w-3.5 h-3.5" /> {task.pendingCount} aguardando revisão
          </Link>
        )}
        {!task.published && <span className="text-[10px] text-[#606060] uppercase tracking-wider">Rascunho</span>}
      </div>
    </div>
  )
}

function TaskForm({ modules, initial, onDone }: { modules: ModuleOption[]; initial?: FormacaoTaskAdmin; onDone: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [instructions, setInstructions] = useState(initial?.instructions ?? '')
  const [rubric, setRubric] = useState(initial?.rubric ?? '')
  const [moduleId, setModuleId] = useState(initial?.moduleId ?? modules[0]?.id ?? '')
  const [dueAt, setDueAt] = useState(initial?.dueAt ? initial.dueAt.slice(0, 10) : '')
  const [published, setPublished] = useState(initial?.published ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!title.trim() || !instructions.trim() || !moduleId) return
    setSaving(true)
    setError('')
    const dueAtIso = dueAt ? new Date(`${dueAt}T23:59:59`).toISOString() : null

    const result = initial
      ? await updateFormacaoTask(initial.id, { title, instructions, rubric, due_at: dueAtIso, published })
      : await createFormacaoTask({ title, instructions, rubric, module_id: moduleId, lesson_id: null, due_at: dueAtIso, published })

    setSaving(false)
    if (!result.ok) { setError(result.error); return }
    onDone()
  }

  return (
    <div className="rounded-xl border border-[#c79a3b]/30 bg-[#111111] p-4 space-y-3">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da tarefa" autoFocus
        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0f0f0] placeholder:text-[#505050] outline-none focus:border-[#c79a3b]" />

      {!initial && (
        <select value={moduleId} onChange={(e) => setModuleId(e.target.value)}
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0f0f0] outline-none">
          {modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
      )}

      <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3}
        placeholder="Instruções — o que o aluno deve responder"
        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0f0f0] placeholder:text-[#505050] outline-none resize-none" />

      <textarea value={rubric} onChange={(e) => setRubric(e.target.value)} rows={3}
        placeholder="Gabarito / critério de correção (opcional — a IA usa isso como referência principal; se vazio, usa o conteúdo da aula)"
        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0f0f0] placeholder:text-[#505050] outline-none resize-none" />

      <div className="flex items-center gap-3">
        <label className="text-xs text-[#808080]">Prazo:</label>
        <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-2 py-1.5 text-xs text-[#f0f0f0] outline-none" />
        <label className="flex items-center gap-1.5 text-xs text-[#808080] cursor-pointer select-none ml-auto">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="accent-[#c79a3b]" />
          Publicada (visível pro aluno)
        </label>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <button onClick={onDone} className="px-3 py-1.5 text-xs text-[#606060] hover:text-[#f0f0f0]">Cancelar</button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-[#0a0a0a] bg-[#c79a3b] hover:bg-[#e8b84b] disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Salvar
        </button>
      </div>
    </div>
  )
}

function QuizForm({ modules, initial, onDone }: { modules: ModuleOption[]; initial?: FormacaoTaskAdmin; onDone: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [moduleId, setModuleId] = useState(initial?.moduleId ?? modules[0]?.id ?? '')
  const [dueAt, setDueAt] = useState(initial?.dueAt ? initial.dueAt.slice(0, 10) : '')
  const [published, setPublished] = useState(initial?.published ?? true)
  const [rubric, setRubric] = useState(initial?.rubric ?? '')
  const [essayPrompt, setEssayPrompt] = useState(initial?.quiz?.essayPrompt ?? '')
  const [declarationText, setDeclarationText] = useState(
    initial?.quiz?.declarationText ?? 'Declaro que respondi a esta avaliação de forma individual, utilizando os materiais indicados, respeitando os princípios éticos e acadêmicos da formação em Psicanálise.'
  )
  const [questions, setQuestions] = useState<McQuestion[]>(initial?.quiz?.mcQuestions ?? [emptyQuestion(0)])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateQuestion(id: string, patch: Partial<McQuestion>) {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)))
  }
  function updateChoice(qId: string, key: string, text: string) {
    setQuestions((qs) => qs.map((q) => (q.id === qId ? { ...q, choices: q.choices.map((c) => c.key === key ? { ...c, text } : c) } : q)))
  }
  function addQuestion() { setQuestions((qs) => [...qs, emptyQuestion(qs.length)]) }
  function removeQuestion(id: string) { setQuestions((qs) => qs.filter((q) => q.id !== id)) }

  async function handleSave() {
    if (!title.trim() || !moduleId || !essayPrompt.trim()) return
    if (questions.some((q) => !q.text.trim() || q.choices.some((c) => !c.text.trim()))) {
      setError('Preencha todas as questões e alternativas')
      return
    }
    setSaving(true)
    setError('')
    const dueAtIso = dueAt ? new Date(`${dueAt}T23:59:59`).toISOString() : null

    const result = initial
      ? await updateFormacaoQuizTask(initial.id, { title, due_at: dueAtIso, published, rubric, mcQuestions: questions, essayPrompt, declarationText })
      : await createFormacaoQuizTask({ title, module_id: moduleId, due_at: dueAtIso, published, rubric, mcQuestions: questions, essayPrompt, declarationText })

    setSaving(false)
    if (!result.ok) { setError(result.error); return }
    onDone()
  }

  return (
    <div className="rounded-xl border border-[#c79a3b]/30 bg-[#111111] p-4 space-y-4">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da avaliação (ex.: Prova Avaliativa — Módulo 6)" autoFocus
        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0f0f0] placeholder:text-[#505050] outline-none focus:border-[#c79a3b]" />

      {!initial && (
        <select value={moduleId} onChange={(e) => setModuleId(e.target.value)}
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0f0f0] outline-none">
          {modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
      )}

      <div className="space-y-3">
        <p className="text-xs font-semibold text-[#c79a3b] uppercase tracking-wider">Questões de múltipla escolha</p>
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] p-3 space-y-2">
            <div className="flex items-start gap-2">
              <textarea value={q.text} onChange={(e) => updateQuestion(q.id, { text: e.target.value })} rows={2}
                placeholder={`Questão ${i + 1}`}
                className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs text-[#f0f0f0] placeholder:text-[#505050] outline-none resize-none" />
              <button onClick={() => removeQuestion(q.id)} className="w-6 h-6 flex-shrink-0 rounded-lg flex items-center justify-center text-[#606060] hover:text-red-400">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1.5">
              {q.choices.map((c) => (
                <div key={c.key} className="flex items-center gap-2">
                  <input type="radio" name={`correct-${q.id}`} checked={q.correctKey === c.key}
                    onChange={() => updateQuestion(q.id, { correctKey: c.key })} className="accent-[#c79a3b]" title="Marcar como correta" />
                  <span className="text-xs text-[#808080] w-4">{c.key})</span>
                  <input value={c.text} onChange={(e) => updateChoice(q.id, c.key, e.target.value)} placeholder={`Alternativa ${c.key}`}
                    className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1 text-xs text-[#f0f0f0] placeholder:text-[#505050] outline-none" />
                </div>
              ))}
            </div>
            {!q.correctKey && <p className="text-[10px] text-red-400">Selecione a alternativa correta (gabarito)</p>}
          </div>
        ))}
        <button onClick={addQuestion} className="flex items-center gap-1 text-xs text-[#c79a3b] hover:text-[#e8b84b]">
          <Plus className="w-3.5 h-3.5" /> Adicionar questão
        </button>
      </div>

      <textarea value={essayPrompt} onChange={(e) => setEssayPrompt(e.target.value)} rows={3}
        placeholder="Enunciado da questão dissertativa"
        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0f0f0] placeholder:text-[#505050] outline-none resize-none" />

      <textarea value={rubric} onChange={(e) => setRubric(e.target.value)} rows={2}
        placeholder="Gabarito / critério de correção da dissertativa (opcional — a IA usa isso como referência)"
        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0f0f0] placeholder:text-[#505050] outline-none resize-none" />

      <textarea value={declarationText} onChange={(e) => setDeclarationText(e.target.value)} rows={2}
        placeholder="Texto da declaração de autoria"
        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0f0f0] placeholder:text-[#505050] outline-none resize-none" />

      <div className="flex items-center gap-3">
        <label className="text-xs text-[#808080]">Prazo:</label>
        <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-2 py-1.5 text-xs text-[#f0f0f0] outline-none" />
        <label className="flex items-center gap-1.5 text-xs text-[#808080] cursor-pointer select-none ml-auto">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="accent-[#c79a3b]" />
          Publicada (visível pro aluno)
        </label>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <button onClick={onDone} className="px-3 py-1.5 text-xs text-[#606060] hover:text-[#f0f0f0]">Cancelar</button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-[#0a0a0a] bg-[#c79a3b] hover:bg-[#e8b84b] disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Salvar
        </button>
      </div>
    </div>
  )
}
