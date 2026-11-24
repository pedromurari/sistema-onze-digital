import Link from 'next/link'
import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { postsPublicados, formatarData } from '@/content/blog'
import { BlogLista } from '@/components/blog/BlogLista'
import { CSS_POST } from '@/components/blog/PostVisual'

export const metadata = {
  title: 'Blog',
  description:
    'Psicanálise, PNL, terapia breve e numerologia aplicadas ao dia a dia. Textos do Instituto Despertamente.',
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'Blog do Instituto Despertamente',
    description: 'Psicanálise, PNL, terapia breve e numerologia aplicadas ao dia a dia.',
    url: '/blog',
    type: 'website',
  },
}

const TEMAS = ['Psicanálise', 'PNL', 'Terapia breve', 'Numerologia', 'Constelação familiar', 'Autoconhecimento']

// Faixa de temas passando ao fundo do topo. `!important`: o globals.css zera
// animação quando o sistema pede menos movimento (mesma decisão do letreiro).
const CSS_BLOG = `
.blog-temas { overflow: hidden; white-space: nowrap; font-family: var(--fds-serif); font-size: clamp(3rem, 8vw, 6.5rem); font-weight: 600; color: rgba(255,255,255,.035); line-height: 1; }
.blog-temas-trilho { display: flex; width: max-content; animation: blog-temas 70s linear infinite !important; animation-duration: 70s !important; animation-iteration-count: infinite !important; }
.blog-temas-bloco { flex-shrink: 0; padding-right: .4em; }
@keyframes blog-temas { from { transform: translateX(0) } to { transform: translateX(-50%) } }
`

export default function BlogPage() {
  const posts = postsPublicados()

  return (
    <div className="min-h-screen overflow-x-hidden">
      <NavbarComecar />
      <WhatsAppButton />
      <CookieBanner />

      <style>{CSS_POST + CSS_BLOG}</style>
      <div className="fds">
        {/* ── TOPO ────────────────────────────────────────────── */}
        <section className="fds-band--deep relative overflow-hidden" style={{ paddingTop: 'calc(var(--fds-30) + 8px)', paddingBottom: 'calc(var(--fds-16) + clamp(70px, 9vw, 120px))' }}>
          {/* Temas passando ao fundo, bem apagados, e um brilho dourado. */}
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(700px 360px at 85% 20%, rgba(255,184,0,.10), transparent 70%)' }} />
          <div aria-hidden className="blog-temas pointer-events-none absolute left-0 right-0" style={{ bottom: 18 }}>
            <div className="blog-temas-trilho">
              {[0, 1].map(k => (
                <span key={k} className="blog-temas-bloco">
                  {TEMAS.map(t => <span key={t}>{t} <span style={{ color: 'rgba(255,184,0,.12)' }}>✦</span> </span>)}
                </span>
              ))}
            </div>
          </div>

          <div className="fds-wrap relative">
            <p className="fds-eyebrow block">Blog do Instituto Despertamente</p>
            <h1 className="fds-display mt-4 max-w-4xl">
              Leituras pra entender a <span className="fds-accent">mente que decide</span> por você.
            </h1>
            <p className="fds-lead mt-6 max-w-2xl">
              Psicanálise, PNL, terapia breve e numerologia aplicadas ao que acontece fora do consultório:
              nos relacionamentos, no trabalho, na família e nas escolhas de todo dia.
            </p>
            <div className="mt-10 flex flex-wrap gap-x-12 gap-y-6" style={{ borderTop: '1px solid var(--fds-line)', paddingTop: 'var(--fds-6)' }}>
              <div><p className="fds-h3" style={{ fontSize: '2rem' }}>{posts.length}</p><p className="fds-meta mt-1">Textos publicados</p></div>
              <div><p className="fds-h3" style={{ fontSize: '2rem' }}>{new Set(posts.map(p => p.categoria)).size}</p><p className="fds-meta mt-1">Temas</p></div>
              <div><p className="fds-h3" style={{ fontSize: '2rem' }}>{posts.reduce((t, p) => t + p.leitura, 0)} min</p><p className="fds-meta mt-1">De leitura</p></div>
            </div>
          </div>
        </section>

        <section className="fds-section">
          <div className="fds-wrap">
            {posts.length === 0 ? (
              // Estado honesto: melhor dizer que ainda não tem artigo do que
              // encher a página com card que não leva a lugar nenhum.
              <div className="fds-card" style={{ padding: 'var(--fds-12)' }}>
                <p className="fds-eyebrow">Em breve</p>
                <h2 className="fds-h3 mt-3">Os primeiros textos estão sendo escritos.</h2>
                <p className="fds-body mt-4">
                  Enquanto isso, o conteúdo do Instituto está nas formações e nos encontros ao vivo.
                </p>
                <Link href="/#programas" className="fds-btn fds-btn--primary mt-7">
                  Ver os programas
                </Link>
              </div>
            ) : (
              <BlogLista
                posts={posts.map(p => ({
                  slug: p.slug, titulo: p.titulo, categoria: p.categoria, resumo: p.resumo,
                  data: p.data, dataFmt: formatarData(p.data), leitura: p.leitura, capa: p.capa,
                }))}
              />
            )}
          </div>
        </section>

        {/* ── FECHAMENTO ──────────────────────────────────────── */}
        <section className="fds-band--deep" style={{ paddingBlock: 'var(--fds-24)' }}>
          <div className="fds-wrap flex flex-wrap items-end justify-between gap-8">
            <div className="max-w-2xl">
              <h2 className="fds-h2">Gostou de ler? <span className="fds-accent">Vá além do texto.</span></h2>
              <p className="fds-body mt-5">
                Os textos são a porta de entrada. As formações do Instituto são o percurso completo, com prática e certificação.
              </p>
            </div>
            <Link href="/#programas" className="fds-btn fds-btn--primary">Ver os programas</Link>
          </div>
        </section>
      </div>

      <SiteFooter />
    </div>
  )
}
