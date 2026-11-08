import Link from 'next/link'
import { CheckCircle2, ArrowRight, MessageCircle } from 'lucide-react'

const WA_URL = 'https://wa.me/5511919434040?text=Ol%C3%A1!%20Acabei%20de%20entrar%20na%20lista%20de%20espera%20do%20programa%20da%20Renata.'

export function ObrigadoContent() {
  return (
    <div className="min-h-screen bg-[#0D1638] text-white px-6 py-14">
      <div className="max-w-2xl mx-auto space-y-8 text-center">
        <div className="w-14 h-14 rounded-full bg-[#FFB800]/15 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-7 w-7 text-[#FFB800]" />
        </div>
        <div className="space-y-3">
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-3xl font-bold">
            Você está na lista de espera!
          </h1>
          <p className="text-sm text-white/50 max-w-md mx-auto leading-relaxed">
            Enviamos a confirmação por e-mail e WhatsApp. Assim que o programa da Renata abrir, você é
            avisada em primeira mão, com condição especial de lançamento.
          </p>
        </div>

        <a
          href={WA_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 px-5 py-2.5 text-sm font-semibold text-[#25D366] hover:bg-[#25D366]/15 transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          Falar com a gente no WhatsApp
        </a>

        <p className="text-sm text-white/50 pt-4">
          Enquanto isso, a Renata publica conteúdo novo toda semana sobre dependência química e psicanálise —
          segue o Instituto Despertamente e o perfil dela pra acompanhar.
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-[#FFB800] hover:text-[#FFC933] transition-colors"
        >
          Voltar ao site
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
