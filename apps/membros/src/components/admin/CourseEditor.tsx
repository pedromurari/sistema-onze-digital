'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateCourse,
  createModule, updateModule, deleteModule,
  createLesson, updateLesson, deleteLesson,
  type AdminCourse, type AdminModule, type AdminLesson,
} from '@/lib/actions/admin-courses'
import {
  Check, ChevronDown, ChevronRight, Eye, EyeOff, Loader2,
  Pencil, Plus, Trash2, Video, FileText, Paperclip, X,
} from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const LESSON_ICONS = { video: Video, text: FileText, file: Paperclip }

// ─── Inline editable lesson row ───────────────────────────────────────────────

function LessonRow({ lesson, onDelete }: { lesson: AdminLesson; onDelete: () => void }) {
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const [title, setTitle] = useState(lesson.title)
  const [type, setType] = useState(lesson.lesson_type)
  const [videoUrl, setVideoUrl] = useState(lesson.video_url ?? '')
  const [duration, setDuration] = useState(lesson.video_duration?.toString() ?? '')
  const [isFree, setIsFree] = useState(lesson.is_free_preview)
  const [err, setErr] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const Icon = LESSON_ICONS[lesson.lesson_type] ?? Video

  function save() {
    if (!title.trim()) { setErr('Título obrigatório'); return }
    startTransition(async () => {
      const res = await updateLesson(lesson.id, {
        title: title.trim(),
        lesson_type: type,
        video_url: videoUrl.trim() || null,
        video_duration: duration ? parseInt(duration) : null,
        is_free_preview: isFree,
      })
      if (res.error) { setErr(res.error); return }
      setEditing(false)
      setErr(null)
      router.refresh()
    })
  }

  function handleDelete() {
    setDeleting(true)
    startTransition(async () => {
      await deleteLesson(lesson.id)
      onDelete()
      router.refresh()
    })
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg group" style={{ background: '#0d0d0d' }}>
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: '#555' }} />
        <p className="flex-1 text-sm text-white truncate">{lesson.title}</p>
        {lesson.is_free_preview && (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>Free</span>
        )}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditing(true)} className="w-6 h-6 rounded flex items-center justify-center" style={{ color: '#666' }}>
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={handleDelete} disabled={deleting} className="w-6 h-6 rounded flex items-center justify-center disabled:opacity-40" style={{ color: '#666' }}>
            {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: '#0d0d0d', border: '1px solid #2a2a2a' }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold" style={{ color: '#aaa' }}>Editar aula</p>
        <button onClick={() => setEditing(false)} className="w-6 h-6 rounded flex items-center justify-center" style={{ color: '#555' }}>
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Título">
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} className={inputCls} style={inputStyle} />
        </Field>
        <Field label="Tipo">
          <select value={type} onChange={e => setType(e.target.value as 'video' | 'text' | 'file')} className={inputCls} style={inputStyle}>
            <option value="video">Vídeo</option>
            <option value="text">Texto</option>
            <option value="file">Arquivo</option>
          </select>
        </Field>
      </div>

      {type === 'video' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="URL do vídeo (YouTube)">
              <input type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://youtube.com/..." className={inputCls} style={inputStyle} />
            </Field>
          </div>
          <Field label="Duração (seg)">
            <input type="number" value={duration} onChange={e => setDuration(e.target.value)} placeholder="3600" className={inputCls} style={inputStyle} />
          </Field>
        </div>
      )}

      <label className="flex items-center gap-2 cursor-pointer">
        <div
          onClick={() => setIsFree(v => !v)}
          className="relative w-8 h-4 rounded-full transition-colors shrink-0"
          style={{ background: isFree ? '#FFA902' : '#2a2a2a' }}
        >
          <span className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform" style={{ transform: isFree ? 'translateX(16px)' : 'translateX(0)' }} />
        </div>
        <span className="text-xs text-white">Aula gratuita (preview)</span>
      </label>

      {err && <p className="text-xs" style={{ color: '#f87171' }}>{err}</p>}

      <button
        onClick={save}
        disabled={isPending}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-60"
        style={{ background: '#FFA902', color: '#0a0a0a' }}
      >
        {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        Salvar aula
      </button>
    </div>
  )
}

// ─── Module panel ─────────────────────────────────────────────────────────────

function ModulePanel({
  mod,
  onDeleted,
}: {
  mod: AdminModule
  onDeleted: () => void
}) {
  const [open, setOpen] = useState(true)
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(mod.title)
  const [isPending, startTransition] = useTransition()
  const [addingLesson, setAddingLesson] = useState(false)
  const [newLessonTitle, setNewLessonTitle] = useState('')
  const [newLessonType, setNewLessonType] = useState<'video' | 'text' | 'file'>('video')
  const [newLessonUrl, setNewLessonUrl] = useState('')
  const router = useRouter()

  function saveTitle() {
    if (!title.trim()) return
    startTransition(async () => {
      await updateModule(mod.id, { title: title.trim() })
      setEditingTitle(false)
      router.refresh()
    })
  }

  function handleDeleteModule() {
    if (!confirm(`Excluir módulo "${mod.title}" e todas as aulas?`)) return
    startTransition(async () => {
      await deleteModule(mod.id)
      onDeleted()
      router.refresh()
    })
  }

  function handleAddLesson() {
    if (!newLessonTitle.trim()) return
    startTransition(async () => {
      await createLesson({
        module_id: mod.id,
        title: newLessonTitle.trim(),
        lesson_type: newLessonType,
        video_url: newLessonUrl.trim() || null,
        sort_order: mod.lessons.length,
      })
      setNewLessonTitle('')
      setNewLessonUrl('')
      setAddingLesson(false)
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#111', border: '1px solid #1a1a1a' }}>
      {/* Module header */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: open ? '1px solid #1a1a1a' : 'none' }}>
        <button onClick={() => setOpen(v => !v)} className="text-white transition-transform" style={{ color: '#555' }}>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => e.key === 'Enter' && saveTitle()}
            className="flex-1 text-sm font-semibold text-white bg-transparent border-b outline-none"
            style={{ borderColor: '#FFA902' }}
          />
        ) : (
          <p
            className="flex-1 text-sm font-semibold text-white cursor-pointer hover:opacity-80"
            onClick={() => setEditingTitle(true)}
          >
            {mod.title}
          </p>
        )}

        <span className="text-xs" style={{ color: '#444' }}>{mod.lessons.length} aula{mod.lessons.length !== 1 ? 's' : ''}</span>
        <button onClick={handleDeleteModule} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-950/30" style={{ color: '#555' }}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Lessons */}
      {open && (
        <div className="p-3 space-y-1.5">
          {mod.lessons.map(lesson => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              onDelete={() => router.refresh()}
            />
          ))}

          {/* Add lesson form */}
          {addingLesson ? (
            <div className="rounded-xl p-3 space-y-3 mt-2" style={{ background: '#0d0d0d', border: '1px solid #2a2a2a' }}>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <input
                    autoFocus
                    type="text"
                    value={newLessonTitle}
                    onChange={e => setNewLessonTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddLesson()}
                    placeholder="Título da aula"
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>
                <select value={newLessonType} onChange={e => setNewLessonType(e.target.value as 'video' | 'text' | 'file')} className={inputCls} style={inputStyle}>
                  <option value="video">Vídeo</option>
                  <option value="text">Texto</option>
                  <option value="file">Arquivo</option>
                </select>
              </div>
              {newLessonType === 'video' && (
                <input
                  type="url"
                  value={newLessonUrl}
                  onChange={e => setNewLessonUrl(e.target.value)}
                  placeholder="URL do YouTube"
                  className={inputCls}
                  style={inputStyle}
                />
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleAddLesson}
                  disabled={isPending || !newLessonTitle.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-60"
                  style={{ background: '#FFA902', color: '#0a0a0a' }}
                >
                  {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Adicionar
                </button>
                <button onClick={() => setAddingLesson(false)} className="px-3 py-2 rounded-xl text-xs font-medium" style={{ background: '#1a1a1a', color: '#888' }}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingLesson(true)}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors mt-1"
              style={{ color: '#555', border: '1px dashed #2a2a2a' }}
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar aula
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'info' | 'conteudo'

// ─── Main editor ─────────────────────────────────────────────────────────────

export function CourseEditor({ course }: { course: AdminCourse }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('info')
  const [isPending, startTransition] = useTransition()
  const [infoSuccess, setInfoSuccess] = useState(false)
  const [infoErr, setInfoErr] = useState<string | null>(null)
  const [addingModule, setAddingModule] = useState(false)
  const [newModuleTitle, setNewModuleTitle] = useState('')
  const [addModulePending, startAddModule] = useTransition()

  // Info tab state
  const [title, setTitle] = useState(course.title)
  const [slug, setSlug] = useState(course.slug)
  const [description, setDescription] = useState(course.description ?? '')
  const [thumbnail, setThumbnail] = useState(course.thumbnail_url ?? '')
  const [productType, setProductType] = useState(course.product_type)
  const [isPublished, setIsPublished] = useState(course.is_published)
  const [sortOrder, setSortOrder] = useState(course.sort_order.toString())

  function saveInfo(e: React.FormEvent) {
    e.preventDefault()
    setInfoErr(null)
    startTransition(async () => {
      const res = await updateCourse(course.id, {
        title: title.trim(),
        slug: slug.trim(),
        description: description.trim() || null,
        thumbnail_url: thumbnail.trim() || null,
        product_type: productType,
        is_published: isPublished,
        sort_order: parseInt(sortOrder) || 0,
      })
      if (res.error) { setInfoErr(res.error); return }
      setInfoSuccess(true)
      setTimeout(() => setInfoSuccess(false), 3000)
      router.refresh()
    })
  }

  function handleAddModule() {
    if (!newModuleTitle.trim()) return
    startAddModule(async () => {
      await createModule({
        product_id: course.id,
        title: newModuleTitle.trim(),
        sort_order: course.modules.length,
      })
      setNewModuleTitle('')
      setAddingModule(false)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: '#111', border: '1px solid #1a1a1a' }}>
        {(['info', 'conteudo'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            style={tab === t ? { background: '#FFA902', color: '#0a0a0a' } : { color: '#666' }}
          >
            {t === 'info' ? 'Informações' : 'Conteúdo'}
          </button>
        ))}
      </div>

      {/* ── Tab: Info ───────────────────────────────────────────────────────── */}
      {tab === 'info' && (
        <form onSubmit={saveInfo} className="max-w-xl space-y-5">
          <div className="rounded-xl p-5 space-y-4" style={{ background: '#111', border: '1px solid #1a1a1a' }}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Título *">
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} required className={inputCls} style={inputStyle} />
              </Field>
              <Field label="Slug (URL)">
                <input type="text" value={slug} onChange={e => setSlug(e.target.value)} className={inputCls} style={inputStyle} />
              </Field>
            </div>

            <Field label="Descrição">
              <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} className={inputCls} style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>

            <Field label="URL da thumbnail">
              <input type="url" value={thumbnail} onChange={e => setThumbnail(e.target.value)} placeholder="https://..." className={inputCls} style={inputStyle} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Tipo">
                <select value={productType} onChange={e => setProductType(e.target.value)} className={inputCls} style={inputStyle}>
                  <option value="course">Curso</option>
                  <option value="ebook">E-book</option>
                  <option value="bundle">Bundle</option>
                  <option value="mentorship">Mentoria</option>
                  <option value="event">Evento</option>
                </select>
              </Field>
              <Field label="Ordem">
                <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} className={inputCls} style={inputStyle} />
              </Field>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setIsPublished(v => !v)}
                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                style={{ background: isPublished ? '#FFA902' : '#2a2a2a' }}
              >
                <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" style={{ transform: isPublished ? 'translateX(16px)' : 'translateX(0)' }} />
              </div>
              <div>
                <p className="text-sm text-white">{isPublished ? <><Eye className="w-3.5 h-3.5 inline mr-1" />Publicado</> : <><EyeOff className="w-3.5 h-3.5 inline mr-1" />Rascunho</>}</p>
              </div>
            </label>
          </div>

          {infoErr && (
            <p className="text-sm px-3 py-2 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>{infoErr}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-60 transition-all"
            style={{ background: infoSuccess ? '#22c55e' : '#FFA902', color: '#0a0a0a' }}
          >
            {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
              : infoSuccess ? <><Check className="w-4 h-4" /> Salvo!</>
              : 'Salvar informações'}
          </button>
        </form>
      )}

      {/* ── Tab: Conteúdo ───────────────────────────────────────────────────── */}
      {tab === 'conteudo' && (
        <div className="max-w-2xl space-y-3">
          {course.modules.map(mod => (
            <ModulePanel
              key={mod.id}
              mod={mod}
              onDeleted={() => router.refresh()}
            />
          ))}

          {/* Add module */}
          {addingModule ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={newModuleTitle}
                onChange={e => setNewModuleTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddModule()}
                placeholder="Nome do módulo"
                className={inputCls}
                style={inputStyle}
              />
              <button
                onClick={handleAddModule}
                disabled={addModulePending || !newModuleTitle.trim()}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold shrink-0 disabled:opacity-60"
                style={{ background: '#FFA902', color: '#0a0a0a' }}
              >
                {addModulePending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Criar
              </button>
              <button onClick={() => setAddingModule(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium shrink-0" style={{ background: '#1a1a1a', color: '#888' }}>
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingModule(true)}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-medium transition-colors"
              style={{ border: '1px dashed #2a2a2a', color: '#555' }}
            >
              <Plus className="w-4 h-4" /> Adicionar módulo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
