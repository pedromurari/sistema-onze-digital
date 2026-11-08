import { IdmWordmark } from '@/components/layout/IdmWordmark'
import Image from 'next/image'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">

      {/* Esquerda — formulário */}
      <div className="flex flex-col items-center justify-center p-8 lg:p-16" style={{ background: '#f6f0e7' }}>
        {/* Logo — só mobile */}
        <div className="lg:hidden mb-10">
          <IdmWordmark size="lg" />
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </div>

      {/* Direita — painel de marca */}
      <div
        className="hidden lg:flex flex-col justify-between p-14 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0D1638 0%, #091028 60%, #060D2A 100%)' }}
      >
        {/* Grid pattern dourado */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `linear-gradient(rgba(255,184,0,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,184,0,1) 1px, transparent 1px)`,
          backgroundSize: '44px 44px',
        }} />
        {/* Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, #FFB800 0%, transparent 70%)' }} />

        {/* Logo */}
        <div className="relative">
          <IdmWordmark size="md" variant="white" />
        </div>

        {/* Central */}
        <div className="relative space-y-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(255,184,0,0.12)', border: '1px solid rgba(255,184,0,0.25)' }}>
            <Image src="/despertamente-simbolo-branco.png" alt="" width={28} height={28} className="object-contain opacity-70" />
          </div>
          <blockquote className="text-3xl font-bold text-white leading-snug font-display"
            style={{ maxWidth: '380px' }}>
            "Desperte o que já<br />existe dentro de você."
          </blockquote>
          <p className="text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)', maxWidth: '340px' }}>
            Uma jornada de autoconhecimento através da Psicanálise, Numerologia, PNL e Espiritualidade.
          </p>
          <div className="space-y-2.5 pt-1">
            {['Cursos com certificado de conclusão', 'Aulas ao vivo com especialistas', 'Comunidade de apoio e crescimento'].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(255,184,0,0.20)', border: '1px solid rgba(255,184,0,0.35)' }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#FFB800' }} />
                </div>
                <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.65)' }}>{item}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
          © {new Date().getFullYear()} Instituto Despertamente. Todos os direitos reservados.
        </p>
      </div>
    </div>
  )
}
