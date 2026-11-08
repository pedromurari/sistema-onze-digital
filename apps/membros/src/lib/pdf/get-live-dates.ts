import { createAdminClient } from '@/lib/supabase/admin'

export type LiveDates = {
  diasLive: string   // "02, 03 e 04"
  mesLive: string    // "junho"
  anoLive: string    // "2026"
}

function extractDay(label: string): string | null {
  const match = label.match(/\d+/)
  return match ? match[0].padStart(2, '0') : null
}

function extractMonth(label: string): string | null {
  // "02 de junho" → "junho"
  const match = label.toLowerCase().match(/de\s+([a-záàâãéèêíïóôõöúüç]+)/i)
  return match ? match[1] : null
}

function extractYear(label: string): string | null {
  const match = label.match(/\d{4}/)
  return match ? match[0] : null
}

const MONTH_NUMBER: Record<string, string> = {
  janeiro: '01', fevereiro: '02', março: '03', abril: '04',
  maio: '05', junho: '06', julho: '07', agosto: '08',
  setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
}

function formatDays(days: string[]): string {
  if (days.length === 0) return '—'
  if (days.length === 1) return days[0]
  if (days.length === 2) return `${days[0]} e ${days[1]}`
  return `${days.slice(0, -1).join(', ')} e ${days[days.length - 1]}`
}

export async function getLiveDates(): Promise<LiveDates> {
  const fallback: LiveDates = {
    diasLive: '—',
    mesLive: '—',
    anoLive: new Date().getFullYear().toString(),
  }

  try {
    const supabase = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any

    const { data: config } = await sb
      .from('launch_config')
      .select('id')
      .eq('is_active', true)
      .single()

    if (!config) return fallback

    const { data: lives } = await sb
      .from('launch_lives')
      .select('date_label, sort_order')
      .eq('launch_id', config.id)
      .order('sort_order', { ascending: true })

    if (!lives?.length) return fallback

    const entries: { day: string; month: string }[] = []
    let year: string = new Date().getFullYear().toString()

    for (const live of lives) {
      const day = extractDay(live.date_label ?? '')
      const month = extractMonth(live.date_label ?? '')
      if (day && month) entries.push({ day, month })

      if (!year || year === new Date().getFullYear().toString()) {
        const y = extractYear(live.date_label ?? '')
        if (y) year = y
      }
    }

    if (!entries.length) return fallback

    const months = [...new Set(entries.map(e => e.month))]

    // Todas as aulas no mesmo mês — "02, 03 e 04" + mês separado
    if (months.length === 1) {
      return {
        diasLive: formatDays(entries.map(e => e.day)),
        mesLive:  months[0],
        anoLive:  year,
      }
    }

    // Aulas cruzam meses — formato compacto "DD/MM a DD/MM" (cabe no espaço fixo do template)
    const first = entries[0]
    const last = entries[entries.length - 1]
    const toSlash = (e: { day: string; month: string }) => `${e.day}/${MONTH_NUMBER[e.month] ?? '??'}`
    const diasLive = `${toSlash(first)} a ${toSlash(last)}`

    return { diasLive, mesLive: '', anoLive: year }
  } catch {
    return fallback
  }
}
