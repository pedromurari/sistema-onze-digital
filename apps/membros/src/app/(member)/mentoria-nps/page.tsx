import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Layers, ShieldCheck, Calendar, PlayCircle, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { MapaEsferasCard, VoltarButton } from '../mentoria-npa/HubCards'
import { FinanceiroCard, FinanceiroTitulo } from '@/components/marketing/FinanceiroCard'
import { getFinanceiroNps } from '@/lib/financeiro-nps'

export const metadata = { title: 'Mentoria NPS — Instituto Despertamente' }

function LinkCard({ href, icon: Icon, title, subtitle }: { href: string; icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <Link
      href={href}
      className="group w-full flex items-center gap-4 rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5"
      style={{
        background: 'linear-gradient(160deg, rgba(255,184,0,0.05), rgba(10,18,50,0) 65%), #0A1232',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'linear-gradient(135deg, rgba(255,184,0,0.18), rgba(255,184,0,0.06))', border: '1px solid rgba(255,184,0,0.25)' }}
      >
        <Icon className="w-4 h-4 text-[#FFB800]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white">{title}</p>
        <p className="text-sm text-white/50">{subtitle}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-white/20 shrink-0 transition-all duration-300 group-hover:text-[#FFB800] group-hover:translate-x-0.5" />
    </Link>
  )
}

export default async function MentoriaNpsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: profile } = await sb.from('profiles').select('role, full_name').eq('id', user.id).single()

  const { data: enrollments } = await sb
    .from('enrollments')
    .select('id, expires_at, products!inner(slug)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .eq('products.slug', 'mentoria-nps')

  const now = Date.now()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vigentes = (enrollments ?? []).filter((e: any) => !e.expires_at || new Date(e.expires_at).getTime() > now)
  const hasNps = vigentes.length > 0
  const isAdmin = profile?.role === 'admin'

  if (!hasNps && !isAdmin) redirect('/dashboard')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validade = vigentes.map((e: any) => e.expires_at).filter(Boolean).sort().pop() as string | undefined
  const validadeFmt = validade
    ? new Date(validade).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : null

  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'Bem-vindo'

  // Mensalidade vinda do financeiro; sem cobrança (ou integração ainda não ligada) fica em stand-by.
  const financeiro = user.email ? await getFinanceiroNps(user.email) : null

  return (
    <div className="relative max-w-2xl mx-auto px-4 sm:px-6 lg:px-10 pt-6 pb-24 md:pb-16 space-y-10">
      <VoltarButton />

      <div className="space-y-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FFB800]">Mentoria NPS</p>
        <h1
          className="text-4xl sm:text-[2.75rem] leading-[1.08] font-bold text-white"
          style={{ fontFamily: 'var(--font-fraunces, Georgia, serif)' }}
        >
          Bem-vindo,<br className="hidden sm:block" /> {firstName}.
        </h1>
        <p className="text-sm sm:text-[15px] text-white/55 max-w-lg leading-relaxed">
          Sua mensalidade está em dia. Você tem acesso aos encontros, às gravações, aos materiais e a até 8 mapas por mês no Mapa 7 Esferas.
        </p>
        <div
          className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5"
          style={{ background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.22)' }}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-[#FFB800]" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#FFB800]">
            Matrícula ativa{validadeFmt ? ` · acesso garantido até ${validadeFmt}` : ''}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-[#FFB800]" />
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Encontros</span>
        </div>
        <LinkCard href="/mentoria-nps/encontros" icon={Calendar} title="Próximos encontros" subtitle="Dois encontros por mês — datas e link de entrada." />
        <LinkCard href="/cursos/mentoria-nps" icon={PlayCircle} title="Gravações e materiais" subtitle="Reveja os encontros anteriores e baixe os materiais." />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Layers className="w-4 h-4 text-[#FFB800]" />
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Plataformas</span>
        </div>
        <MapaEsferasCard />
      </div>

      <div className="space-y-3">
        <FinanceiroTitulo />
        <FinanceiroCard dados={financeiro} acessoAte={validadeFmt} />
      </div>
    </div>
  )
}
