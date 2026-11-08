'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, PlayCircle, ArrowRight, Info, MessageCircle } from 'lucide-react'
import { CheckoutModal, useCheckoutModal } from '@/components/checkout/CheckoutModal'

// Grupo da turma atual (WhatsApp) — troca todo mês, junto com a virada de turma.
// Turma #06 (08/08/2026).
const GRUPO_WHATSAPP_TURMA_URL = 'https://chat.whatsapp.com/HsIblKWWBCzISDnkuEUYjC'

type Etapa = 'upsell' | 'downsell' | 'fim'

export function ObrigadoContent() {
  const [etapa, setEtapa] = useState<Etapa>('upsell')
  const checkout = useCheckoutModal()
  const [produtoAtivo, setProdutoAtivo] = useState<{ slug: string; titulo: string; valor: number } | null>(null)

  const abrirCheckout = (slug: string, titulo: string, valor: number) => {
    setProdutoAtivo({ slug, titulo, valor })
    checkout.abrir()
  }

  return (
    <div className="min-h-screen bg-[#0D1638] text-white px-6 py-14">
      {produtoAtivo && (
        <CheckoutModal
          open={checkout.open}
          onClose={checkout.fechar}
          produtoSlug={produtoAtivo.slug}
          titulo={produtoAtivo.titulo}
          valor={produtoAtivo.valor}
          onPago={() => setEtapa('fim')}
        />
      )}

      <div className="max-w-2xl mx-auto space-y-10">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-[#FFB800]/15 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-7 w-7 text-[#FFB800]" />
          </div>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-3xl font-bold">
            Vaga garantida no Cicatrizes que Curam!
          </h1>
          <p className="text-sm text-white/50 max-w-md mx-auto leading-relaxed">
            Enviamos a confirmação e o acesso à sua área de membros por e-mail e WhatsApp — é lá que
            ficam os conteúdos complementares e, assim que sua turma acontecer, a gravação completa do workshop.
          </p>
          <a
            href={GRUPO_WHATSAPP_TURMA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 px-5 py-2.5 text-sm font-semibold text-[#25D366] hover:bg-[#25D366]/15 transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            Entrar no grupo da sua turma
          </a>
        </div>

        {etapa === 'upsell' && (
          <div className="space-y-6">
            <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/30">
              <div className="aspect-video flex items-center justify-center bg-gradient-to-br from-[#111D48] to-[#0A1232]">
                <PlayCircle className="h-14 w-14 text-white/25" />
              </div>
              <div className="flex items-start gap-2.5 px-4 py-3 bg-white/[0.03] border-t border-white/5">
                <Info className="h-3.5 w-3.5 text-white/30 mt-0.5 shrink-0" />
                <p className="text-[11px] text-white/35 leading-relaxed">
                  Espaço reservado para o vídeo de apresentação da oferta abaixo. <strong className="text-white/50">Aviso a incluir na fala/legenda do vídeo:</strong> seu acesso à área de membros com os conteúdos complementares e a gravação do workshop já está garantido — essa oferta é um complemento opcional, não uma condição pra acessar o que você já comprou.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#FFB800]/25 bg-gradient-to-br from-[#FFB800]/8 to-transparent p-7 space-y-5">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-widest text-[#FFB800]/70 mb-2">Oferta exclusiva pra quem acabou de entrar</p>
                <h2 style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-2xl font-bold text-white">
                  Sessão individual com a Jocimara
                </h2>
                <p className="text-sm text-white/50 mt-2 leading-relaxed">
                  Leve o que você começou a elaborar no workshop pra um espaço só seu — uma sessão individual de
                  apresentação com a Jocimara, pra aprofundar o que fez mais sentido pra você.
                </p>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-sm text-white/30 line-through">R$ 199</span>
                <span style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-3xl font-bold text-[#FFC933]">R$ 100</span>
                <span className="text-xs text-white/35">só hoje</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => abrirCheckout('sessao-jocimara', 'Sessão com a Jocimara', 100)}
                  className="group flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#FFB800] px-6 py-3.5 text-sm font-bold text-[#0D1638] hover:bg-[#FFC933] transition-colors"
                >
                  Sim, quero minha sessão
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
                <button
                  onClick={() => setEtapa('downsell')}
                  className="text-sm text-white/35 hover:text-white/60 transition-colors px-4"
                >
                  Não, obrigada
                </button>
              </div>
            </div>
          </div>
        )}

        {etapa === 'downsell' && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 space-y-5">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-widest text-white/35 mb-2">Antes de você ir</p>
              <h2 style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-2xl font-bold text-white">
                Kit Cicatrizes que Curam
              </h2>
              <p className="text-sm text-white/50 mt-2 leading-relaxed">
                Uma áudio-aula e um guia em PDF pra continuar sozinha o processo que começou no workshop,
                no seu tempo — sem compromisso de agenda.
              </p>
            </div>
            <div className="flex items-baseline gap-3">
              <span style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-3xl font-bold text-[#FFC933]">R$ 27</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => abrirCheckout('kit-cicatrizes', 'Kit Cicatrizes que Curam', 27)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#FFB800] px-6 py-3.5 text-sm font-bold text-[#0D1638] hover:bg-[#FFC933] transition-colors"
              >
                Quero o Kit por R$ 27
              </button>
              <button onClick={() => setEtapa('fim')} className="text-sm text-white/35 hover:text-white/60 transition-colors px-4">
                Não, obrigada
              </button>
            </div>
          </div>
        )}

        {etapa === 'fim' && (
          <div className="text-center space-y-4">
            <p className="text-sm text-white/50">Tudo certo por aqui. Te vejo na sua turma!</p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm text-[#FFB800] hover:text-[#FFC933] transition-colors"
            >
              Acessar minha área de membros
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
