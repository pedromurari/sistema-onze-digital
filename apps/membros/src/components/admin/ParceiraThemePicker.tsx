'use client'

import { useState } from 'react'
import type { PartnerTheme } from '@/types'

export function ParceiraThemePicker({
  themes,
  defaultThemeId,
}: {
  themes: PartnerTheme[]
  defaultThemeId?: string | null
}) {
  const [selected, setSelected] = useState(defaultThemeId ?? themes[0]?.id)

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {themes.map((theme) => (
        <label
          key={theme.id}
          className="cursor-pointer rounded-xl p-3 transition-colors"
          style={{
            background: '#0d0d0d',
            border: selected === theme.id ? '1px solid #FFA902' : '1px solid #2a2a2a',
          }}
        >
          <input
            type="radio"
            name="theme_id"
            value={theme.id}
            checked={selected === theme.id}
            onChange={() => setSelected(theme.id)}
            className="sr-only"
          />
          <div
            className="h-14 w-full rounded-lg"
            style={{
              background: `linear-gradient(135deg, ${theme.primary_color}, ${theme.secondary_color}, ${theme.accent_color})`,
            }}
          />
          <p className="mt-2 text-sm font-medium text-white">{theme.name}</p>
          <p className="text-xs capitalize" style={{ color: '#555' }}>{theme.background_preset}</p>
        </label>
      ))}
    </div>
  )
}
