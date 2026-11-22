import Link from 'next/link'
import { notFound } from 'next/navigation'
import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { BLOG_POSTS, buscarPost, formatarData } from '@/content/blog'
import { jsonLdPost, ORG, scriptJsonLd } from '@/lib/seo'

export function generateStaticParams() {
  return BLOG_POSTS.filter(p => p.publicado).map(p => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = buscarPost(slug)
  if (!post) return { title: 'Post não encontrado' }
  return {
    title: post.titulo,
    description: post.resumo,
    // Canonical por post: sem isso qualquer parâmetro de campanha (?utm_)
    // vira URL concorrente da mesma página aos olhos do Google.
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.titulo,
      description: post.resumo,
      type: 'article',
      url: `/blog/${post.slug}`,
      publishedTime: post.data,
      modifiedTime: post.data,
      authors: [post.autor],
      section: post.categoria,
    },
    twitter: { card: 'summary_large_image', title: post.titulo, description: post.resumo },
    other: { 'article:published_time': post.data },
  }
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = buscarPost(slug)
  if (!post) notFound()

  return (
    <div className="min-h-screen overflow-x-hidden">
      <NavbarComecar />
      <WhatsAppButton />
      <CookieBanner />

      {/* BlogPosting: é o schema que faz o post virar fonte citável --
          dá autor, data e seção pro Google e pros buscadores de IA. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={scriptJsonLd(
          jsonLdPost({
            titulo: post.titulo,
            resumo: post.resumo,
            slug: post.slug,
            data: post.data,
            autor: post.autor || ORG.nome,
            categoria: post.categoria,
          }),
        )}
      />

      <div className="fds">
        <article>
          <header className="fds-band--deep" style={{ paddingTop: 'var(--fds-30)', paddingBottom: 'var(--fds-16)' }}>
            <div className="fds-wrap" style={{ maxWidth: 760 }}>
              <Link href="/blog" className="fds-meta">← Blog</Link>
              <p className="fds-eyebrow mt-6 block">{post.categoria}</p>
              <h1 className="fds-h1 mt-4">{post.titulo}</h1>
              <p className="fds-meta mt-6">
                {post.autor}
                {' · '}
                <time dateTime={post.data}>{formatarData(post.data)}</time>
                {' · '}
                {post.leitura} min de leitura
              </p>
            </div>
          </header>

          <div className="fds-section">
            <div className="fds-wrap" style={{ maxWidth: 680 }}>
              {post.corpo.map((bloco, i) =>
                bloco.startsWith('## ') ? (
                  <h2 key={i} className="fds-h3" style={{ marginTop: 'var(--fds-12)' }}>
                    {bloco.slice(3)}
                  </h2>
                ) : (
                  <p key={i} className="fds-body" style={{ marginTop: 'var(--fds-6)', maxWidth: 'none' }}>
                    {bloco}
                  </p>
                ),
              )}
            </div>
          </div>

          <section className="fds-band--deep" style={{ paddingBlock: 'var(--fds-24)' }}>
            <div className="fds-wrap" style={{ maxWidth: 760 }}>
              <h2 className="fds-h2">
                Quer ir <span className="fds-accent">mais fundo?</span>
              </h2>
              <p className="fds-body mt-5">
                O que você leu aqui é introdução. As formações do Instituto são o percurso completo,
                com prática supervisionada e certificação.
              </p>
              <Link href="/#programas" className="fds-btn fds-btn--primary mt-7">
                Ver os programas
              </Link>
            </div>
          </section>
        </article>
      </div>

      <SiteFooter />
    </div>
  )
}
