import Image from 'next/image'
import Link from 'next/link'

const WA_URL = 'https://wa.me/5511919434040'

const COL_PLATAFORMA = [
  { href: '/login', label: 'Login' },
  { href: '/register', label: 'Criar conta gratuita' },
  { href: '/cursos', label: 'Meus cursos' },
  { href: '/loja', label: 'Programas' },
]

// Ancoras (#) sempre prefixadas com /comecar -- o rodape aparece em varias
// paginas, e essas secoes so existem la.
const COL_CONTEUDO = [
  { href: '/comecar#metodologia', label: 'Nossa metodologia' },
  { href: '/comecar#jornadas', label: 'Jornadas' },
  { href: '/certificado', label: 'Certificações' },
  { href: '/comecar#depoimentos', label: 'Depoimentos' },
]

const COL_LEGAL = [
  { href: '/privacidade', label: 'Política de Privacidade' },
  { href: '/termos', label: 'Termos de Uso' },
  { href: WA_URL, label: 'Contato' },
]

function FooterColumn({ title, items }: { title: string; items: { href: string; label: string }[] }) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <p className="text-xs font-bold uppercase tracking-widest text-white/45">{title}</p>
      <ul className="space-y-2 sm:space-y-2.5">
        {items.map(({ href, label }) => (
          <li key={href}>
            <Link
              href={href}
              target={href.startsWith('http') ? '_blank' : undefined}
              rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="text-[13px] text-white/60 hover:text-white transition-colors"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Rodapé padrão do site. Quando `parceira` é informado (produtos feitos em
 * parceria, ex: Cicatrizes que Curam com a Jocimara), mostra o "× nome da
 * parceira" ao lado da marca, igual ao lockup usado nos banners desses produtos.
 */
export function SiteFooter({ parceira }: { parceira?: string } = {}) {
  return (
    <footer className="border-t border-white/8 bg-[#09122C]">
      <div className="max-w-5xl mx-auto px-6 sm:px-10 py-8 sm:py-14">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-6 sm:gap-10">
          {/* Col 1 — Brand */}
          <div className="space-y-3 sm:space-y-4 col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Image src="/despertamente-simbolo-branco.png" alt="IDM" width={26} height={26} className="object-contain opacity-90" />
              <span style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-sm font-bold text-[#f0f0f0]">
                Instituto <span className="text-[#FFB800]">Despertamente</span>
              </span>
              {parceira && (
                <>
                  <span className="text-white/40 text-sm">×</span>
                  <span className="text-sm font-semibold text-white/80">{parceira}</span>
                </>
              )}
            </div>
            <p className="text-[13px] text-white/45 leading-relaxed max-w-[200px]">
              Transformação humana baseada em neurociência, psicanálise e PNL.
            </p>
            <div className="flex gap-3">
              <a
                href="https://instagram.com/institutodespertamente"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="h-8 w-8 rounded-lg border border-white/10 flex items-center justify-center text-white/45 hover:text-[#f0f0f0] hover:border-white/25 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
              </a>
              <a
                href={WA_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="h-8 w-8 rounded-lg border border-white/10 flex items-center justify-center text-white/45 hover:text-[#25D366] hover:border-[#25D366]/30 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </a>
            </div>
          </div>

          <FooterColumn title="Plataforma" items={COL_PLATAFORMA} />
          <FooterColumn title="Conteúdo" items={COL_CONTEUDO} />
          <FooterColumn title="Legal" items={COL_LEGAL} />
        </div>

        <div className="mt-6 sm:mt-12 pt-4 sm:pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3">
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} Instituto Despertamente · Todos os direitos reservados
          </p>
          <p className="text-xs text-white/40">
            Feito no Brasil 🇧🇷 · LGPD compliant
          </p>
        </div>
        <p className="mt-3 text-center text-xs text-white/30">
          Desenvolvido com carinho pela{' '}
          <a
            href="https://www.onzedigitalstrategy.com.br/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/45 hover:text-white/70 transition-colors"
          >
            Onze Digital Strategy
          </a>
          {' '}· Grupo DespertaMENTE
        </p>
      </div>
    </footer>
  )
}
