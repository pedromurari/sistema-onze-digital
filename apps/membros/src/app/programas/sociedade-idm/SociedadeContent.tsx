'use client'

/**
 * Página da Sociedade IDM (pedido do Pedro, 24/11/2026).
 *
 * O que é verdade hoje (fonte: CRM + cofre Obsidian "Produto/Sociedade IDM"):
 * - assinatura mensal de R$ 150 (é o que os associados pagam no CRM);
 * - aberta a qualquer pessoa, não só a quem estudou no IDM (Pedro, 23/11);
 * - entrada a qualquer momento, cada associado escolhe o dia de vencimento;
 * - o associado tem aperfeiçoamento, acompanhamento, aulas e cursos internos
 *   e networking;
 * - estar em dia é pré-requisito pra atender no Divã IDM, mas a entrada no
 *   Divã continua sendo curadoria manual (não é automática).
 *
 * Não tem checkout: o CTA grava o lead (/api/lista-espera, produto
 * 'sociedade-idm') e abre o WhatsApp da vendedora. Detalhes que ainda não
 * foram definidos (grade de encontros, conteúdo exato da área) ficam fora da
 * página até o Rodrygo fechar -- melhor prometer menos que prometer errado.
 */

import Link from 'next/link'
import { ArrowRight, BookOpen, Compass, MessagesSquare, Sofa, Users } from 'lucide-react'
import { LeadWhatsappCta } from '@/components/marketing/LeadWhatsappModal'
import { GaleriaCarrossel } from '@/components/marketing/GaleriaCarrossel'
import { CSS_POST, Revela } from '@/components/blog/PostVisual'

const WA = 'https://wa.me/5511965781940?text=' + encodeURIComponent('Olá! Quero saber mais sobre a Sociedade IDM.')
const PRECO = 150

const lead = {
  endpoint: '/api/lista-espera',
  corpoExtra: { produto: 'sociedade-idm' },
  whatsappUrl: WA,
  eyebrow: 'Sociedade IDM',
  titulo: 'Quero me associar',
  descricao: 'Deixe seu nome e WhatsApp: a equipe te chama pra explicar como funciona e fazer sua adesão.',
  textoBotao: 'Quero me associar',
}

const BENEFICIOS = [
  { icone: BookOpen, titulo: 'Aperfeiçoamento contínuo', texto: 'Aulas e cursos internos do Instituto pra você continuar estudando depois da formação, sem parar no certificado.' },
  { icone: Compass, titulo: 'Acompanhamento', texto: 'Um lugar pra levar suas dúvidas de prática e de carreira, com quem já percorreu esse caminho.' },
  { icone: Users, titulo: 'Networking', texto: 'Convivência com outros profissionais da mente: troca de casos, indicações e parcerias.' },
  { icone: Sofa, titulo: 'Porta de entrada pro Divã IDM', texto: 'Estar em dia com a Sociedade é pré-requisito pra atender pela plataforma de terapia do Instituto.' },
]

const CAMINHO = [
  { n: '01', t: 'Associe-se', s: 'Assinatura mensal, entrada a qualquer momento.' },
  { n: '02', t: 'Aperfeiçoe-se', s: 'Aulas, cursos e acompanhamento ao longo do mês.' },
  { n: '03', t: 'Credenciamento', s: 'Quem quer atender passa pela curadoria do Instituto.' },
  { n: '04', t: 'Atenda no Divã', s: 'Aprovado, você recebe pacientes pela plataforma.' },
]

const FAQ = [
  { q: 'Preciso ter estudado no IDM pra me associar?', a: 'Não. A Sociedade IDM é aberta a qualquer pessoa que trabalha ou quer trabalhar com o cuidado da mente.' },
  { q: 'Quanto custa?', a: `A assinatura é de R$ ${PRECO} por mês. Você escolhe o melhor dia de vencimento na adesão.` },
  { q: 'Ser associado me coloca automaticamente no Divã IDM?', a: 'Não automaticamente. Estar em dia com a Sociedade é pré-requisito, e a entrada no Divã passa por uma curadoria do Instituto, feita um a um.' },
  { q: 'Como faço pra me associar?', a: 'Clique em "Quero me associar", deixe seu nome e WhatsApp e a equipe te chama pra explicar os detalhes e fazer a adesão.' },
]

const CSS_SOC = `
.soc-orbe { position: absolute; border-radius: 999px; filter: blur(70px); pointer-events: none; animation: soc-flutua 14s ease-in-out infinite !important; animation-duration: 14s !important; animation-iteration-count: infinite !important; }
@keyframes soc-flutua { 0%,100% { transform: translate(0,0) } 50% { transform: translate(30px,-24px) } }
.soc-linha { position: absolute; top: 27px; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--fds-accent), transparent); opacity: .5; }
`

export function SociedadeContent() {
  return (
    <div className="fds">
      <style>{CSS_POST + CSS_SOC}</style>

      {/* ── ABERTURA ─────────────────────────────────────────────── */}
      <section className="fds-band--deep relative overflow-hidden" style={{ paddingTop: 'calc(var(--fds-30) + 8px)', paddingBottom: 'var(--fds-24)' }}>
        <span className="soc-orbe" style={{ width: 420, height: 420, right: -80, top: -60, background: 'rgba(255,184,0,.14)' }} />
        <span className="soc-orbe" style={{ width: 300, height: 300, left: -100, bottom: -120, background: 'rgba(80,110,220,.16)', animationDelay: '-6s' }} />
        <div className="fds-wrap relative grid items-center gap-12 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="fds-eyebrow block">Instituto Despertamente · Associação</p>
            <h1 className="fds-display mt-4">
              Sociedade <span className="fds-accent">IDM</span>.
            </h1>
            <p className="fds-lead mt-6 max-w-xl">
              A comunidade de quem cuida da mente dos outros. Uma assinatura mensal que mantém você estudando,
              acompanhado e perto de quem faz o mesmo trabalho, e que abre a porta pro Divã IDM.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {['Aberta a todos', 'Entrada a qualquer momento', 'Você escolhe o dia de vencimento'].map(t => (
                <span key={t} className="fds-small" style={{ border: '1px solid var(--fds-line)', borderRadius: 999, padding: '7px 14px', color: 'var(--fds-ink-2)' }}>{t}</span>
              ))}
            </div>
          </div>

          <div>
            <div className="fds-card" style={{ padding: 'var(--fds-8)', borderColor: 'rgba(255,184,0,.4)', background: 'linear-gradient(160deg, rgba(255,184,0,.08), rgba(9,18,44,.6) 60%)' }}>
              <p className="fds-eyebrow">Assinatura</p>
              <div className="mt-4 flex items-end gap-2">
                <span className="fds-h1" style={{ lineHeight: 1 }}>R$ {PRECO}</span>
                <span className="fds-small" style={{ paddingBottom: 6 }}>/mês</span>
              </div>
              <ul className="mt-6 space-y-3">
                {BENEFICIOS.map(b => (
                  <li key={b.titulo} className="fds-small flex items-start gap-3" style={{ color: 'var(--fds-ink-2)' }}>
                    <span style={{ color: 'var(--fds-accent)' }}>✦</span> {b.titulo}
                  </li>
                ))}
              </ul>
              <LeadWhatsappCta texto="Quero me associar" className="mt-8 w-full" {...lead} />
              <a href={WA} target="_blank" rel="noopener noreferrer" className="fds-small mt-4 block text-center" style={{ color: 'var(--fds-ink-3)' }}>
                Prefiro tirar uma dúvida antes
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── O QUE O ASSOCIADO TEM ─────────────────────────────────── */}
      <section className="fds-section">
        <div className="fds-wrap">
          <Revela>
            <p className="fds-eyebrow block">O que você tem</p>
            <h2 className="fds-h2 mt-4 max-w-3xl">
              A formação termina. <span className="fds-accent">O cuidado com o seu trabalho, não.</span>
            </h2>
            <p className="fds-lead mt-6 max-w-2xl">
              Quem atende sabe: o certificado é o começo. A Sociedade IDM existe pra você não ficar sozinho depois dele.
            </p>
          </Revela>
          <div className="mt-14 grid gap-5 sm:grid-cols-2">
            {BENEFICIOS.map((b, i) => (
              <Revela key={b.titulo} atraso={i * 110}>
                <div className="fds-card post-card h-full" style={{ padding: 'var(--fds-8)' }}>
                  <span className="flex h-11 w-11 items-center justify-center" style={{ borderRadius: 8, background: 'rgba(255,184,0,.1)', color: 'var(--fds-accent)' }}>
                    <b.icone className="h-5 w-5" />
                  </span>
                  <p className="fds-h3 mt-5" style={{ fontSize: '1.5rem' }}>{b.titulo}</p>
                  <p className="fds-body mt-3">{b.texto}</p>
                </div>
              </Revela>
            ))}
          </div>
        </div>
      </section>

      {/* ── O CAMINHO ATÉ O DIVÃ ──────────────────────────────────── */}
      <section className="fds-band fds-section">
        <div className="fds-wrap">
          <Revela>
            <p className="fds-eyebrow block">Do estudo ao consultório</p>
            <h2 className="fds-h2 mt-4 max-w-3xl">O caminho de quem quer <span className="fds-accent">atender pelo Divã IDM</span>.</h2>
          </Revela>
          <div className="relative mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <span className="soc-linha hidden lg:block" />
            {CAMINHO.map((c, i) => (
              <Revela key={c.n} atraso={i * 150}>
                <div className="relative">
                  <span
                    className="relative flex h-14 w-14 items-center justify-center"
                    style={{ borderRadius: 999, background: 'var(--fds-bg)', border: '1px solid var(--fds-accent)', color: 'var(--fds-accent)', fontFamily: 'var(--fds-serif)', fontWeight: 600, fontSize: 18 }}
                  >
                    {c.n}
                  </span>
                  <p className="fds-h3 mt-5" style={{ fontSize: '1.35rem' }}>{c.t}</p>
                  <p className="fds-small mt-2">{c.s}</p>
                </div>
              </Revela>
            ))}
          </div>
          <Revela>
            <div className="mt-14 flex flex-wrap items-center justify-between gap-6 fds-card" style={{ padding: 'var(--fds-6) var(--fds-8)' }}>
              <p className="fds-body" style={{ maxWidth: 640 }}>
                O Divã IDM conecta pessoas que buscam terapia a psicanalistas associados, com sessões a valor social.
              </p>
              <Link href="/programas/diva-idm" className="inline-flex items-center gap-2 font-semibold" style={{ color: 'var(--fds-accent)' }}>
                Conhecer o Divã IDM <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Revela>
        </div>
      </section>

      {/* ── PRA QUEM É ────────────────────────────────────────────── */}
      <section className="fds-section">
        <div className="fds-wrap grid items-center gap-12 lg:grid-cols-2">
          <Revela>
            <p className="fds-eyebrow block">Pra quem é</p>
            <h2 className="fds-h2 mt-4">Aberta a <span className="fds-accent">todos</span>, não só a quem estudou aqui.</h2>
            <ul className="mt-8 space-y-4">
              {[
                'Psicanalistas e terapeutas que querem continuar estudando',
                'Quem está terminando a formação e quer começar a atender acompanhado',
                'Profissionais de outras escolas que querem conviver com o método do IDM',
                'Quem quer atender pelo Divã IDM',
              ].map(t => (
                <li key={t} className="fds-body flex items-start gap-3">
                  <MessagesSquare className="mt-1 h-4 w-4 shrink-0" style={{ color: 'var(--fds-accent)' }} /> {t}
                </li>
              ))}
            </ul>
          </Revela>
          <Revela>
            <div className="fds-card" style={{ padding: 'var(--fds-8)' }}>
              <div className="grid grid-cols-2 gap-px" style={{ background: 'var(--fds-line)' }}>
                {[['+250', 'Psicanalistas formados'], ['20 anos', 'De experiência'], [`R$ ${PRECO}`, 'Por mês'], ['Todo o Brasil', 'Associados online']].map(([n, l]) => (
                  <div key={l} style={{ background: 'var(--fds-bg)', padding: 'var(--fds-6)' }}>
                    <p className="fds-h3" style={{ fontSize: '1.9rem' }}>{n}</p>
                    <p className="fds-meta mt-2">{l}</p>
                  </div>
                ))}
              </div>
            </div>
          </Revela>
        </div>
      </section>

      {/* ── COMUNIDADE (fotos) ────────────────────────────────────── */}
      <section className="fds-band" style={{ paddingBlock: 'var(--fds-16)' }}>
        <div className="fds-wrap">
          <p className="fds-eyebrow block">A comunidade IDM</p>
        </div>
        <div className="mt-8">
          <GaleriaCarrossel compacta />
        </div>
      </section>

      {/* ── PERGUNTAS ─────────────────────────────────────────────── */}
      <section className="fds-section">
        <div className="fds-wrap" style={{ maxWidth: 760 }}>
          <p className="fds-eyebrow block">Dúvidas</p>
          <h2 className="fds-h2 mt-4">Perguntas frequentes</h2>
          <div className="mt-10">
            {FAQ.map(f => (
              <details key={f.q} className="group" style={{ borderTop: '1px solid var(--fds-line)', padding: '22px 0' }}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 fds-body" style={{ color: 'var(--fds-ink)', fontWeight: 500 }}>
                  {f.q}
                  <span style={{ color: 'var(--fds-accent)', fontSize: 20 }} className="transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="fds-body mt-3">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── FECHAMENTO ────────────────────────────────────────────── */}
      <section className="fds-band--deep" style={{ paddingBlock: 'var(--fds-24)' }}>
        <div className="fds-wrap flex flex-wrap items-end justify-between gap-8">
          <h2 className="fds-h2 max-w-2xl">
            Faça parte da <span className="fds-accent">Sociedade IDM</span>.
          </h2>
          <div className="flex flex-wrap items-center gap-6">
            <LeadWhatsappCta texto="Quero me associar" {...lead} />
            <p className="fds-meta">R$ {PRECO}/mês · entrada a qualquer momento</p>
          </div>
        </div>
      </section>
    </div>
  )
}
