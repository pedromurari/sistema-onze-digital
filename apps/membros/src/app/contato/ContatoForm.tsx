'use client'

/**
 * Formulário de contato. Grava em /api/contato (que decide se vira lead, vai
 * pro Divã ou é assunto de aluno) e em seguida abre o WhatsApp institucional
 * com o assunto e a mensagem já escritos, pra conversa não começar do zero.
 */

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

const WHATSAPP = '5511930439385'

const GRUPOS: { rotulo: string; opcoes: string[] }[] = [
  {
    rotulo: 'Quero me informar sobre',
    opcoes: [
      'Formação em Psicanálise Clínica Integrativa',
      'Despertar Sistêmico — Constelação Familiar',
      'Practitioner em PNL',
      'Mentoria NPS — Numerologia Pitagórica',
      'Mentoria NPA — Numerologia Aplicada',
      'IDM pelo Brasil — encontro presencial',
    ],
  },
  { rotulo: 'Divã IDM', opcoes: ['Quero fazer terapia', 'Sou psicanalista e quero atender no Divã'] },
  {
    rotulo: 'Já sou aluno',
    opcoes: ['Suporte da minha turma ou do acesso', 'Financeiro — boleto, pagamento ou nota fiscal', 'Certificado'],
  },
  { rotulo: 'Outros', opcoes: ['Quero levar o IDM pra minha cidade', 'Imprensa, parceria ou convite', 'Outro assunto'] },
]

function formatarWhatsapp(valor: string) {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

const rotulo = 'fds-meta block'

export function ContatoForm() {
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [assunto, setAssunto] = useState(GRUPOS[0].opcoes[0])
  const [mensagem, setMensagem] = useState('')
  const [website, setWebsite] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ok, setOk] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const digitos = whatsapp.replace(/\D/g, '')
    if (nome.trim().length < 2) return setErro('Digite seu nome.')
    if (digitos.length < 10) return setErro('Digite o WhatsApp com DDD.')

    setErro('')
    setEnviando(true)
    try {
      const r = await fetch('/api/contato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome.trim(), whatsapp: digitos, email, assunto, mensagem, website }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || 'Não foi possível enviar agora.')
      }
      setOk(true)
      const texto = `Olá! Vim pelo site. Assunto: ${assunto}.${mensagem.trim() ? `\n\n${mensagem.trim()}` : ''}`
      setTimeout(() => window.location.assign(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`), 1000)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar agora.')
      setEnviando(false)
    }
  }

  if (ok) {
    return (
      <div className="fds-card" style={{ padding: 'var(--fds-8)' }}>
        <h2 className="fds-h3">Recebemos sua mensagem.</h2>
        <p className="fds-body mt-3">Estamos te levando pro WhatsApp pra continuar a conversa.</p>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className="flex max-w-[540px] flex-col gap-5">
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={website}
        onChange={e => setWebsite(e.target.value)}
        style={{ position: 'absolute', left: -9999, width: 1, height: 1 }}
      />

      <div>
        <label className={rotulo} htmlFor="c-nome">Nome completo</label>
        <input id="c-nome" className="fds-field mt-2" value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome" autoComplete="name" required />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={rotulo} htmlFor="c-zap">WhatsApp</label>
          <input id="c-zap" className="fds-field mt-2" value={whatsapp} onChange={e => setWhatsapp(formatarWhatsapp(e.target.value))} placeholder="(11) 99999-9999" inputMode="tel" autoComplete="tel" required />
        </div>
        <div>
          <label className={rotulo} htmlFor="c-email">E-mail (opcional)</label>
          <input id="c-email" type="email" className="fds-field mt-2" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email" />
        </div>
      </div>

      <div>
        <label className={rotulo} htmlFor="c-assunto">Sobre o que você quer falar</label>
        <select id="c-assunto" className="fds-field mt-2" value={assunto} onChange={e => setAssunto(e.target.value)}>
          {GRUPOS.map(g => (
            <optgroup key={g.rotulo} label={g.rotulo}>
              {g.opcoes.map(o => <option key={o} value={o}>{o}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      <div>
        <label className={rotulo} htmlFor="c-msg">Mensagem (opcional)</label>
        <textarea id="c-msg" className="fds-field mt-2" rows={4} value={mensagem} onChange={e => setMensagem(e.target.value)} placeholder="Escreve do seu jeito." style={{ resize: 'vertical' }} />
      </div>

      {erro && <p className="fds-small" style={{ color: '#ff8f6b' }}>{erro}</p>}

      <button type="submit" className="fds-btn fds-btn--primary self-start" disabled={enviando}>
        {enviando ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</> : 'Enviar mensagem'}
      </button>
    </form>
  )
}
