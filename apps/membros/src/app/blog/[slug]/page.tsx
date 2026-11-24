import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { CSS_POST, Diagrama, ProgressoLeitura, Revela } from '@/components/blog/PostVisual'
import { BLOG_POSTS, ancora, buscarPost, formatarData, postsPublicados, type Bloco } from '@/content/blog'
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
      ...(post.capa ? { images: [post.capa] } : {}),
    },
    twitter: { card: 'summary_large_image', title: post.titulo, description: post.resumo },
    other: { 'article:published_time': post.data },
  }
}

function BlocoPost({ bloco }: { bloco: Bloco }) {
  if (typeof bloco === 'string') {
    if (bloco.startsWith('## ')) {
      const titulo = bloco.slice(3)
      return (
        <Revela>
          <h2 id={ancora(titulo)} className="fds-h3" style={{ marginTop: 'var(--fds-16)', scrollMarginTop: 100 }}>
            {titulo}
          </h2>
        </Revela>
      )
    }
    return (
      <p className="fds-body" style={{ marginTop: 'var(--fds-6)', maxWidth: 'none', fontSize: '1.0625rem', lineHeight: 1.8 }}>
        {bloco}
      </p>
    )
  }

  switch (bloco.tipo) {
    case 'destaque':
      return (
        <Revela>
          <blockquote
            style={{ marginTop: 'var(--fds-12)', marginBottom: 'var(--fds-4)', paddingLeft: 'var(--fds-6)', borderLeft: '3px solid var(--fds-accent)' }}
          >
            <p style={{ fontFamily: 'var(--fds-serif)', fontSize: 'clamp(1.5rem, 3vw, 2rem)', lineHeight: 1.3, color: 'var(--fds-ink)' }}>
              {bloco.texto}
            </p>
          </blockquote>
        </Revela>
      )
    case 'imagem':
      return (
        <Revela>
          <figure style={{ marginTop: 'var(--fds-12)' }}>
            <div className="overflow-hidden" style={{ borderRadius: 10, border: '1px solid var(--fds-line)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bloco.src} alt={bloco.legenda} loading="lazy" className="block w-full transition-transform duration-700 hover:scale-[1.03]" style={{ aspectRatio: '16 / 10', objectFit: 'cover' }} />
            </div>
            <figcaption className="fds-small mt-3">{bloco.legenda}</figcaption>
          </figure>
        </Revela>
      )
    case 'diagrama':
      return (
        <Revela>
          <Diagrama nome={bloco.nome} legenda={bloco.legenda} />
        </Revela>
      )
    case 'cards':
      return (
        <div className={`mt-8 grid gap-4 ${bloco.itens.length === 4 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
          {bloco.itens.map((c, i) => (
            <Revela key={c.titulo} atraso={i * 110}>
              <div className="fds-card post-card h-full" style={{ padding: 'var(--fds-6)' }}>
                <p className="fds-meta" style={{ color: 'var(--fds-accent)' }}>{String(i + 1).padStart(2, '0')}</p>
                <p className="mt-3" style={{ fontFamily: 'var(--fds-serif)', fontSize: '1.2rem', fontWeight: 600, color: 'var(--fds-ink)' }}>{c.titulo}</p>
                <p className="fds-small mt-2" style={{ color: 'var(--fds-ink-2)' }}>{c.texto}</p>
              </div>
            </Revela>
          ))}
        </div>
      )
    case 'pratica':
      return (
        <Revela>
          <div
            className="fds-card"
            style={{ marginTop: 'var(--fds-12)', padding: 'var(--fds-8)', borderColor: 'rgba(255,184,0,.35)', background: 'linear-gradient(160deg, rgba(255,184,0,.07), rgba(255,255,255,.01) 55%)' }}
          >
            <p className="fds-eyebrow">Na prática</p>
            <p className="fds-h3 mt-3" style={{ fontSize: '1.5rem' }}>{bloco.titulo}</p>
            <ol className="mt-6 space-y-4">
              {bloco.passos.map((passo, i) => (
                <li key={i} className="flex gap-4">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    style={{ background: 'var(--fds-accent)', color: 'var(--fds-accent-ink)', fontSize: 13, fontWeight: 700 }}
                  >
                    {i + 1}
                  </span>
                  <span className="fds-body" style={{ maxWidth: 'none', paddingTop: 2 }}>{passo}</span>
                </li>
              ))}
            </ol>
          </div>
        </Revela>
      )
    case 'pergunta':
      return (
        <Revela>
          <div className="text-center" style={{ marginTop: 'var(--fds-16)', padding: 'var(--fds-12) var(--fds-6)', borderBlock: '1px solid var(--fds-line)' }}>
            <p className="fds-eyebrow">Pra levar com você</p>
            <p className="mt-4" style={{ fontFamily: 'var(--fds-serif)', fontSize: 'clamp(1.6rem, 3.4vw, 2.25rem)', lineHeight: 1.25, color: 'var(--fds-ink)' }}>
              {bloco.texto}
            </p>
          </div>
        </Revela>
      )
    case 'cta':
      return (
        <Revela>
          <div className="fds-card" style={{ marginTop: 'var(--fds-12)', padding: 'var(--fds-8)', background: 'var(--fds-deep)' }}>
            <p className="fds-h3" style={{ fontSize: '1.5rem' }}>{bloco.titulo}</p>
            <p className="fds-body mt-3" style={{ maxWidth: 'none' }}>{bloco.texto}</p>
            <Link href={bloco.href} className="fds-btn fds-btn--primary mt-6">
              {bloco.botao} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Revela>
      )
  }
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = buscarPost(slug)
  if (!post) notFound()

  const secoes = post.corpo.filter((b): b is string => typeof b === 'string' && b.startsWith('## ')).map(b => b.slice(3))
  const outros = postsPublicados().filter(p => p.slug !== post.slug).slice(0, 2)

  return (
    <div className="min-h-screen overflow-x-hidden">
      <NavbarComecar />
      <WhatsAppButton />
      <CookieBanner />
      <ProgressoLeitura />
      <style>{CSS_POST}</style>

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
          {/* ── BANNER ─────────────────────────────────────── */}
          <header className="relative overflow-hidden" style={{ borderBottom: '1px solid var(--fds-line)' }}>
            {post.capa && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.capa} alt="" className="post-capa-img absolute inset-0 h-full w-full object-cover" />
            )}
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(180deg, rgba(9,18,44,.78) 0%, rgba(8,9,13,.88) 55%, rgba(8,9,13,1) 100%)' }}
            />
            <div className="fds-wrap relative" style={{ maxWidth: 860, paddingTop: 'calc(var(--fds-30) + 20px)', paddingBottom: 'var(--fds-16)' }}>
              <Link href="/blog" className="fds-meta">← Blog</Link>
              <p className="fds-eyebrow mt-6 block">{post.categoria}</p>
              <h1 className="fds-h1 mt-4">{post.titulo}</h1>
              <p className="fds-lead mt-6" style={{ maxWidth: 680 }}>{post.resumo}</p>
              <p className="fds-meta mt-8">
                {post.autor}
                {' · '}
                <time dateTime={post.data}>{formatarData(post.data)}</time>
                {' · '}
                {post.leitura} min de leitura
              </p>
            </div>
          </header>

          {/* ── CORPO + ÍNDICE ─────────────────────────────── */}
          <div className="fds-section">
            <div className="fds-wrap grid gap-12 lg:grid-cols-[220px_minmax(0,720px)] lg:justify-center">
              {secoes.length > 1 && (
                <aside className="hidden lg:block">
                  <nav className="sticky" style={{ top: 110 }} aria-label="Neste texto">
                    <p className="fds-meta">Neste texto</p>
                    <ol className="mt-5 space-y-3" style={{ borderLeft: '1px solid var(--fds-line)' }}>
                      {secoes.map((s, i) => (
                        <li key={s}>
                          <a href={`#${ancora(s)}`} className="fds-small block -ml-px pl-4 transition-colors hover:text-[var(--fds-ink)]" style={{ borderLeft: '1px solid transparent' }}>
                            <span style={{ color: 'var(--fds-accent)' }}>{String(i + 1).padStart(2, '0')}</span> {s}
                          </a>
                        </li>
                      ))}
                    </ol>
                  </nav>
                </aside>
              )}
              <div id="post-corpo" style={{ minWidth: 0 }}>
                {post.corpo.map((bloco, i) => <BlocoPost key={i} bloco={bloco} />)}
              </div>
            </div>
          </div>

          {/* ── CONTINUE LENDO ─────────────────────────────── */}
          {outros.length > 0 && (
            <section className="fds-section fds-band">
              <div className="fds-wrap">
                <p className="fds-eyebrow">Continue lendo</p>
                <div className="mt-8 grid gap-6 md:grid-cols-2">
                  {outros.map(o => (
                    <Link key={o.slug} href={`/blog/${o.slug}`} className="fds-card post-card group block overflow-hidden" style={{ padding: 0 }}>
                      {o.capa && (
                        <div className="overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={o.capa} alt="" loading="lazy" className="h-48 w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                        </div>
                      )}
                      <div style={{ padding: 'var(--fds-6)' }}>
                        <p className="fds-eyebrow">{o.categoria}</p>
                        <p className="mt-3" style={{ fontFamily: 'var(--fds-serif)', fontSize: '1.35rem', fontWeight: 600, lineHeight: 1.25, color: 'var(--fds-ink)' }}>{o.titulo}</p>
                        <p className="fds-meta mt-4">{o.leitura} min de leitura</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}

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
