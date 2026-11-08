import { getAdminProducts } from '@/lib/actions/admin-store'
import Link from 'next/link'
import { ShoppingBag, Star, ChevronRight, Tag } from 'lucide-react'

function formatBRL(value: number | null) {
  if (value === null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

const TYPE_LABELS: Record<string, string> = {
  course: 'Curso',
  ebook: 'E-book',
  bundle: 'Bundle',
  mentorship: 'Mentoria',
  event: 'Evento',
}

const PAYMENT_LABELS: Record<string, string> = {
  one_time: 'Único',
  subscription: 'Recorrente',
  free: 'Gratuito',
}

export default async function AdminLojaPage() {
  const products = await getAdminProducts()

  const withPrice = products.filter(p => p.price !== null)
  const withoutPrice = products.filter(p => p.price === null)

  return (
    <div className="max-w-5xl space-y-8 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-white">Loja — Produtos</h1>
        <p className="text-sm mt-1" style={{ color: '#888' }}>Configure preços, checkout e destaques de cada produto.</p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-4" style={{ background: '#111', border: '1px solid #1a1a1a' }}>
          <p className="text-xs" style={{ color: '#666' }}>Total de produtos</p>
          <p className="text-2xl font-bold text-white mt-1">{products.length}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: '#111', border: '1px solid #1a1a1a' }}>
          <p className="text-xs" style={{ color: '#666' }}>Com preço</p>
          <p className="text-2xl font-bold mt-1" style={{ color: '#FFA902' }}>{withPrice.length}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: '#111', border: '1px solid #1a1a1a' }}>
          <p className="text-xs" style={{ color: '#666' }}>Sem preço</p>
          <p className="text-2xl font-bold text-white mt-1">{withoutPrice.length}</p>
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {products.map(p => (
          <Link
            key={p.id}
            href={`/admin/loja/${p.id}`}
            className="flex items-center gap-4 px-5 py-4 rounded-xl transition-colors group"
            style={{ background: '#111', border: '1px solid #1a1a1a' }}
          >
            {p.thumbnail_url
              ? <img src={p.thumbnail_url} alt={p.title} className="w-14 h-10 rounded-lg object-cover shrink-0" />
              : (
                <div className="w-14 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#1a1a1a' }}>
                  <ShoppingBag className="w-4 h-4" style={{ color: '#444' }} />
                </div>
              )
            }

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-white truncate">{p.title}</p>
                {p.is_featured && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,169,2,0.15)', color: '#FFA902' }}>
                    <Star className="w-2.5 h-2.5" /> Destaque
                  </span>
                )}
                {p.badge_label && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>
                    <Tag className="w-2.5 h-2.5" /> {p.badge_label}
                  </span>
                )}
              </div>
              <p className="text-xs mt-0.5" style={{ color: '#555' }}>
                {TYPE_LABELS[p.product_type] ?? p.product_type}
                {' · '}
                {PAYMENT_LABELS[p.payment_type] ?? p.payment_type}
                {' · '}
                {p.is_published ? 'Publicado' : 'Rascunho'}
              </p>
            </div>

            <div className="text-right shrink-0">
              {p.price !== null ? (
                <div>
                  <p className="text-sm font-bold text-white">{formatBRL(p.price)}</p>
                  {p.original_price && (
                    <p className="text-xs line-through" style={{ color: '#555' }}>{formatBRL(p.original_price)}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs px-2 py-1 rounded-lg" style={{ background: '#1a1a1a', color: '#555' }}>Sem preço</p>
              )}
            </div>

            <ChevronRight className="w-4 h-4 shrink-0 opacity-30 group-hover:opacity-70 transition-opacity" style={{ color: '#888' }} />
          </Link>
        ))}

        {products.length === 0 && (
          <div className="text-center py-16 rounded-xl" style={{ background: '#111', border: '1px solid #1a1a1a' }}>
            <ShoppingBag className="w-8 h-8 mx-auto mb-3" style={{ color: '#333' }} />
            <p className="text-sm font-medium" style={{ color: '#555' }}>Nenhum produto cadastrado ainda.</p>
            <p className="text-xs mt-1" style={{ color: '#444' }}>Crie um produto em <Link href="/admin/cursos" className="underline" style={{ color: '#FFA902' }}>Cursos</Link> primeiro.</p>
          </div>
        )}
      </div>
    </div>
  )
}
