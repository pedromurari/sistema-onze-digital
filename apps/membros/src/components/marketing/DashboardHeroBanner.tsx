import Image from 'next/image'
import { Sparkles, ArrowRight } from 'lucide-react'
import { BuyButton } from './BuyButton'
import type { StoreProduct } from '@/lib/actions/store'

interface DashboardHeroBannerProps {
  product: StoreProduct
}

function formatPrice(price: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)
}

export function DashboardHeroBanner({ product }: DashboardHeroBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#FFB800]/30 bg-gradient-to-br from-[#0A1232] via-[#0F1940] to-[#0A1232] shadow-lg">
      {/* Imagem de fundo */}
      {product.thumbnail_url && (
        <div className="absolute inset-0 opacity-15">
          <Image
            src={product.thumbnail_url}
            alt=""
            fill
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0A1232] via-[#0A1232]/70 to-transparent" />
        </div>
      )}

      {/* Decoração dourada */}
      <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-[#FFB800]/10 blur-3xl" />
      <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-[#FFB800]/5 blur-2xl" />

      <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 max-w-lg">
          {/* Badge exclusivo */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-[#FFB800]/40 bg-[#FFB800]/10 px-3 py-1 text-xs font-semibold text-[#FFB800]">
              <Sparkles className="h-3 w-3" />
              Oferta exclusiva para alunos
            </span>
          </div>

          {/* Título */}
          <h2 className="font-fraunces text-xl font-bold text-white sm:text-2xl leading-tight">
            {product.title}
          </h2>

          {/* Descrição curta */}
          {product.short_description && (
            <p className="text-sm text-white/60 leading-relaxed">
              {product.short_description}
            </p>
          )}

          {/* Preço */}
          {product.price && (
            <div className="flex items-end gap-2">
              {product.original_price && product.original_price > product.price && (
                <span className="text-sm text-white/40 line-through">
                  {formatPrice(product.original_price)}
                </span>
              )}
              <span className="text-2xl font-bold text-[#FFB800]">
                {formatPrice(product.price)}
              </span>
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-2 sm:items-end">
          <BuyButton
            productId={product.id}
            label={product.cta_label ?? 'Quero agora'}
            checkoutUrl={product.checkout_url}
            variant="solid"
          />
          <a
            href="/loja"
            className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Ver todos os produtos <ArrowRight className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  )
}
