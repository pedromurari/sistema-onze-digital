import Image from 'next/image'
import { Check, BookOpen, Users, Calendar, Package, Star } from 'lucide-react'
import { BuyButton } from './BuyButton'
import type { StoreProduct } from '@/lib/actions/store'

const typeIcon: Record<string, React.ReactNode> = {
  course:     <BookOpen className="h-3.5 w-3.5" />,
  ebook:      <BookOpen className="h-3.5 w-3.5" />,
  bundle:     <Package className="h-3.5 w-3.5" />,
  mentorship: <Users className="h-3.5 w-3.5" />,
  event:      <Calendar className="h-3.5 w-3.5" />,
}

const typeLabel: Record<string, string> = {
  course:     'Curso',
  ebook:      'E-book',
  bundle:     'Bundle',
  mentorship: 'Mentoria',
  event:      'Evento',
}

function formatPrice(price: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)
}

interface ProductCardProps {
  product: StoreProduct
  compact?: boolean
}

export function ProductCard({ product, compact = false }: ProductCardProps) {
  const hasDiscount = product.original_price && product.original_price > (product.price ?? 0)

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0A1232] shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_0_30px_rgba(255,184,0,0.15)] hover:border-[#FFB800]/40 w-full">

      {/* Badge */}
      {product.badge_label && (
        <span className="absolute top-3 left-3 z-10 rounded-full bg-[#FFB800] px-2.5 py-0.5 text-[10px] font-bold text-[#0D1638] uppercase tracking-widest">
          {product.badge_label}
        </span>
      )}

      {/* Thumbnail */}
      <div className={`relative w-full overflow-hidden bg-[#091028] ${compact ? 'h-36' : 'h-52'}`}>
        {product.thumbnail_url ? (
          <Image
            src={product.thumbnail_url}
            alt={product.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#0A1232] to-[#0F1940]">
            <span className="font-display text-3xl font-bold text-[#FFB800]/20">IDM</span>
          </div>
        )}
        {/* Gradiente de leitura */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A1232]/90 via-[#0A1232]/20 to-transparent" />

        {/* Tipo de produto */}
        <div className="absolute bottom-2.5 left-3 flex items-center gap-1.5 rounded-full bg-[#0D1638]/70 px-2.5 py-1 text-xs text-[#FFB800] backdrop-blur-sm border border-[#FFB800]/20">
          {typeIcon[product.product_type]}
          <span className="font-medium">{typeLabel[product.product_type]}</span>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex flex-1 flex-col gap-4 p-5">

        {/* Título + descrição */}
        <div>
          <h3 className={`font-bold text-white leading-snug group-hover:text-[#FFC933] transition-colors duration-200 ${compact ? 'text-base' : 'text-lg'}`}>
            {product.title}
          </h3>
          {!compact && product.short_description && (
            <p className="mt-1.5 text-sm text-white/40 line-clamp-2 leading-relaxed">
              {product.short_description}
            </p>
          )}
        </div>

        {/* Highlights */}
        {!compact && product.highlights && product.highlights.length > 0 && (
          <ul className="space-y-1.5">
            {product.highlights.slice(0, 3).map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-white/60">
                <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#FFB800]" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Avaliação fictícia (estrelas) */}
        {!compact && (
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-3 w-3 fill-[#FFB800] text-[#FFB800]" />
            ))}
            <span className="ml-1 text-xs text-white/30">5.0</span>
          </div>
        )}

        {/* Separador */}
        <div className="mt-auto pt-4 border-t border-white/[0.08] space-y-3">
          {/* Preço */}
          <div className="flex items-end gap-2">
            {hasDiscount && (
              <span className="text-xs text-white/30 line-through">
                {formatPrice(product.original_price!)}
              </span>
            )}
            <span className="text-2xl font-bold text-[#FFB800]">
              {formatPrice(product.price!)}
            </span>
            {product.payment_type === 'subscription' && (
              <span className="text-xs text-white/30 mb-0.5">/mês</span>
            )}
          </div>

          {/* CTA */}
          <BuyButton
            productId={product.id}
            label={product.cta_label ?? 'Quero agora'}
            checkoutUrl={product.checkout_url}
            variant="solid"
            className="w-full justify-center"
          />
        </div>
      </div>
    </div>
  )
}
