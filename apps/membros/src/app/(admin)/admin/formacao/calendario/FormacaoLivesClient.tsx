'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Video, Plus, Pencil, Trash2, Radio, ExternalLink, Eye, EyeOff } from 'lucide-react'
import { createLive, updateLive, deleteLive, toggleLiveStatus } from '@/lib/actions/lives'
import { FORMACAO_PRODUCT_ID } from '@/lib/constants'
import type { Live } from '@/lib/actions/lives'

const STATUS_CONFIG = {
  live:      { label: 'Ao Vivo',   color: '#ef4444' },
  scheduled: { label: 'Agendado',  color: '#c79a3b' },
  ended:     { label: 'Encerrada', color: '#606060' },
  cancelled: { label: 'Cancelada', color: '#ef4444' },
}

interface ModalState { open: boolean; live: Live | null }

export function FormacaoLivesClient({ initialLives }: { initialLives: Live[] }) {
  const [lives, setLives] = useState(initialLives)
  const [modal, setModal] = useState<ModalState>({ open: false, live: null })
  const [deleting, setDeleting] = useState<string | null>(null)

  function openCreate() { setModal({ open: true, live: null }) }
  function openEdit(live: Live) { setModal({ open: true, live }) }
  function closeModal() { setModal({ open: false, live: null }) }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta aula ao vivo?')) return
    setDeleting(id)
    await deleteLive(id)
    setLives((l) => l.filter((x) => x.id !== id))
    setDeleting(null)
  }

  async function handleToggleStatus(live: Live) {
    const next = live.status === 'live' ? 'scheduled' : 'live'
    await toggleLiveStatus(live.id, next)
    setLives((ls) => ls.map((l) => l.id === live.id ? { ...l, status: next } : l))
  }

  return (
    <div className="max-w-[820px] space-y-6">
      <Link href="/admin/formacao" className="inline-flex items-center gap-1.5 text-sm text-[#606060] hover:text-[#f0f0f0] transition-colors">
        <ArrowLeft className="w-4 h-4" /> Formação IDM
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#f0f0f0]">Aulas ao vivo</h1>
          <p className="text-sm text-[#606060] mt-0.5">Link do Meet + data/horário exibidos no calendário do aluno.</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-[#0a0a0a] bg-[#c79a3b] hover:bg-[#e8b84b] transition-colors">
          <Plus className="h-4 w-4" /> Nova aula
        </button>
      </div>

      <div className="space-y-3">
        {lives.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#2a2a2a] p-12 text-center text-[#505050] text-sm">
            Nenhuma aula ao vivo cadastrada ainda.
          </div>
        )}
        {lives.map((live) => {
          const cfg = STATUS_CONFIG[live.status]
          return (
            <div key={live.id} className="rounded-xl border border-[#1e1e1e] bg-[#111111] p-4 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: 'rgba(199,154,59,0.1)', border: '1px solid rgba(199,154,59,0.2)' }}>
                <Radio className="h-4 w-4 text-[#c79a3b]" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-start gap-2 flex-wrap">
                  <p className="font-semibold text-[#f0f0f0] leading-snug">{live.title}</p>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}30` }}>
                    {cfg.label}
                  </span>
                </div>
                <p className="text-xs text-[#606060]">{live.date_label} · {live.time_label}</p>
                {live.join_url && (
                  <a href={live.join_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[#c79a3b] hover:underline mt-0.5">
                    <ExternalLink className="h-3 w-3" /> Link do Meet
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handleToggleStatus(live)} title={live.status === 'live' ? 'Encerrar' : 'Iniciar'}
                  className="p-2 rounded-lg text-[#606060] hover:text-[#c79a3b] hover:bg-[#1a1a1a] transition-colors">
                  {live.status === 'live' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button onClick={() => openEdit(live)} className="p-2 rounded-lg text-[#606060] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] transition-colors">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => handleDelete(live.id)} disabled={deleting === live.id}
                  className="p-2 rounded-lg text-[#606060] hover:text-red-400 hover:bg-red-950/20 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {modal.open && (
        <LiveModal
          live={modal.live}
          onClose={closeModal}
          onSaved={(saved) => {
            if (modal.live) setLives((ls) => ls.map((l) => l.id === saved.id ? saved : l))
            else setLives((ls) => [...ls, saved])
            closeModal()
          }}
        />
      )}
    </div>
  )
}

function LiveModal({ live, onClose, onSaved }: { live: Live | null; onClose: () => void; onSaved: (live: Live) => void }) {
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    fd.set('audience', 'Alunos da Formação')
    fd.set('product_id', FORMACAO_PRODUCT_ID)
    if (live) {
      await updateLive(live.id, fd)
      onSaved({
        ...live,
        title: fd.get('title') as string,
        date_label: fd.get('date_label') as string,
        time_label: fd.get('time_label') as string,
        status: fd.get('status') as Live['status'],
        join_url: fd.get('join_url') as string || null,
      })
    } else {
      await createLive(fd)
      window.location.reload()
    }
    setLoading(false)
  }

  const field = (label: string, name: string, opts?: { type?: string; placeholder?: string; defaultValue?: string; required?: boolean; as?: 'select'; children?: React.ReactNode }) => (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-[#a0a0a0] uppercase tracking-wide">{label}</label>
      {opts?.as === 'select' ? (
        <select name={name} defaultValue={opts.defaultValue}
          className="w-full px-3 py-2 rounded-xl text-sm bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] outline-none focus:border-[#c79a3b]">
          {opts.children}
        </select>
      ) : (
        <input type={opts?.type ?? 'text'} name={name} placeholder={opts?.placeholder} defaultValue={opts?.defaultValue} required={opts?.required}
          className="w-full px-3 py-2 rounded-xl text-sm bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] placeholder:text-[#505050] outline-none focus:border-[#c79a3b]" />
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg bg-[#111111] rounded-2xl border border-[#2a2a2a] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e1e]">
          <h2 className="font-bold text-[#f0f0f0]">{live ? 'Editar aula' : 'Nova aula ao vivo'}</h2>
          <button onClick={onClose} className="text-[#606060] hover:text-[#f0f0f0] text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {field('Título *', 'title', { defaultValue: live?.title, required: true, placeholder: 'Ex: Aula 01 — Abertura' })}
          <div className="grid grid-cols-2 gap-4">
            {field('Data', 'date_label', { defaultValue: live?.date_label, required: true, placeholder: '20 de agosto' })}
            {field('Horário', 'time_label', { defaultValue: live?.time_label, required: true, placeholder: '19h30' })}
          </div>
          {field('Link do Google Meet', 'join_url', { defaultValue: live?.join_url ?? '', placeholder: 'https://meet.google.com/...' })}
          {field('Status', 'status', { as: 'select', defaultValue: live?.status ?? 'scheduled', children: (
            <>
              <option value="scheduled">Agendado</option>
              <option value="live">Ao Vivo</option>
              <option value="ended">Encerrada</option>
              <option value="cancelled">Cancelada</option>
            </>
          )})}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-[#606060] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="px-5 py-2 rounded-xl text-sm font-bold text-[#0a0a0a] bg-[#c79a3b] hover:bg-[#e8b84b] transition-colors disabled:opacity-60">
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
