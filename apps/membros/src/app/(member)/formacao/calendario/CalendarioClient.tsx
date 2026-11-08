'use client'

import Link from 'next/link'
import { ArrowLeft, Video, Clock, CalendarClock, ExternalLink, Radio } from 'lucide-react'
import type { Live } from '@/lib/actions/lives'
import type { FormacaoDeadline } from '@/lib/formacao-queries'

interface Props {
  lives: Live[]
  deadlines: FormacaoDeadline[]
}

export function CalendarioClient({ lives, deadlines }: Props) {
  return (
    <div className="min-h-screen bg-[#0D1638] px-4 sm:px-6 lg:px-10 py-6">
      <div className="max-w-[820px] mx-auto">
        <Link href="/formacao" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Formação IDM
        </Link>

        <h1 className="text-xl font-bold text-white mb-6">Calendário da turma</h1>

        <section className="mb-8">
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5" /> Aulas ao vivo
          </h2>

          {lives.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.08] p-6 text-center">
              <Radio className="w-6 h-6 text-white/20 mx-auto mb-2" />
              <p className="text-sm text-white/40">A equipe está organizando o cronograma de aulas ao vivo.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lives.map((l) => (
                <div key={l.id} className="rounded-xl bg-[#0A1232] border border-white/[0.08] p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{l.title}</p>
                    <p className="text-xs text-white/40 mt-0.5">{l.date_label} · {l.time_label}</p>
                  </div>
                  {l.join_url ? (
                    <a href={l.join_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 bg-[#FFB800] text-[#0D1638] text-xs font-semibold rounded-xl hover:bg-[#FFC933] transition-colors flex-shrink-0">
                      <ExternalLink className="w-3.5 h-3.5" /> Entrar
                    </a>
                  ) : (
                    <span className="text-[10px] text-white/30 uppercase tracking-wider flex-shrink-0">Link em breve</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5" /> Prazos de tarefas
          </h2>

          {deadlines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.08] p-6 text-center">
              <p className="text-sm text-white/40">Nenhum prazo definido no momento.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {deadlines.map((d) => (
                <div key={d.id} className="rounded-xl bg-[#0A1232] border border-white/[0.08] p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{d.title}</p>
                    <p className="text-xs text-white/40 mt-0.5">{d.moduleTitle}</p>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs text-[#FFB800] flex-shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(d.dueAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
