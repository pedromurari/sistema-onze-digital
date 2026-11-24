'use client'

/**
 * Grade de terapeutas do Divã IDM.
 *
 * Os dados vêm do CRM (`diva_terapeutas`, só aprovados) e a página é
 * revalidada sozinha -- quando a foto e a bio de alguém forem cadastradas,
 * aparecem aqui sem mexer em código. Enquanto não tem foto, o card mostra as
 * iniciais; sem bio, simplesmente não mostra o parágrafo (nada de texto
 * provisório no ar).
 *
 * O botão de cada card registra o lead no funil do Divã já dizendo qual
 * terapeuta a pessoa escolheu (via /api/diva-lead -> diva-registrar) e abre o
 * WhatsApp institucional com a mensagem pronta citando o nome.
 */

import { LeadWhatsappCta } from '@/components/marketing/LeadWhatsappModal'

export type TerapeutaPublico = {
  id: string
  nome: string
  especialidade: string | null
  foto_url: string | null
  bio: string | null
}

const WHATSAPP_DIVA = '5511965781940'  // Helen (vendedora): todo lead do site vai pra ela

function linkWhatsapp(mensagem: string) {
  return `https://wa.me/${WHATSAPP_DIVA}?text=${encodeURIComponent(mensagem)}`
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/)
  const primeira = partes[0]?.[0] ?? ''
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (primeira + ultima).toUpperCase()
}

/** Nome de exibição: primeiro + último, como em qualquer agenda de clínica. */
function nomeCurto(nome: string) {
  const partes = nome.trim().split(/\s+/)
  return partes.length > 2 ? `${partes[0]} ${partes[partes.length - 1]}` : nome.trim()
}

export function TerapeutasDiva({ terapeutas }: { terapeutas: TerapeutaPublico[] }) {
  if (terapeutas.length === 0) return null

  return (
    <section id="terapeutas" className="fds-section">
      <div className="fds-wrap">
        <p className="fds-eyebrow block">Quem pode te atender</p>
        <h2 className="fds-h2 mt-4">
          {terapeutas.length} psicanalistas formados pelo Instituto.
        </h2>
        <p className="fds-body mt-4">
          Todos em supervisão. Escolha com quem você quer conversar — ou deixe a gente indicar.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {terapeutas.map(t => {
            const curto = nomeCurto(t.nome)
            return (
              <article
                key={t.id}
                className="fds-card flex flex-col gap-4"
                style={{ padding: 'var(--fds-6)' }}
              >
                {t.foto_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.foto_url}
                    alt={`Foto de ${curto}`}
                    className="h-[76px] w-[76px] rounded-full object-cover"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="flex h-[76px] w-[76px] items-center justify-center rounded-full"
                    style={{
                      background: 'var(--fds-deep)',
                      border: '1px solid var(--fds-line)',
                      fontFamily: 'var(--fds-serif)',
                      fontSize: 24,
                      fontWeight: 700,
                      color: 'var(--fds-accent)',
                    }}
                  >
                    {iniciais(t.nome)}
                  </div>
                )}

                <div>
                  <h3 className="fds-h3" style={{ fontSize: 18, lineHeight: 1.3 }}>{curto}</h3>
                  <p className="fds-small mt-1">{t.especialidade || 'Psicanálise'}</p>
                </div>

                {t.bio && <p className="fds-small flex-grow">{t.bio}</p>}
                {!t.bio && <div className="flex-grow" />}

                <p className="fds-small" style={{ color: 'var(--fds-accent)', fontWeight: 600 }}>
                  A partir de R$ 70
                </p>

                <LeadWhatsappCta
                  texto={`Agendar com ${curto.split(' ')[0]}`}
                  variante="ghost"
                  className="w-full"
                  endpoint="/api/diva-lead"
                  corpoExtra={{ terapeuta_id: t.id }}
                  whatsappUrl={linkWhatsapp(
                    `Olá! Quero agendar uma sessão com ${curto} pelo Divã IDM.`,
                  )}
                  eyebrow="Divã IDM"
                  titulo={`Agendar com ${curto}`}
                  descricao="Deixe seu nome e WhatsApp: a gente confirma o horário com você por lá."
                  textoBotao="Quero agendar"
                />
              </article>
            )
          })}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 fds-card" style={{ padding: 'var(--fds-6)' }}>
          <p className="fds-body" style={{ maxWidth: 'none' }}>
            Não sabe por onde começar? A gente indica o psicanalista certo pra você.
          </p>
          <LeadWhatsappCta
            texto="Quero que me indiquem"
            endpoint="/api/diva-lead"
            whatsappUrl={linkWhatsapp('Olá! Quero fazer terapia pelo Divã IDM e gostaria de uma indicação de psicanalista.')}
            eyebrow="Divã IDM"
            titulo="A gente te indica"
            descricao="Deixe seu nome e WhatsApp: conversamos rapidinho e indicamos quem combina com o que você está vivendo."
            textoBotao="Quero uma indicação"
          />
        </div>
      </div>
    </section>
  )
}
