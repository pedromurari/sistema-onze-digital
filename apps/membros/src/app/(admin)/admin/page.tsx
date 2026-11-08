import { BookOpen, Users, TrendingUp, BarChart3 } from 'lucide-react'
import { DEMO_PRODUCTS } from '@/lib/demo-data'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

async function getStats() {
  if (DEMO_MODE) {
    return { totalProducts: DEMO_PRODUCTS.length, totalStudents: 47, totalEnrollments: 89 }
  }
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const [{ count: a }, { count: b }, { count: c }] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
    supabase.from('enrollments').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ])
  return { totalProducts: a ?? 0, totalStudents: b ?? 0, totalEnrollments: c ?? 0 }
}

export default async function AdminDashboardPage() {
  const { totalProducts, totalStudents, totalEnrollments } = await getStats()

  const stats = [
    { label: 'Produtos', value: totalProducts, icon: BookOpen, color: '#FFA902' },
    { label: 'Alunos', value: totalStudents, icon: Users, color: '#3b82f6' },
    { label: 'Matrículas Ativas', value: totalEnrollments, icon: TrendingUp, color: '#22c55e' },
    { label: 'Taxa Conclusão', value: '68%', icon: BarChart3, color: '#a855f7' },
  ]

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Painel Admin</h1>
        <p className="text-sm mt-1" style={{ color: '#888888' }}>Visão geral da plataforma IDM Tools.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl p-4 space-y-2" style={{ background: '#111111', border: '1px solid #1a1a1a' }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium" style={{ color: '#888888' }}>{label}</p>
              <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: `${color}18` }}>
                <Icon className="w-3.5 h-3.5" style={{ color }} />
              </div>
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Produtos demo */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-white">Produtos cadastrados</h2>
        <div className="rounded-xl overflow-hidden" style={{ background: '#111111', border: '1px solid #1a1a1a' }}>
          {DEMO_PRODUCTS.map((p, i) => (
            <div key={p.id} className="flex items-center gap-4 px-4 py-3" style={{ borderBottom: i < DEMO_PRODUCTS.length - 1 ? '1px solid #1a1a1a' : 'none' }}>
              {p.thumbnail_url && <img src={p.thumbnail_url} alt={p.title} className="w-12 h-8 rounded object-cover shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{p.title}</p>
                <p className="text-xs" style={{ color: '#555555' }}>{p.product_type}</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                Publicado
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <a href="/admin/cursos" className="rounded-xl p-5 transition-colors hover:border-[#c79a3b]/30" style={{ background: '#111111', border: '1px solid #1a1a1a' }}>
          <BookOpen className="w-6 h-6 mb-3" style={{ color: '#FFA902' }} />
          <p className="font-semibold text-white">Gerenciar Cursos</p>
          <p className="text-xs mt-1" style={{ color: '#555555' }}>Criar e editar cursos, módulos e aulas.</p>
        </a>
        <a href="/admin/alunos" className="rounded-xl p-5 transition-colors hover:border-[#3b82f6]/30" style={{ background: '#111111', border: '1px solid #1a1a1a' }}>
          <Users className="w-6 h-6 mb-3" style={{ color: '#3b82f6' }} />
          <p className="font-semibold text-white">Gerenciar Alunos</p>
          <p className="text-xs mt-1" style={{ color: '#555555' }}>Ver alunos e gerenciar matrículas.</p>
        </a>
      </div>
    </div>
  )
}
