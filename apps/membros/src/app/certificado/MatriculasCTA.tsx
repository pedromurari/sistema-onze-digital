import { GraduationCap } from 'lucide-react'
import { WA_URL, WhatsAppIcon } from './whatsapp'

export function MatriculasCTA() {
  return (
    <div
      className="rounded-3xl p-6 sm:p-7 space-y-4"
      style={{
        background: 'linear-gradient(135deg, rgba(255,184,0,0.1), rgba(255,184,0,0.03))',
        border: '1px solid rgba(255,184,0,0.25)',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(255,184,0,0.15)' }}
        >
          <GraduationCap className="w-4.5 h-4.5" style={{ color: '#FFB800' }} />
        </span>
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#FFB800' }}>
          Matrículas abertas
        </p>
      </div>

      <div className="space-y-1.5">
        <h3 className="text-lg font-bold text-white">
          Formação em Psicanálise
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Continue sua jornada e se aprofunde na Psicanálise Prática. Mensalidades de{' '}
          <strong className="text-white">R$ 150,00 no boleto</strong>.
        </p>
      </div>

      <a
        href={WA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full h-[52px] rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98]"
        style={{ background: '#25D366', boxShadow: '0 8px 24px rgba(37,211,102,0.25)' }}
      >
        <WhatsAppIcon />
        Falar no WhatsApp
      </a>
    </div>
  )
}
