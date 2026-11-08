'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateProductStoreFields, type AdminProduct } from '@/lib/actions/admin-store'
import { Check, Loader2, Plus, X } from 'lucide-react'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold" style={{ color: '#aaa' }}>{label}</label>
      {children}
      {hint && <p className="text-[11px]" style={{ color: '#555' }}>{hint}</p>}
    </div>
  )
}

const inputCls = "w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-colors focus:ring-1"
const inputStyle = { background: '#0d0d0d', border: '1px solid #2a2a2a', ringColor: '#FFA902' }

export function ProductStoreForm({ product }: { product: AdminProduct }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [success, setSuccess] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [price, setPrice] = useState(product.price?.toString() ?? '')
  const [originalPrice, setOriginalPrice] = useState(product.original_price?.toString() ?? '')
  const [paymentType, setPaymentType] = useState(product.payment_type ?? 'one_time')
  const [checkoutUrl, setCheckoutUrl] = useState(product.checkout_url ?? '')
  const [ctaLabel, setCtaLabel] = useState(product.cta_label ?? '')
  const [badgeLabel, setBadgeLabel] = useState(product.badge_label ?? '')
  const [shortDescription, setShortDescription] = useState(product.short_description ?? '')
  const [isFeatured, setIsFeatured] = useState(product.is_featured)
  const [isPublished, setIsPublished] = useState(product.is_published)

  // highlights como array editável
  const [highlights, setHighlights] = useState<string[]>(product.highlights ?? [])
  const [newHighlight, setNewHighlight] = useState('')

  function addHighlight() {
    const h = newHighlight.trim()
    if (!h) return
    setHighlights(prev => [...prev, h])
    setNewHighlight('')
  }

  function removeHighlight(idx: number) {
    setHighlights(prev => prev.filter((_, i) => i !== idx))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addHighlight()
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setSuccess(false)

    startTransition(async () => {
      const result = await updateProductStoreFields(product.id, {
        price: price !== '' ? parseFloat(price) : null,
        original_price: originalPrice !== '' ? parseFloat(originalPrice) : null,
        payment_type: paymentType,
        checkout_url: checkoutUrl || null,
        cta_label: ctaLabel || null,
        badge_label: badgeLabel || null,
        short_description: shortDescription || null,
        highlights: highlights.length > 0 ? highlights : null,
        is_featured: isFeatured,
        is_published: isPublished,
      })
      if (result.error) {
        setErr(result.error)
      } else {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl pb-10">

      {/* Preços */}
      <section className="rounded-xl p-5 space-y-4" style={{ background: '#111', border: '1px solid #1a1a1a' }}>
        <h2 className="text-sm font-semibold text-white">Precificação</h2>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Preço (R$)" hint="Deixe em branco para produto gratuito/sem venda">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#555' }}>R$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0,00"
                className={inputCls}
                style={{ ...inputStyle, paddingLeft: '2rem' }}
              />
            </div>
          </Field>

          <Field label="Preço original (R$)" hint="Usado para mostrar desconto">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#555' }}>R$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={originalPrice}
                onChange={e => setOriginalPrice(e.target.value)}
                placeholder="0,00"
                className={inputCls}
                style={{ ...inputStyle, paddingLeft: '2rem' }}
              />
            </div>
          </Field>
        </div>

        <Field label="Tipo de pagamento">
          <select
            value={paymentType}
            onChange={e => setPaymentType(e.target.value)}
            className={inputCls}
            style={inputStyle}
          >
            <option value="one_time">Pagamento único</option>
            <option value="subscription">Assinatura recorrente</option>
            <option value="free">Gratuito</option>
          </select>
        </Field>
      </section>

      {/* Checkout */}
      <section className="rounded-xl p-5 space-y-4" style={{ background: '#111', border: '1px solid #1a1a1a' }}>
        <h2 className="text-sm font-semibold text-white">Checkout</h2>

        <Field label="URL de Checkout" hint="Link externo do Mercado Pago, Hotmart, Kiwify etc.">
          <input
            type="url"
            value={checkoutUrl}
            onChange={e => setCheckoutUrl(e.target.value)}
            placeholder="https://..."
            className={inputCls}
            style={inputStyle}
          />
        </Field>

        <Field label="Texto do botão CTA" hint="Ex: Quero me matricular, Comprar agora">
          <input
            type="text"
            value={ctaLabel}
            onChange={e => setCtaLabel(e.target.value)}
            placeholder="Comprar agora"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
      </section>

      {/* Marketing */}
      <section className="rounded-xl p-5 space-y-4" style={{ background: '#111', border: '1px solid #1a1a1a' }}>
        <h2 className="text-sm font-semibold text-white">Marketing</h2>

        <Field label="Badge" hint="Ex: Mais vendido, Novo, 50% OFF">
          <input
            type="text"
            value={badgeLabel}
            onChange={e => setBadgeLabel(e.target.value)}
            placeholder="Mais vendido"
            className={inputCls}
            style={inputStyle}
          />
        </Field>

        <Field label="Descrição curta" hint="Exibida no card da loja e upsell do dashboard">
          <textarea
            rows={3}
            value={shortDescription}
            onChange={e => setShortDescription(e.target.value)}
            placeholder="Uma linha que resume o valor do produto..."
            className={inputCls}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>

        <Field label="Destaques (bullet points)" hint="Benefícios exibidos no card de venda">
          <div className="space-y-2">
            {highlights.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex-1 text-sm px-3 py-2 rounded-xl" style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', color: '#ddd' }}>{h}</span>
                <button
                  type="button"
                  onClick={() => removeHighlight(i)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors hover:bg-red-950/40"
                  style={{ color: '#555' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newHighlight}
                onChange={e => setNewHighlight(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Adicionar destaque e pressionar Enter"
                className={inputCls}
                style={inputStyle}
              />
              <button
                type="button"
                onClick={addHighlight}
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                style={{ background: '#FFA902', color: '#0a0a0a' }}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </Field>
      </section>

      {/* Visibilidade */}
      <section className="rounded-xl p-5 space-y-3" style={{ background: '#111', border: '1px solid #1a1a1a' }}>
        <h2 className="text-sm font-semibold text-white">Visibilidade</h2>

        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setIsPublished(v => !v)}
            className="relative w-9 h-5 rounded-full transition-colors shrink-0"
            style={{ background: isPublished ? '#FFA902' : '#2a2a2a' }}
          >
            <span
              className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
              style={{ transform: isPublished ? 'translateX(16px)' : 'translateX(0)' }}
            />
          </div>
          <span className="text-sm text-white">Publicado</span>
          <span className="text-xs" style={{ color: '#555' }}>Produto visível na loja e dashboard</span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setIsFeatured(v => !v)}
            className="relative w-9 h-5 rounded-full transition-colors shrink-0"
            style={{ background: isFeatured ? '#FFA902' : '#2a2a2a' }}
          >
            <span
              className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
              style={{ transform: isFeatured ? 'translateX(16px)' : 'translateX(0)' }}
            />
          </div>
          <span className="text-sm text-white">Destaque</span>
          <span className="text-xs" style={{ color: '#555' }}>Aparece no banner do dashboard</span>
        </label>
      </section>

      {/* Erro */}
      {err && (
        <p className="text-sm px-4 py-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
          {err}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
        style={{ background: success ? '#22c55e' : '#FFA902', color: '#0a0a0a' }}
      >
        {isPending
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
          : success
            ? <><Check className="w-4 h-4" /> Salvo com sucesso!</>
            : 'Salvar alterações'
        }
      </button>
    </form>
  )
}
