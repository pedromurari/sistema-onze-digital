/**
 * IDM pelo Brasil — encontros presenciais itinerantes.
 *
 * São DOIS produtos diferentes, e a página separa os dois desde o começo
 * (a versão anterior descrevia uma "imersão de 4 dias" que não existe):
 * - Numerologia (NPA): um dia, duas turmas de 4h no mesmo local
 *   (manhã 09h–13h, tarde 14h–18h), com Rodrygo Murari.
 * - Psicanálise (IDM PSI): imersão de dia inteiro, 09h–17h.
 *
 * Datas e cidades vêm do CRM (`npa_eventos`). O botão de cada cidade grava o
 * interessado no produto `npa` com o nome do evento (via /api/lista-espera,
 * modo `evento`) e abre o WhatsApp institucional.
 */

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { LeadWhatsappCta } from '@/components/marketing/LeadWhatsappModal'
import { GaleriaCarrossel } from '@/components/marketing/GaleriaCarrossel'

export type EventoPublico = {
  nome: string
  slug: string | null
  data_evento: string
  local: string | null
  professor_convidado: string | null
}

const WHATSAPP = '5511965781940'  // Helen (vendedora): todo lead do site vai pra ela
const wa = (mensagem: string) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensagem)}`

/** "NPA #24 São Paulo" / "IDM PSI #20 - Curitiba" -> "São Paulo" / "Curitiba". */
function cidade(nome: string) {
  return nome.replace(/^.*?#\d+\s*[-–—]?\s*/, '').trim() || nome
}

function formato(nome: string): 'Psicanálise' | 'Numerologia' {
  return /psi/i.test(nome) ? 'Psicanálise' : 'Numerologia'
}

/** Meio-dia em Brasília evita a data "voltar um dia" ao converter fuso. */
function dataLocal(iso: string) {
  return new Date(`${iso}T12:00:00-03:00`)
}

function diaMes(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(dataLocal(iso))
}

function diaSemana(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' }).format(dataLocal(iso))
}

function mes(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' }).format(dataLocal(iso))
}

const ETAPAS = [
  { titulo: 'Seu mapa, ao vivo', texto: 'Você monta o próprio mapa numerológico na hora, com a sua data de nascimento.' },
  { titulo: 'O padrão que se repete', texto: 'Onde a mesma escolha reaparece na sua vida — e por quê.' },
  { titulo: 'Prática na sala', texto: 'Você lê o mapa de outra pessoa, com o professor corrigindo ali.' },
  { titulo: 'Certificado na mão', texto: 'Você sai do dia com o certificado de participação.' },
]

const etiqueta = { border: '1px solid var(--fds-line)', borderRadius: 4, padding: '7px 13px' }

function Horario({ rotulo, horas }: { rotulo: string; horas: string }) {
  return (
    <div className="flex-1" style={{ background: 'var(--fds-surface)', padding: '16px 18px' }}>
      <p className="fds-meta">{rotulo}</p>
      <p className="fds-h3 mt-1" style={{ color: 'var(--fds-accent)', fontSize: 21 }}>{horas}</p>
    </div>
  )
}

export function IdmBrasilContent({
  proximos,
  passados,
}: {
  proximos: EventoPublico[]
  passados: EventoPublico[]
}) {
  const primeiro = proximos[0]

  return (
    <div className="fds">
      {/* ── CAPA ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden" style={{ borderBottom: '1px solid var(--fds-line)' }}>
        <Image
          src="/images/turmas/aula-sala-cheia.jpg"
          alt="Sala cheia durante uma aula presencial do IDM pelo Brasil"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(100deg, rgba(8,9,13,0.97) 0%, rgba(8,9,13,0.9) 48%, rgba(8,9,13,0.5) 100%)' }}
        />
        <div className="fds-wrap relative" style={{ paddingTop: 'var(--fds-30)', paddingBottom: 'var(--fds-24)' }}>
          <div className="max-w-[660px]">
            <p className="fds-eyebrow block">IDM pelo Brasil</p>
            <h1 className="fds-display mt-5">O método sai da tela e senta do seu lado.</h1>
            <p className="fds-body mt-6" style={{ color: '#d4d5d9', fontSize: 18 }}>
              Um dia presencial na sua cidade, com certificado na mão no fim. Em dois formatos:{' '}
              <strong style={{ color: 'var(--fds-ink)' }}>Numerologia</strong>, em turmas de 4 horas, e{' '}
              <strong style={{ color: 'var(--fds-ink)' }}>Psicanálise</strong>, em imersão de dia inteiro.
            </p>
            <a href="#proximas" className="fds-btn fds-btn--primary mt-9">Ver as próximas datas</a>
          </div>
        </div>
      </section>

      {/* ── OS DOIS FORMATOS ─────────────────────────────────────────── */}
      <section className="fds-section">
        <div className="fds-wrap">
          <h2 className="fds-h2">Dois formatos. Escolha o seu.</h2>
          <p className="fds-body mt-4">
            São encontros diferentes, com cargas horárias diferentes — e cada cidade recebe um deles.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <article className="fds-card flex flex-col overflow-hidden" style={{ padding: 0 }}>
              <div className="relative aspect-video">
                <Image src="/images/turmas/turma-grupo.jpg" alt="Turma de numerologia reunida ao fim da aula" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
              </div>
              <div className="flex flex-1 flex-col gap-4" style={{ padding: 'var(--fds-8)' }}>
                <p className="fds-eyebrow block">Numerologia · NPA</p>
                <h3 className="fds-h3">O Despertar dos Números</h3>
                <p className="fds-body flex-1">
                  Quatro horas pra você montar o próprio mapa numerológico e enxergar o padrão que se repete
                  nas suas escolhas. No mesmo dia e no mesmo lugar rodam duas turmas — você escolhe a que
                  cabe na sua agenda.
                </p>
                <div className="flex gap-px overflow-hidden" style={{ border: '1px solid var(--fds-line)', borderRadius: 8, background: 'var(--fds-line)' }}>
                  <Horario rotulo="Turma da manhã" horas="09h às 13h" />
                  <Horario rotulo="Turma da tarde" horas="14h às 18h" />
                </div>
                <p className="fds-small">Com Rodrygo Murari · 4 horas · certificado no fim</p>
              </div>
            </article>

            <article className="fds-card flex flex-col overflow-hidden" style={{ padding: 0 }}>
              <div className="relative aspect-video">
                <Image src="/images/turmas/turma-certificados.jpg" alt="Turma reunida com os certificados ao fim da imersão" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
              </div>
              <div className="flex flex-1 flex-col gap-4" style={{ padding: 'var(--fds-8)' }}>
                <p className="fds-eyebrow block">Psicanálise · IDM PSI</p>
                <h3 className="fds-h3">Imersão de dia inteiro</h3>
                <p className="fds-body flex-1">
                  Oito horas de psicanálise aplicada, com ferramentas de autoconhecimento que você usa no mesmo
                  dia. Uma turma só, o dia todo — dá tempo de ir fundo em vez de passar por cima.
                </p>
                <div className="overflow-hidden" style={{ border: '1px solid var(--fds-line)', borderRadius: 8 }}>
                  <Horario rotulo="Turma única" horas="09h às 17h" />
                </div>
                <p className="fds-small">8 horas · material de apoio · certificado de conclusão</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ── AGENDA (dados do CRM) ────────────────────────────────────── */}
      <section id="proximas" className="fds-band fds-section">
        <div className="fds-wrap">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="fds-eyebrow block">Agenda</p>
              <h2 className="fds-h2 mt-4">Próximas cidades</h2>
            </div>
            <p className="fds-body max-w-sm">Vagas limitadas pelo tamanho da sala — quando lota, lotou.</p>
          </div>

          {proximos.length > 0 ? (
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {proximos.map((ev, i) => {
                const nomeCidade = cidade(ev.nome)
                const tipo = formato(ev.nome)
                return (
                  <article
                    key={ev.slug ?? ev.nome}
                    className="flex flex-col gap-5"
                    style={{
                      border: `1px solid ${i === 0 ? 'var(--fds-accent)' : 'var(--fds-line)'}`,
                      borderRadius: 10,
                      background: i === 0 ? 'var(--fds-deep)' : 'transparent',
                      padding: 'var(--fds-8)',
                    }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="fds-eyebrow block">{i === 0 ? 'Próxima' : 'Em seguida'} · {tipo}</p>
                        <h3 className="fds-h2 mt-2" style={{ fontSize: 32 }}>{nomeCidade}</h3>
                      </div>
                      <div className="text-right">
                        <p className="fds-h2" style={{ color: 'var(--fds-accent)', fontSize: 34, lineHeight: 1 }}>{diaMes(ev.data_evento)}</p>
                        <p className="fds-small mt-1">{diaSemana(ev.data_evento)}</p>
                      </div>
                    </div>
                    <div style={{ borderTop: '1px solid var(--fds-line)', paddingTop: 20 }}>
                      {ev.local && <p className="fds-body" style={{ color: '#d4d5d9' }}>{ev.local}</p>}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {tipo === 'Numerologia' ? (
                          <>
                            <span className="fds-small" style={etiqueta}>Manhã · 09h às 13h</span>
                            <span className="fds-small" style={etiqueta}>Tarde · 14h às 18h</span>
                          </>
                        ) : (
                          <span className="fds-small" style={etiqueta}>Dia inteiro · 09h às 17h</span>
                        )}
                      </div>
                      {ev.professor_convidado && <p className="fds-small mt-4">Com {ev.professor_convidado}</p>}
                    </div>
                    {ev.slug && tipo === 'Numerologia' && (
                      // Cada turma de Numerologia tem página própria de inscrição
                      // (rota /npa/:slug do CRM, com vídeo e checkout do Vega).
                      <a
                        href={`https://www.idmpelobrasil.com.br/npa/${ev.slug}`}
                        className={`fds-btn ${i === 0 ? 'fds-btn--primary' : 'fds-btn--ghost'} w-full`}
                      >
                        Garantir meu lugar
                        <ArrowRight className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {ev.slug && tipo !== 'Numerologia' && (
                      <LeadWhatsappCta
                        texto="Garantir meu lugar"
                        variante={i === 0 ? 'primary' : 'ghost'}
                        className="w-full"
                        endpoint="/api/lista-espera"
                        corpoExtra={{ evento: ev.slug }}
                        whatsappUrl={wa(`Olá! Quero garantir meu lugar no IDM pelo Brasil de ${nomeCidade}, dia ${diaMes(ev.data_evento)}.`)}
                        eyebrow={`IDM pelo Brasil · ${nomeCidade}`}
                        titulo="Garantir meu lugar"
                        descricao="Deixe seu nome e WhatsApp: a gente confirma a sua turma e te passa a inscrição por lá."
                        textoBotao="Quero meu lugar"
                      />
                    )}
                  </article>
                )
              })}
            </div>
          ) : (
            <p className="fds-body mt-10">As próximas datas estão sendo fechadas. Fale com a gente e seja avisado primeiro.</p>
          )}

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="fds-card flex flex-wrap items-center justify-between gap-4" style={{ padding: 'var(--fds-6)' }}>
              <div>
                <p className="fds-eyebrow block">Psicanálise</p>
                <p className="fds-body mt-1" style={{ color: '#d4d5d9' }}>Próxima imersão de dia inteiro: data a definir.</p>
              </div>
              <LeadWhatsappCta
                texto="Quero ser avisado"
                variante="ghost"
                endpoint="/api/lista-espera"
                corpoExtra={{ produto: 'idm-pelo-brasil-psicanalise' }}
                whatsappUrl={wa('Olá! Quero ser avisado da próxima imersão de Psicanálise do IDM pelo Brasil.')}
                eyebrow="Lista de espera"
                titulo="Te avisamos primeiro"
                descricao="Deixe seu nome e WhatsApp: você é avisado antes de todo mundo quando a próxima imersão de Psicanálise tiver data."
                textoBotao="Entrar na lista"
              />
            </div>
            <div className="fds-card flex flex-wrap items-center justify-between gap-4" style={{ padding: 'var(--fds-6)' }}>
              <p className="fds-body" style={{ color: '#d4d5d9' }}>Sua cidade não está na lista?</p>
              <a
                href={wa('Olá! Quero que o IDM pelo Brasil venha pra minha cidade.')}
                target="_blank"
                rel="noopener noreferrer"
                className="fds-small whitespace-nowrap"
                style={{ color: 'var(--fds-accent)', fontWeight: 600 }}
              >
                Chama o IDM pra cá →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── O QUE ACONTECE NO DIA ────────────────────────────────────── */}
      <section className="fds-section">
        <div className="fds-wrap">
          <h2 className="fds-h2">O que acontece nesse dia.</h2>
          <p className="fds-body mt-4">No encontro de Numerologia, em 4 horas:</p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {ETAPAS.map((e, i) => (
              <div key={e.titulo} style={{ borderTop: `1px solid ${i === 0 ? 'var(--fds-accent)' : 'var(--fds-line)'}`, paddingTop: 22 }}>
                <p className="fds-h3" style={{ color: 'var(--fds-accent)' }}>{String(i + 1).padStart(2, '0')}</p>
                <h3 className="fds-body mt-2" style={{ color: 'var(--fds-ink)', fontWeight: 600 }}>{e.titulo}</h3>
                <p className="fds-small mt-2">{e.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GALERIA (carrossel com as fotos das turmas) ─────────────── */}
      <section className="fds-band fds-section">
        <div className="fds-wrap flex flex-wrap items-end justify-between gap-4">
          <h2 className="fds-h2">Quem já esteve numa sala dessas.</h2>
          <p className="fds-small">Passe o mouse pra pausar. Clique pra ver grande.</p>
        </div>
        <div className="mt-10">
          <GaleriaCarrossel />
        </div>
      </section>

      {/* ── POR ONDE JÁ PASSOU (dados do CRM) ────────────────────────── */}
      {passados.length > 0 && (
        <section className="fds-section">
          <div className="fds-wrap">
            <h2 className="fds-h3">Por onde o IDM já passou</h2>
            <div
              className="mt-8 grid gap-px overflow-hidden sm:grid-cols-2 lg:grid-cols-3"
              style={{ background: 'var(--fds-line)', border: '1px solid var(--fds-line)', borderRadius: 10 }}
            >
              {passados.map(ev => (
                <div key={ev.nome} style={{ background: 'var(--fds-bg)', padding: '20px 24px' }}>
                  <p className="fds-body" style={{ color: 'var(--fds-ink)', fontWeight: 600 }}>{cidade(ev.nome)}</p>
                  <p className="fds-small mt-1">{mes(ev.data_evento)} · {formato(ev.nome)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FECHAMENTO ───────────────────────────────────────────────── */}
      <section className="fds-band--deep">
        <div className="fds-wrap flex flex-wrap items-center justify-between gap-8" style={{ paddingBlock: 'var(--fds-16)' }}>
          <h2 className="fds-h2 flex-1 basis-96" style={{ fontSize: 34 }}>
            {primeiro ? <>{cidade(primeiro.nome)}, {diaMes(primeiro.data_evento)}.<br />{formato(primeiro.nome) === 'Numerologia' ? 'Manhã ou tarde?' : 'Te vejo lá?'}</> : <>O IDM pode ir<br />até a sua cidade.</>}
          </h2>
          <div className="flex flex-wrap gap-3">
            <a href="#proximas" className="fds-btn fds-btn--primary">Ver as datas</a>
            <Link href="/" className="fds-btn fds-btn--ghost">Conhecer o Instituto <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
        </div>
      </section>
    </div>
  )
}
