import Link from 'next/link'
import { getAllPartners } from '@/lib/actions/parceiras'
import { Link2, ChevronRight, Plus, Eye, EyeOff } from 'lucide-react'

export default async function ParceirasPage() {
  const partners = await getAllPartners()

  return (
    <div className="max-w-5xl space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Parceiras</h1>
          <p className="text-sm mt-1" style={{ color: '#888' }}>
            Páginas de links das parceiras do Instituto Despertamente.
          </p>
        </div>
        <Link
          href="/parceiras/nova"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
          style={{ background: '#FFA902', color: '#0a0a0a' }}
        >
          <Plus className="w-4 h-4" /> Nova parceira
        </Link>
      </div>

      <div className="space-y-2">
        {partners.map((partner) => (
          <Link
            key={partner.id}
            href={`/${partner.slug}-admin`}
            className="flex items-center gap-4 px-5 py-4 rounded-xl transition-colors group"
            style={{ background: '#111', border: '1px solid #1a1a1a' }}
          >
            <div
              className="w-10 h-10 rounded-full shrink-0"
              style={{
                background: partner.theme
                  ? `linear-gradient(135deg, ${partner.theme.primary_color}, ${partner.theme.secondary_color})`
                  : '#1a1a1a',
              }}
            />

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{partner.name}</p>
              <p className="text-xs mt-0.5" style={{ color: '#555' }}>/{partner.slug}</p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {partner.status === 'published' ? (
                <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
                  <Eye className="w-3 h-3" /> Publicada
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: '#1a1a1a', color: '#555' }}>
                  <EyeOff className="w-3 h-3" /> Rascunho
                </span>
              )}
              <ChevronRight className="w-4 h-4 opacity-30 group-hover:opacity-70 transition-opacity" style={{ color: '#888' }} />
            </div>
          </Link>
        ))}

        {partners.length === 0 && (
          <div className="text-center py-16 rounded-xl" style={{ background: '#111', border: '1px solid #1a1a1a' }}>
            <Link2 className="w-8 h-8 mx-auto mb-3" style={{ color: '#333' }} />
            <p className="text-sm font-medium" style={{ color: '#555' }}>Nenhuma parceira cadastrada ainda.</p>
            <Link href="/parceiras/nova" className="inline-block mt-3 text-xs underline" style={{ color: '#FFA902' }}>
              Criar a primeira parceira
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
