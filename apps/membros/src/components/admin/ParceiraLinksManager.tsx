'use client'

import { useState, useTransition, type FormEvent } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2 } from 'lucide-react'
import type { PartnerLink } from '@/types'
import {
  addPartnerLink,
  deletePartnerLink,
  reorderPartnerLinks,
  toggleLinkActive,
  updatePartnerLink,
} from '@/lib/actions/parceiras'
import { ICON_OPTIONS, getLinkIcon } from '@/lib/linkIcons'

const inputCls =
  'w-full rounded-lg px-2.5 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-[#FFA902]'
const inputStyle = { background: '#0d0d0d', border: '1px solid #2a2a2a' }

function IconSelect({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <select
      name="icon"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      style={inputStyle}
    >
      <option value="">Ícone automático</option>
      {ICON_OPTIONS.map((group) => (
        <optgroup key={group.group} label={group.group}>
          {group.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

function SortableLinkRow({
  link,
  partnerId,
  slug,
}: {
  link: PartnerLink
  partnerId: string
  slug: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: link.id,
  })
  const [isPending, startTransition] = useTransition()
  const [icon, setIcon] = useState(link.icon ?? '')
  const Icon = getLinkIcon(link.url, icon)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  function handleBlurUpdate(field: 'label' | 'url', value: string) {
    const formData = new FormData()
    formData.set('label', field === 'label' ? value : link.label)
    formData.set('url', field === 'url' ? value : link.url)
    formData.set('type', link.type)
    formData.set('icon', icon)
    startTransition(async () => {
      await updatePartnerLink(link.id, partnerId, slug, formData)
    })
  }

  function handleIconChange(value: string) {
    setIcon(value)
    const formData = new FormData()
    formData.set('label', link.label)
    formData.set('url', link.url)
    formData.set('type', link.type)
    formData.set('icon', value)
    startTransition(async () => {
      await updatePartnerLink(link.id, partnerId, slug, formData)
    })
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, background: '#0d0d0d', border: '1px solid #1a1a1a' }}
      className="space-y-2 rounded-lg p-3"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab"
          style={{ color: '#555' }}
          aria-label="Reordenar"
        >
          <GripVertical size={18} />
        </button>

        <Icon className="h-4 w-4 shrink-0" style={{ color: '#888' }} aria-hidden />

        <input
          defaultValue={link.label}
          onBlur={(e) => handleBlurUpdate('label', e.target.value)}
          placeholder="Texto do link"
          className={`min-w-0 flex-1 ${inputCls}`}
          style={inputStyle}
        />

        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              await deletePartnerLink(link.id, partnerId, slug)
            })
          }
          style={{ color: '#555' }}
          className="shrink-0 hover:text-red-400"
          aria-label="Remover link"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex items-center gap-2 pl-[30px]">
        <input
          defaultValue={link.url}
          onBlur={(e) => handleBlurUpdate('url', e.target.value)}
          placeholder="https://..."
          className={`min-w-0 flex-1 ${inputCls}`}
          style={inputStyle}
        />

        <IconSelect
          value={icon}
          onChange={handleIconChange}
          className="w-32 shrink-0 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-[#FFA902]"
        />

        <label
          className="flex shrink-0 items-center gap-1.5 text-xs"
          style={{ color: '#888' }}
        >
          <input
            type="checkbox"
            defaultChecked={link.is_active}
            disabled={isPending}
            onChange={(e) => {
              const checked = e.target.checked
              startTransition(async () => {
                await toggleLinkActive(link.id, partnerId, slug, checked)
              })
            }}
          />
          ativo
        </label>
      </div>
    </div>
  )
}

export function ParceiraLinksManager({
  partnerId,
  slug,
  initialLinks,
}: {
  partnerId: string
  slug: string
  initialLinks: PartnerLink[]
}) {
  const [links, setLinks] = useState([...initialLinks].sort((a, b) => a.position - b.position))
  const [isPending, startTransition] = useTransition()
  const [newIcon, setNewIcon] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = links.findIndex((l) => l.id === active.id)
    const newIndex = links.findIndex((l) => l.id === over.id)
    const newOrder = arrayMove(links, oldIndex, newIndex)
    setLinks(newOrder)
    startTransition(async () => {
      await reorderPartnerLinks(
        partnerId,
        slug,
        newOrder.map((l) => l.id)
      )
    })
  }

  async function handleAddLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    const label = String(formData.get('label') ?? '').trim()
    const url = String(formData.get('url') ?? '').trim()
    if (!label || !url) return

    const optimistic: PartnerLink = {
      id: `temp-${Date.now()}`,
      partner_id: partnerId,
      label,
      url,
      icon: String(formData.get('icon') ?? '').trim() || null,
      position: links.length,
      type: (formData.get('type') as PartnerLink['type']) ?? 'link',
      is_active: true,
      click_count: 0,
      created_at: new Date().toISOString(),
    }
    setLinks((prev) => [...prev, optimistic])
    form.reset()
    setNewIcon('')
    await addPartnerLink(partnerId, slug, formData)
  }

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={links.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {links.map((link) => (
              <SortableLinkRow key={link.id} link={link} partnerId={partnerId} slug={slug} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {links.length === 0 && (
        <p className="py-6 text-center text-sm" style={{ color: '#555' }}>
          Nenhum link ainda.
        </p>
      )}

      <form onSubmit={handleAddLink} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          name="label"
          placeholder="Texto do link (ex: Instagram)"
          required
          className={`min-w-0 flex-1 ${inputCls}`}
          style={inputStyle}
        />
        <input
          name="url"
          placeholder="https://..."
          required
          className={`min-w-0 flex-1 ${inputCls}`}
          style={inputStyle}
        />
        <IconSelect
          value={newIcon}
          onChange={setNewIcon}
          className="w-full shrink-0 rounded-lg px-2.5 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-[#FFA902] sm:w-36"
        />
        <select
          name="type"
          className="w-full shrink-0 rounded-lg px-2.5 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-[#FFA902] sm:w-28"
          style={inputStyle}
        >
          <option value="link">Link</option>
          <option value="social">Social</option>
          <option value="destaque">Destaque</option>
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
          style={{ background: '#FFA902', color: '#0a0a0a' }}
        >
          + Adicionar
        </button>
      </form>
    </div>
  )
}
