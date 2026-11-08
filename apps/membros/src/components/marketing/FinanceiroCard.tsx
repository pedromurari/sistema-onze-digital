import { Wallet, CheckCircle2, Clock, AlertTriangle, ExternalLink } from 'lucide-react'
import { CopiarPix } from './CopiarPix'
import type { FinanceiroNps, StatusMensalidade } from '@/lib/financeiro-nps'

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const dataBr = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00-03:00`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const mesAno = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00-03:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })

const STATUS: Record<StatusMensalidade, { rotulo: (dias: number) => string; cor: string; icone: typeof Clock }> = {
  em_dia:     { rotulo: d => `Vence em ${d} dias`, cor: '#FFB800', icone: Clock },
  a_vencer:   { rotulo: d => (d === 1 ? 'Vence amanhã' : `Vence em ${d} dias`), cor: '#FFB800', icone: Clock },
  vence_hoje: { rotulo: () => 'Vence hoje', cor: '#f59e0b', icone: AlertTriangle },
  atrasada:   { rotulo: d => `Atrasada há ${Math.abs(d)} ${Math.abs(d) === 1 ? 'dia' : 'dias'}`, cor: '#ef4444', icone: AlertTriangle },
}

export function FinanceiroCard({ dados, acessoAte }: { dados: FinanceiroNps | null; acessoAte?: string | null }) {
  const proxima = dados?.proxima ?? null
  const historico = dados?.historico ?? []

  return (
    <div
      className="w-full rounded-2xl p-5 space-y-5"
      style={{
        background: 'linear-gradient(160deg, rgba(255,184,0,0.05), rgba(10,18,50,0) 65%), #0A1232',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {!proxima ? (
        <div className="flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)' }}
          >
            <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white">Nenhuma mensalidade em aberto</p>
            <p className="text-sm text-white/50">
              {acessoAte ? `Seu acesso está garantido até ${acessoAte}.` : 'Quando houver uma cobrança, ela aparece aqui com o link e o Pix.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {(() => {
            const st = STATUS[proxima.status]
            const Icone = st.icone
            return (
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${st.cor}1a`, border: `1px solid ${st.cor}40` }}
                  >
                    <Icone className="w-4 h-4" style={{ color: st.cor }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: st.cor }}>
                      {st.rotulo(proxima.diasParaVencer)}
                    </p>
                    <p className="font-semibold text-white">Mensalidade de {mesAno(proxima.vencimento)}</p>
                    <p className="text-sm text-white/50">Vencimento em {dataBr(proxima.vencimento)}</p>
                  </div>
                </div>
                <p className="text-2xl font-bold text-[#FFB800] shrink-0">{brl(proxima.valor)}</p>
              </div>
            )
          })()}

          {proxima.pixCopiaECola && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-xs font-bold uppercase tracking-wider text-white/45">Pagar com Pix</p>
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                {proxima.pixQrCodeBase64 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:image/png;base64,${proxima.pixQrCodeBase64}`}
                    alt="QR Code Pix"
                    width={132}
                    height={132}
                    className="rounded-lg bg-white p-1.5 shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-3">
                  <p className="text-[11px] leading-relaxed text-white/45 break-all font-mono max-h-[4.5rem] overflow-hidden">
                    {proxima.pixCopiaECola}
                  </p>
                  <CopiarPix codigo={proxima.pixCopiaECola} />
                </div>
              </div>
            </div>
          )}

          {proxima.linkPagamento && (
            <a
              href={proxima.linkPagamento}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-[#0D1638] bg-[#FFB800] hover:bg-[#FFC933] transition-colors"
            >
              Pagar agora (Pix, boleto ou cartão) <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </>
      )}

      {historico.length > 0 && (
        <div className="pt-4 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">Mensalidades pagas</p>
          <ul className="space-y-1.5">
            {historico.map(h => (
              <li key={h.referencia} className="flex items-center justify-between text-sm">
                <span className="text-white/60 inline-block first-letter:uppercase">{mesAno(h.referencia)}</span>
                <span className="flex items-center gap-2 text-white/50">
                  {brl(h.valor)}
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#22c55e]" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function FinanceiroTitulo() {
  return (
    <div className="flex items-center gap-3">
      <Wallet className="w-4 h-4 text-[#FFB800]" />
      <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Financeiro</span>
    </div>
  )
}
