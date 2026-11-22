import Link from 'next/link'
import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { postsPublicados, formatarData } from '@/content/blog'

export const metadata = {
  title: 'Blog',
  description:
    'Psicanálise, PNL e neurociência aplicadas ao dia a dia. Textos do Instituto Despertamente.',
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'Blog do Instituto Despertamente',
    description: 'Psicanálise, PNL e neurociência aplicadas ao dia a dia.',
    url: '/blog',
    type: 'website',
  },
}

export default function BlogPage() {
  const posts = postsPublicados()

  return (
    <div className="min-h-screen overflow-x-hidden">
      <NavbarComecar />
      <WhatsAppButton />
      <CookieBanner />

      <div className="fds">
        <section className="fds-band--deep" style={{ paddingTop: 'var(--fds-30)', paddingBottom: 'var(--fds-24)' }}>
          <div className="fds-wrap">
            <p className="fds-eyebrow block">Instituto Despertamente</p>
            <h1 className="fds-display mt-4 max-w-3xl">
              Blog<span className="fds-accent">.</span>
            </h1>
            <p className="fds-lead mt-5">
              Psicanálise, PNL e neurociência aplicadas ao que acontece fora do consultório.
            </p>
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
              <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3" style={{ background: 'var(--fds-line)' }}>
                {posts.map(post => (
                  <Link
                    key={post.slug}
                    href={`/blog/${post.slug}`}
                    className="group block h-full"
                    style={{ background: 'var(--fds-bg)', padding: 'var(--fds-8)' }}
                  >
                    <p className="fds-eyebrow">{post.categoria}</p>
                    <h2
                      className="fds-h3 mt-3 transition-colors"
                      style={{ fontSize: '1.25rem' }}
                    >
                      {post.titulo}
                    </h2>
                    <p className="fds-small mt-4">{post.resumo}</p>
                    <p className="fds-meta mt-6">
                      <time dateTime={post.data}>{formatarData(post.data)}</time>
                      {' · '}
                      {post.leitura} min de leitura
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <SiteFooter />
    </div>
  )
}
