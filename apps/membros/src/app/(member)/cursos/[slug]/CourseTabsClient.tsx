'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  CheckCircle, Circle, Clock, PlayCircle, ChevronDown, ChevronUp,
  Plus, Pencil, Trash2, ClipboardList, FileText, Loader2, X, Check,
  BookOpen, Info, Link as LinkIcon
} from 'lucide-react'
import { formatDuration } from '@/lib/utils'
import { createModule, updateModule, deleteModule, createLesson, updateLesson, deleteLesson, createTask, deleteTask } from '@/lib/actions/editor'
import type { ModuleWithLessons, Progress, Product } from '@/types'

interface Props {
  slug: string
  product: Product
  modules: ModuleWithLessons[]
  progressMap: Record<string, Progress>
  isEnrolled: boolean
  isAdmin: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tasks: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  materials: any[]
}

type Tab = 'conteudo' | 'tarefas' | 'materiais' | 'sobre'

export function CourseTabsClient({ slug, product, modules: initialModules, progressMap, isEnrolled, isAdmin, tasks, materials }: Props) {
  const [tab, setTab] = useState<Tab>('conteudo')
  const [modules, setModules] = useState(initialModules)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(initialModules.map(m => m.id)))
  const [isPending, startTransition] = useTransition()

  // Editor states
  const [addingModule, setAddingModule] = useState(false)
  const [newModuleTitle, setNewModuleTitle] = useState('')
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null)
  const [editingModuleTitle, setEditingModuleTitle] = useState('')
  const [addingLessonToModule, setAddingLessonToModule] = useState<string | null>(null)
  const [newLessonTitle, setNewLessonTitle] = useState('')
  const [newLessonUrl, setNewLessonUrl] = useState('')
  const [addingTask, setAddingTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'conteudo', label: 'Conteúdo', icon: <BookOpen className="h-4 w-4" />, count: modules.reduce((a, m) => a + m.lessons.length, 0) },
    { id: 'tarefas', label: 'Tarefas', icon: <ClipboardList className="h-4 w-4" />, count: tasks.length },
    { id: 'materiais', label: 'Materiais', icon: <FileText className="h-4 w-4" />, count: materials.length },
    { id: 'sobre', label: 'Sobre', icon: <Info className="h-4 w-4" /> },
  ]

  function toggleExpanded(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handleAddModule() {
    if (!newModuleTitle.trim()) return
    startTransition(async () => {
      try {
        await createModule(product.id, newModuleTitle.trim())
        setNewModuleTitle('')
        setAddingModule(false)
        window.location.reload()
      } catch (e) { console.error(e) }
    })
  }

  async function handleUpdateModule(moduleId: string) {
    if (!editingModuleTitle.trim()) return
    startTransition(async () => {
      try {
        await updateModule(moduleId, editingModuleTitle.trim())
        setEditingModuleId(null)
        window.location.reload()
      } catch (e) { console.error(e) }
    })
  }

  async function handleDeleteModule(moduleId: string) {
    if (!confirm('Excluir este módulo e todas as suas aulas?')) return
    startTransition(async () => {
      try {
        await deleteModule(moduleId)
        window.location.reload()
      } catch (e) { console.error(e) }
    })
  }

  async function handleAddLesson(moduleId: string) {
    if (!newLessonTitle.trim()) return
    startTransition(async () => {
      try {
        await createLesson(moduleId, newLessonTitle.trim(), newLessonUrl.trim() || undefined)
        setNewLessonTitle('')
        setNewLessonUrl('')
        setAddingLessonToModule(null)
        window.location.reload()
      } catch (e) { console.error(e) }
    })
  }

  async function handleDeleteLesson(lessonId: string) {
    if (!confirm('Excluir esta aula?')) return
    startTransition(async () => {
      try {
        await deleteLesson(lessonId)
        window.location.reload()
      } catch (e) { console.error(e) }
    })
  }

  async function handleAddTask() {
    if (!newTaskTitle.trim()) return
    startTransition(async () => {
      try {
        await createTask(product.id, null, null, newTaskTitle.trim(), newTaskDesc.trim(), 'text')
        setNewTaskTitle('')
        setNewTaskDesc('')
        setAddingTask(false)
        window.location.reload()
      } catch (e) { console.error(e) }
    })
  }

  return (
    <div className="mt-6 space-y-6">

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.08] overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'border-[#FFB800] text-[#FFB800]'
                : 'border-transparent text-white/30 hover:text-white/60'
            }`}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                tab === t.id ? 'bg-[#FFB800]/20 text-[#FFB800]' : 'bg-[#0F1940] text-white/30'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB: CONTEÚDO ── */}
      {tab === 'conteudo' && (
        <div className="space-y-3">
          {modules.map(mod => {
            const lessons = [...mod.lessons].sort((a, b) => a.sort_order - b.sort_order)
            const modCompleted = lessons.filter(l => progressMap[l.id]?.completed).length
            const isExpanded = expanded.has(mod.id)

            return (
              <div key={mod.id} className="rounded-2xl border border-white/[0.08] bg-[#0A1232] overflow-hidden">
                {/* Header do módulo */}
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-[#0F1940] transition-colors"
                  onClick={() => toggleExpanded(mod.id)}
                >
                  <div className="flex-1 min-w-0">
                    {editingModuleId === mod.id ? (
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={editingModuleTitle}
                          onChange={e => setEditingModuleTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleUpdateModule(mod.id); if (e.key === 'Escape') setEditingModuleId(null) }}
                          className="flex-1 rounded-lg bg-[#0F1940] border border-white/[0.08] px-3 py-1.5 text-sm text-white outline-none focus:border-[#FFB800]"
                        />
                        <button onClick={() => handleUpdateModule(mod.id)} className="text-[#FFB800] hover:text-[#FFC933]"><Check className="h-4 w-4" /></button>
                        <button onClick={() => setEditingModuleId(null)} className="text-white/30 hover:text-white"><X className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white text-sm truncate">{mod.title}</h3>
                        {isAdmin && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
                            <button onClick={() => { setEditingModuleId(mod.id); setEditingModuleTitle(mod.title) }} className="p-1 text-white/30 hover:text-[#FFB800]"><Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={() => handleDeleteModule(mod.id)} className="p-1 text-white/30 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-white/30">{modCompleted}/{lessons.length}</span>
                    <div className="w-20 h-1.5 rounded-full bg-[#0F1940] overflow-hidden">
                      <div className="h-full rounded-full bg-[#FFB800]" style={{ width: `${lessons.length > 0 ? (modCompleted / lessons.length) * 100 : 0}%` }} />
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
                  </div>
                </div>

                {/* Aulas */}
                {isExpanded && (
                  <div className="border-t border-white/[0.08] divide-y divide-white/[0.06]">
                    {lessons.map((lesson, idx) => {
                      const done = !!progressMap[lesson.id]?.completed
                      return (
                        <div key={lesson.id} className="group flex items-center gap-3 px-5 py-3 hover:bg-[#0F1940] transition-colors">
                          {done
                            ? <CheckCircle className="h-4 w-4 flex-shrink-0 text-[#22c55e]" />
                            : <Circle className="h-4 w-4 flex-shrink-0 text-white/[0.15]" />
                          }
                          <span className="text-xs text-white/25 w-5 flex-shrink-0">{idx + 1}</span>
                          {isEnrolled ? (
                            <Link href={`/cursos/${slug}/aulas/${lesson.id}`}
                              className={`flex-1 text-sm truncate hover:text-[#FFB800] transition-colors ${done ? 'text-white/35' : 'text-white'}`}
                            >
                              {lesson.title}
                            </Link>
                          ) : (
                            <span className="flex-1 text-sm truncate text-white/35">{lesson.title}</span>
                          )}
                          {lesson.video_duration && (
                            <span className="text-xs flex items-center gap-1 text-white/25 flex-shrink-0">
                              <Clock className="h-3 w-3" />{formatDuration(lesson.video_duration)}
                            </span>
                          )}
                          {isAdmin && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 flex-shrink-0">
                              <button onClick={() => handleDeleteLesson(lesson.id)} className="p-1 text-white/30 hover:text-red-400">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Add aula (admin) */}
                    {isAdmin && (
                      <>
                        {addingLessonToModule === mod.id ? (
                          <div className="px-5 py-3 space-y-2 bg-[#091028]">
                            <input autoFocus placeholder="Título da aula" value={newLessonTitle} onChange={e => setNewLessonTitle(e.target.value)}
                              className="w-full rounded-lg bg-[#0A1232] border border-white/[0.08] px-3 py-2 text-sm text-white outline-none focus:border-[#FFB800] placeholder-white/25"
                            />
                            <input placeholder="URL do YouTube (opcional)" value={newLessonUrl} onChange={e => setNewLessonUrl(e.target.value)}
                              className="w-full rounded-lg bg-[#0A1232] border border-white/[0.08] px-3 py-2 text-sm text-white outline-none focus:border-[#FFB800] placeholder-white/25"
                            />
                            <div className="flex gap-2">
                              <button onClick={() => handleAddLesson(mod.id)} disabled={isPending || !newLessonTitle.trim()}
                                className="flex items-center gap-1.5 rounded-lg bg-[#FFB800] px-4 py-2 text-xs font-bold text-[#0D1638] disabled:opacity-50"
                              >
                                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Adicionar
                              </button>
                              <button onClick={() => setAddingLessonToModule(null)} className="rounded-lg border border-white/[0.08] px-4 py-2 text-xs text-white/30 hover:text-white">
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setAddingLessonToModule(mod.id)}
                            className="flex w-full items-center gap-2 px-5 py-2.5 text-xs font-medium text-white/25 hover:text-[#FFB800] hover:bg-[#0F1940] transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" /> Adicionar aula
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Adicionar módulo (admin) */}
          {isAdmin && (
            <div className="rounded-2xl border border-dashed border-white/[0.08] overflow-hidden">
              {addingModule ? (
                <div className="p-5 space-y-3">
                  <input autoFocus placeholder="Nome do módulo" value={newModuleTitle} onChange={e => setNewModuleTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddModule(); if (e.key === 'Escape') setAddingModule(false) }}
                    className="w-full rounded-lg bg-[#0A1232] border border-white/[0.08] px-4 py-2.5 text-sm text-white outline-none focus:border-[#FFB800] placeholder-white/25"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAddModule} disabled={isPending || !newModuleTitle.trim()}
                      className="flex items-center gap-1.5 rounded-lg bg-[#FFB800] px-5 py-2 text-sm font-bold text-[#0D1638] disabled:opacity-50"
                    >
                      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Criar módulo
                    </button>
                    <button onClick={() => setAddingModule(false)} className="rounded-lg border border-white/[0.08] px-4 py-2 text-sm text-white/30 hover:text-white">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingModule(true)}
                  className="flex w-full items-center justify-center gap-2 px-5 py-4 text-sm font-medium text-white/25 hover:text-[#FFB800] hover:bg-[#0A1232] transition-colors"
                >
                  <Plus className="h-4 w-4" /> Adicionar novo módulo
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: TAREFAS ── */}
      {tab === 'tarefas' && (
        <div className="space-y-4">
          {tasks.length === 0 && !isAdmin && (
            <div className="rounded-2xl border border-dashed border-white/[0.08] p-12 text-center">
              <ClipboardList className="h-10 w-10 text-white/10 mx-auto mb-3" />
              <p className="text-white/30 text-sm">Nenhuma tarefa disponível ainda.</p>
            </div>
          )}

          {tasks.map((task: { id: string; title: string; description?: string; task_type: string }) => (
            <div key={task.id} className="rounded-2xl border border-white/[0.08] bg-[#0A1232] p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="font-semibold text-white">{task.title}</h3>
                  {task.description && <p className="text-sm text-white/30">{task.description}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="rounded-full bg-[#FFB800]/10 border border-[#FFB800]/20 px-2.5 py-0.5 text-[10px] font-bold uppercase text-[#FFB800]">
                    {task.task_type}
                  </span>
                  {isAdmin && (
                    <button onClick={() => deleteTask(task.id).then(() => window.location.reload())} className="text-white/30 hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              {isEnrolled && (
                <textarea rows={3} placeholder="Escreva sua resposta aqui..."
                  className="w-full rounded-xl bg-[#0A1232] border border-white/[0.08] px-4 py-3 text-sm text-white outline-none focus:border-[#FFB800] placeholder-white/25 resize-none"
                />
              )}
              {isEnrolled && (
                <button className="flex items-center gap-2 rounded-xl bg-[#FFB800]/10 border border-[#FFB800]/20 px-4 py-2 text-sm font-semibold text-[#FFB800] hover:bg-[#FFB800]/20 transition-colors">
                  <Check className="h-3.5 w-3.5" /> Enviar resposta
                </button>
              )}
            </div>
          ))}

          {isAdmin && (
            <div className="rounded-2xl border border-dashed border-white/[0.08] overflow-hidden">
              {addingTask ? (
                <div className="p-5 space-y-3">
                  <input autoFocus placeholder="Título da tarefa" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                    className="w-full rounded-lg bg-[#0A1232] border border-white/[0.08] px-4 py-2.5 text-sm text-white outline-none focus:border-[#FFB800] placeholder-white/25"
                  />
                  <textarea rows={2} placeholder="Descrição (opcional)" value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)}
                    className="w-full rounded-lg bg-[#0A1232] border border-white/[0.08] px-4 py-2.5 text-sm text-white outline-none focus:border-[#FFB800] placeholder-white/25 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAddTask} disabled={isPending || !newTaskTitle.trim()}
                      className="flex items-center gap-1.5 rounded-lg bg-[#FFB800] px-5 py-2 text-sm font-bold text-[#0D1638] disabled:opacity-50"
                    >
                      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Criar tarefa
                    </button>
                    <button onClick={() => setAddingTask(false)} className="rounded-lg border border-white/[0.08] px-4 py-2 text-sm text-white/30 hover:text-white">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingTask(true)}
                  className="flex w-full items-center justify-center gap-2 px-5 py-4 text-sm font-medium text-white/25 hover:text-[#FFB800] hover:bg-[#0A1232] transition-colors"
                >
                  <Plus className="h-4 w-4" /> Adicionar tarefa
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: MATERIAIS ── */}
      {tab === 'materiais' && (
        <div className="space-y-3">
          {materials.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.08] p-12 text-center">
              <FileText className="h-10 w-10 text-white/10 mx-auto mb-3" />
              <p className="text-white/30 text-sm">Nenhum material disponível ainda.</p>
            </div>
          ) : (
            materials.map((m: { id: string; title: string; type: string; url: string }) => (
              <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-[#0A1232] px-5 py-4 hover:border-[#FFB800]/30 transition-colors group"
              >
                <div className="h-10 w-10 rounded-xl bg-[#FFB800]/10 flex items-center justify-center flex-shrink-0">
                  {m.type === 'link' ? <LinkIcon className="h-5 w-5 text-[#FFB800]" /> : <FileText className="h-5 w-5 text-[#FFB800]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white group-hover:text-[#FFB800] transition-colors truncate">{m.title}</p>
                  <p className="text-xs text-white/30 uppercase">{m.type}</p>
                </div>
              </a>
            ))
          )}
        </div>
      )}

      {/* ── TAB: SOBRE ── */}
      {tab === 'sobre' && (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0A1232] p-6 space-y-4">
          <h3 className="font-bold text-white text-lg">Sobre este curso</h3>
          {product.description ? (
            <p className="text-white/60 leading-relaxed text-sm">{product.description}</p>
          ) : (
            <p className="text-white/30 text-sm">Descrição não disponível.</p>
          )}
          {product.highlights && product.highlights.length > 0 && (
            <div className="space-y-2 pt-2">
              <h4 className="text-sm font-semibold text-white">O que você vai aprender:</h4>
              <ul className="space-y-2">
                {product.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-white/60">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#FFB800] mt-1.5 flex-shrink-0" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
