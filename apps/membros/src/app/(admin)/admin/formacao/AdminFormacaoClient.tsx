'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronUp, Check, X, Loader2,
  Lock, LockOpen, GraduationCap, Link2, Video, Paperclip, Users2, ClipboardList, CalendarClock, MessageCircle, Library,
} from 'lucide-react'
import {
  createFormacaoModule, updateFormacaoModule, deleteFormacaoModule,
  createFormacaoLesson, updateFormacaoLesson, deleteFormacaoLesson,
  createFormacaoMaterial, deleteFormacaoMaterial,
  createTurma, updateTurmaModuleRelease, updateTurmaGroupUrl,
} from '@/lib/actions/formacao'
import type { FormacaoModuleAdmin, Turma, TurmaModuleRelease } from '@/lib/formacao-queries'
import type { Lesson } from '@/types'

interface Props {
  modules: FormacaoModuleAdmin[]
  turmas: Turma[]
  selectedTurmaId: string | null
  releases: TurmaModuleRelease[]
}

export function AdminFormacaoClient({ modules, turmas, selectedTurmaId, releases }: Props) {
  const router = useRouter()
  const [creatingModule, setCreatingModule] = useState(false)
  const [creatingTurma, setCreatingTurma] = useState(false)

  const releaseByModule = new Map(releases.map((r) => [r.module_id, r]))

  function goToTurma(id: string) {
    router.push(id ? `/admin/formacao?turma=${id}` : '/admin/formacao')
  }

  return (
    <div className="max-w-[820px] space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#c79a3b]/10 border border-[#c79a3b]/20">
              <GraduationCap className="w-4 h-4 text-[#c79a3b]" />
            </div>
            <h1 className="text-xl font-bold text-[#f0f0f0] tracking-tight">Formação IDM</h1>
            <Link href="/admin/formacao/tarefas"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-[#606060] hover:text-[#c79a3b] border border-[#2a2a2a] hover:border-[#c79a3b]/30 transition-colors">
              <ClipboardList className="w-3.5 h-3.5" /> Tarefas
            </Link>
            <Link href="/admin/formacao/calendario"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-[#606060] hover:text-[#c79a3b] border border-[#2a2a2a] hover:border-[#c79a3b]/30 transition-colors">
              <CalendarClock className="w-3.5 h-3.5" /> Aulas ao vivo
            </Link>
            <Link href="/admin/formacao/biblioteca"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-[#606060] hover:text-[#c79a3b] border border-[#2a2a2a] hover:border-[#c79a3b]/30 transition-colors">
              <Library className="w-3.5 h-3.5" /> Biblioteca
            </Link>
          </div>
          <p className="text-sm text-[#606060] ml-11">{modules.length} módulos · Psicanálise Integrativa</p>
        </div>

        <div className="flex items-center gap-2">
          <Users2 className="w-4 h-4 text-[#606060]" />
          <select
            value={selectedTurmaId ?? ''}
            onChange={(e) => goToTurma(e.target.value)}
            className="bg-[#111111] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0f0f0] outline-none"
          >
            <option value="">Liberação global (sem turma)</option>
            {turmas.map((t) => (
              <option key={t.id} value={t.id}>Turma {t.code}{t.name ? ` — ${t.name}` : ''}</option>
            ))}
          </select>
          <button
            onClick={() => setCreatingTurma(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-[#0a0a0a] bg-[#c79a3b] hover:bg-[#e8b84b] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Turma
          </button>
        </div>
      </div>

      {creatingTurma && (
        <TurmaForm onDone={(id) => { setCreatingTurma(false); if (id) goToTurma(id) }} />
      )}

      {selectedTurmaId && (
        <GroupUrlEditor turma={turmas.find((t) => t.id === selectedTurmaId) ?? null} />
      )}

      <div className="space-y-2">
        {modules.map((mod) => (
          <ModuleRow
            key={mod.id}
            mod={mod}
            turmaId={selectedTurmaId}
            release={releaseByModule.get(mod.id) ?? null}
          />
        ))}
        {modules.length === 0 && !creatingModule && (
          <p className="text-sm text-[#606060] text-center py-12">Nenhum módulo criado ainda.</p>
        )}
      </div>

      {creatingModule ? (
        <QuickModuleForm onDone={() => setCreatingModule(false)} />
      ) : (
        <button
          onClick={() => setCreatingModule(true)}
          className="flex items-center gap-2 w-full justify-center rounded-xl border border-dashed border-[#2a2a2a] py-3 text-sm text-[#606060] hover:text-[#c79a3b] hover:border-[#c79a3b]/30 transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo módulo
        </button>
      )}
    </div>
  )
}

function GroupUrlEditor({ turma }: { turma: Turma | null }) {
  const [url, setUrl] = useState(turma?.group_url ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  if (!turma) return null

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    const result = await updateTurmaGroupUrl(turma!.id, url)
    setSaving(false)
    if (result.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-[#1e1e1e] bg-[#111111] px-4 py-3">
      <MessageCircle className="w-4 h-4 text-[#606060] shrink-0" />
      <span className="text-xs text-[#808080] shrink-0">Link do grupo da turma {turma.code}:</span>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://chat.whatsapp.com/... ou https://t.me/..."
        className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 text-xs text-[#f0f0f0] placeholder:text-[#505050] outline-none focus:border-[#c79a3b]"
      />
      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[#0a0a0a] bg-[#c79a3b] hover:bg-[#e8b84b] disabled:opacity-50 transition-colors shrink-0">
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3" /> : null}
        {saved ? 'Salvo' : 'Salvar'}
      </button>
    </div>
  )
}

function TurmaForm({ onDone }: { onDone: (id: string | null) => void }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!code.trim()) return
    setSaving(true)
    setError('')
    const result = await createTurma({ code, name, start_date: startDate || null })
    setSaving(false)
    if (!result.ok) { setError(result.error); return }
    onDone(result.data.id)
  }

  return (
    <div className="rounded-xl border border-[#c79a3b]/30 bg-[#111111] p-4 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código (ex: 02726)" autoFocus
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0f0f0] placeholder:text-[#505050] outline-none focus:border-[#c79a3b]" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (opcional)"
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0f0f0] placeholder:text-[#505050] outline-none focus:border-[#c79a3b]" />
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0f0f0] outline-none focus:border-[#c79a3b]" />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => onDone(null)} className="px-3 py-1.5 text-xs text-[#606060] hover:text-[#f0f0f0]">Cancelar</button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-[#0a0a0a] bg-[#c79a3b] hover:bg-[#e8b84b] disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Criar turma
        </button>
      </div>
    </div>
  )
}

function QuickModuleForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    await createFormacaoModule(title)
    setSaving(false)
    setTitle('')
    onDone()
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-[#c79a3b]/30 bg-[#111111] p-3">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do módulo" autoFocus
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0f0f0] placeholder:text-[#505050] outline-none focus:border-[#c79a3b]" />
      <button onClick={onDone} className="px-3 py-2 text-xs text-[#606060] hover:text-[#f0f0f0]">Cancelar</button>
      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-[#0a0a0a] bg-[#c79a3b] hover:bg-[#e8b84b] disabled:opacity-50 transition-colors">
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Salvar
      </button>
    </div>
  )
}

function ModuleRow({ mod, turmaId, release }: { mod: FormacaoModuleAdmin; turmaId: string | null; release: TurmaModuleRelease | null }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(mod.title)
  const [confirmDel, setConfirmDel] = useState(false)
  const [savingRelease, setSavingRelease] = useState(false)

  const released = turmaId ? (release?.released ?? false) : mod.released
  const releaseAt = turmaId ? (release?.release_at ?? null) : mod.release_at

  async function toggleReleased() {
    setSavingRelease(true)
    if (turmaId) {
      await updateTurmaModuleRelease(turmaId, mod.id, { released: !released })
    } else {
      await updateFormacaoModule(mod.id, { released: !released })
    }
    setSavingRelease(false)
  }

  async function setReleaseAt(value: string) {
    const iso = value ? new Date(`${value}T00:00:00`).toISOString() : null
    if (turmaId) {
      await updateTurmaModuleRelease(turmaId, mod.id, { release_at: iso })
    } else {
      await updateFormacaoModule(mod.id, { release_at: iso })
    }
  }

  async function saveTitle() {
    if (!title.trim()) return
    await updateFormacaoModule(mod.id, { title })
    setEditing(false)
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); return }
    await deleteFormacaoModule(mod.id)
  }

  return (
    <div className="rounded-xl border border-[#1e1e1e] bg-[#111111] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen((o) => !o)} className="text-[#606060] hover:text-[#f0f0f0]">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {editing ? (
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
            onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
            className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1 text-sm text-[#f0f0f0] outline-none focus:border-[#c79a3b]" />
        ) : (
          <p className="flex-1 text-sm font-semibold text-[#f0f0f0]">{mod.title}</p>
        )}

        <button
          onClick={toggleReleased}
          disabled={savingRelease}
          title={released ? 'Liberado' : 'Bloqueado'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
            released ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-[#606060] border-[#2a2a2a] bg-[#1a1a1a]'
          }`}
        >
          {released ? <LockOpen className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
          {released ? 'Liberado' : 'Bloqueado'}
        </button>

        <input
          type="date"
          defaultValue={releaseAt ? releaseAt.slice(0, 10) : ''}
          onBlur={(e) => setReleaseAt(e.target.value)}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1 text-xs text-[#a0a0a0] outline-none"
          title="Data de liberação automática (opcional)"
        />

        {editing ? (
          <>
            <button onClick={saveTitle} className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg"><Check className="w-3.5 h-3.5" /></button>
            <button onClick={() => { setEditing(false); setTitle(mod.title) }} className="p-1.5 text-[#606060] hover:bg-[#1a1a1a] rounded-lg"><X className="w-3.5 h-3.5" /></button>
          </>
        ) : (
          <button onClick={() => setEditing(true)} className="p-1.5 text-[#606060] hover:text-[#c79a3b] hover:bg-[#1a1a1a] rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
        )}
        <button onClick={handleDelete} className={`p-1.5 rounded-lg transition-colors ${confirmDel ? 'text-red-400 bg-red-950/30' : 'text-[#606060] hover:text-red-400 hover:bg-red-950/20'}`}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {open && (
        <div className="border-t border-[#1e1e1e] p-4 space-y-4 bg-[#0d0d0d]">
          <LessonList lessons={mod.lessons} moduleId={mod.id} />
          <MaterialList materials={mod.materials} moduleId={mod.id} />
        </div>
      )}
    </div>
  )
}

function LessonList({ lessons, moduleId }: { lessons: Lesson[]; moduleId: string }) {
  const [creating, setCreating] = useState(false)
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold text-[#606060] uppercase tracking-wide flex items-center gap-1.5"><Video className="w-3 h-3" /> Aulas</p>
      {lessons.map((l) => <LessonRow key={l.id} lesson={l} />)}
      {creating ? (
        <NewLessonForm moduleId={moduleId} onDone={() => setCreating(false)} />
      ) : (
        <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 text-xs text-[#606060] hover:text-[#c79a3b]">
          <Plus className="w-3 h-3" /> Nova aula
        </button>
      )}
    </div>
  )
}

function LessonRow({ lesson }: { lesson: Lesson }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(lesson.title)
  const [videoUrl, setVideoUrl] = useState(lesson.video_url ?? '')
  const [confirmDel, setConfirmDel] = useState(false)

  async function save() {
    await updateFormacaoLesson(lesson.id, { title, video_url: videoUrl })
    setEditing(false)
  }
  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); return }
    await deleteFormacaoLesson(lesson.id)
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-[#c79a3b]/30 bg-[#111111] p-2.5 space-y-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da aula"
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs text-[#f0f0f0] outline-none focus:border-[#c79a3b]" />
        <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="URL do vídeo (YouTube)"
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs text-[#f0f0f0] outline-none focus:border-[#c79a3b]" />
        <div className="flex justify-end gap-2">
          <button onClick={() => setEditing(false)} className="text-[11px] text-[#606060]">Cancelar</button>
          <button onClick={save} className="text-[11px] font-bold text-[#c79a3b]">Salvar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-[#111111] px-3 py-2">
      <p className="flex-1 text-xs text-[#a0a0a0] truncate">{lesson.title}</p>
      {!lesson.video_url && <span className="text-[10px] text-[#505050]">sem vídeo</span>}
      <button onClick={() => setEditing(true)} className="p-1 text-[#606060] hover:text-[#c79a3b]"><Pencil className="w-3 h-3" /></button>
      <button onClick={handleDelete} className={`p-1 rounded ${confirmDel ? 'text-red-400' : 'text-[#606060] hover:text-red-400'}`}><Trash2 className="w-3 h-3" /></button>
    </div>
  )
}

function NewLessonForm({ moduleId, onDone }: { moduleId: string; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    await createFormacaoLesson(moduleId, { title, video_url: videoUrl, lesson_type: 'video' })
    setSaving(false)
    onDone()
  }

  return (
    <div className="rounded-lg border border-[#c79a3b]/30 bg-[#111111] p-2.5 space-y-2">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da aula" autoFocus
        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs text-[#f0f0f0] outline-none focus:border-[#c79a3b]" />
      <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="URL do vídeo (YouTube, opcional)"
        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs text-[#f0f0f0] outline-none focus:border-[#c79a3b]" />
      <div className="flex justify-end gap-2">
        <button onClick={onDone} className="text-[11px] text-[#606060]">Cancelar</button>
        <button onClick={handleSave} disabled={saving} className="text-[11px] font-bold text-[#c79a3b] disabled:opacity-50">
          {saving ? 'Salvando...' : 'Adicionar'}
        </button>
      </div>
    </div>
  )
}

function MaterialList({ materials, moduleId }: { materials: { id: string; title: string; type: string; url: string }[]; moduleId: string }) {
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!title.trim() || !url.trim()) return
    setSaving(true)
    await createFormacaoMaterial({ title, url, type: 'link', module_id: moduleId })
    setSaving(false)
    setTitle(''); setUrl(''); setCreating(false)
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold text-[#606060] uppercase tracking-wide flex items-center gap-1.5"><Paperclip className="w-3 h-3" /> Materiais complementares</p>
      {materials.map((m) => (
        <div key={m.id} className="flex items-center gap-2 rounded-lg bg-[#111111] px-3 py-2">
          <Link2 className="w-3 h-3 text-[#606060] flex-shrink-0" />
          <a href={m.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-xs text-[#a0a0a0] hover:text-[#c79a3b] truncate">{m.title}</a>
          <button onClick={() => deleteFormacaoMaterial(m.id)} className="p-1 text-[#606060] hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
        </div>
      ))}
      {creating ? (
        <div className="rounded-lg border border-[#c79a3b]/30 bg-[#111111] p-2.5 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do material" autoFocus
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs text-[#f0f0f0] outline-none focus:border-[#c79a3b]" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL (PDF, link externo)"
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs text-[#f0f0f0] outline-none focus:border-[#c79a3b]" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="text-[11px] text-[#606060]">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="text-[11px] font-bold text-[#c79a3b] disabled:opacity-50">
              {saving ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 text-xs text-[#606060] hover:text-[#c79a3b]">
          <Plus className="w-3 h-3" /> Novo material
        </button>
      )}
    </div>
  )
}
