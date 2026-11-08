import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAdminProductById } from '@/lib/actions/admin-store'
import { ProductStoreForm } from '@/components/admin/ProductStoreForm'

const TYPE_LABELS: Record<string, string> = {
  course: 'Curso', ebook: 'E-book', bundle: 'Bundle', mentorship: 'Mentoria', event: 'Evento',
}

export default async function AdminLojaEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await getAdminProductById(id)
  if (!product) notFound()

  return (
    <div className="max-w-2xl space-y-6 pb-10">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/loja"
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
          style={{ background: '#1a1a1a', color: '#888' }}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white leading-tight">{product.title}</h1>
          <p className="text-xs" style={{ color: '#555' }}>
            {TYPE_LABELS[product.product_type] ?? product.product_type} · {product.slug}
          </p>
        </div>
      </div>

      <ProductStoreForm product={product} />
    </div>
  )
}
