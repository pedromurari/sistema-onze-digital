'use client'

import Link from 'next/link'
import { CheckCircle2, ArrowRight, MessageCircle } from 'lucide-react'

// Grupo da turma atual (WhatsApp) — troca todo mês, junto com a virada de turma.
// Turma #06 (08/08/2026).
const GRUPO_WHATSAPP_TURMA_URL = 'https://chat.whatsapp.com/HsIblKWWBCzISDnkuEUYjC'

export function ObrigadoContent() {
  return (
    <div className="min-h-screen bg-[#0D1638] text-white px-6 py-14">
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
      </div>
    </div>
  )
}
