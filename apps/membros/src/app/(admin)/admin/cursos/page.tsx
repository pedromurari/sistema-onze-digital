import { getAdminCourses } from '@/lib/actions/admin-courses'
import Link from 'next/link'
import { BookOpen, ChevronRight, Plus, Eye, EyeOff } from 'lucide-react'

const TYPE_LABELS: Record<string, string> = {
  course: 'Curso', ebook: 'E-book', bundle: 'Bundle', mentorship: 'Mentoria', event: 'Evento',
}

export default async function AdminCursosPage() {
  const products = await getAdminCourses()

  return (
    <div className="max-w-5xl space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Cursos & Produtos</h1>
          <p className="text-sm mt-1" style={{ color: '#888' }}>Gerencie conteúdo, módulos e aulas.</p>
        </div>
        <Link
          href="/admin/cursos/novo"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
          style={{ background: '#FFA902', color: '#0a0a0a' }}
        >
          <Plus className="w-4 h-4" /> Novo produto
        </Link>
      </div>

      <div className="space-y-2">
        {products.map((p: { id: string; slug: string; title: string; thumbnail_url: string | null; product_type: string; is_published: boolean; sort_order: number }) => (
          <Link
            key={p.id}
            href={`/admin/cursos/${p.slug}/editar`}
            className="flex items-center gap-4 px-5 py-4 rounded-xl transition-colors group"
            style={{ background: '#111', border: '1px solid #1a1a1a' }}
          >
            {p.thumbnail_url
              ? <img src={p.thumbnail_url} alt={p.title} className="w-14 h-10 rounded-lg object-cover shrink-0" />
              : (
                <div className="w-14 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#1a1a1a' }}>
                  <BookOpen className="w-4 h-4" style={{ color: '#444' }} />
                </div>
              )
            }

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{p.title}</p>
              <p className="text-xs mt-0.5" style={{ color: '#555' }}>
                {TYPE_LABELS[p.product_type] ?? p.product_type} · ordem {p.sort_order}
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {p.is_published
                ? <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
                    <Eye className="w-3 h-3" /> Publicado
                  </span>
                : <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: '#1a1a1a', color: '#555' }}>
                    <EyeOff className="w-3 h-3" /> Rascunho
                  </span>
              }
              <ChevronRight className="w-4 h-4 opacity-30 group-hover:opacity-70 transition-opacity" style={{ color: '#888' }} />
            </div>
          </Link>
        ))}

        {products.length === 0 && (
          <div className="text-center py-16 rounded-xl" style={{ background: '#111', border: '1px solid #1a1a1a' }}>
            <BookOpen className="w-8 h-8 mx-auto mb-3" style={{ color: '#333' }} />
            <p className="text-sm font-medium" style={{ color: '#555' }}>Nenhum produto cadastrado ainda.</p>
            <Link href="/admin/cursos/novo" className="inline-block mt-3 text-xs underline" style={{ color: '#FFA902' }}>
              Criar o primeiro produto
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
