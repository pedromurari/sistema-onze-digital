'use client'

/**
 * Briefing do blog — página pública, sem login (/briefing-blog?t=<token>).
 *
 * Pedido do Pedro (21/11/2026): mandar um link pro Rodrygo no WhatsApp e ele
 * preencher na hora. Nada de PDF, nada de conta.
 *
 * Salva sozinho enquanto a pessoa escreve, pela rota /api/briefing-blog
 * (server-side). O token da URL é o que permite fechar e voltar depois.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type Opcao = { valor: string; rotulo: string }
type Pergunta = {
  id: string
  titulo: string
  ajuda?: string
  tipo: 'texto' | 'linha' | 'escolha' | 'multipla'
  opcoes?: Opcao[]
  extra?: { id: string; placeholder: string }
  destaque?: boolean
}
type Bloco = { numero: string; titulo: string; sub: string; perguntas: Pergunta[] }

const BLOCOS: Bloco[] = [
  {
    numero: '01',
    titulo: 'Quem fala',
    sub: 'O agente precisa escrever como o Instituto escreve, não como um robô genérico.',
    perguntas: [
      {
        id: 'voz',
        titulo: 'Quem é a voz dos textos?',
        ajuda: 'É você em primeira pessoa? É "o Instituto"? É um time sem nome? Isso muda o texto inteiro.',
        tipo: 'texto',
      },
      {
        id: 'leitor',
        titulo: 'Para quem você está escrevendo?',
        ajuda: 'Descreva a pessoa real: o que ela faz, o que já sabe, o que a incomoda. Se forem dois públicos, diga os dois.',
        tipo: 'texto',
      },
      {
        id: 'tom',
        titulo: 'Qual tom você quer?',
        tipo: 'escolha',
        opcoes: [
          { valor: 'academico', rotulo: 'Técnico e sério, com referência teórica' },
          { valor: 'conversa', rotulo: 'Conversa direta, como você fala no vídeo' },
          { valor: 'acolhedor', rotulo: 'Acolhedor e suave, bem terapêutico' },
          { valor: 'provocativo', rotulo: 'Provocativo, de sacudir o leitor' },
          { valor: 'misto', rotulo: 'Depende do tema (explico ao lado)' },
        ],
        extra: { id: 'tom_obs', placeholder: 'Quer detalhar?' },
      },
      {
        id: 'nunca',
        titulo: 'O que o texto NUNCA pode fazer?',
        ajuda: 'A pergunta mais importante daqui. Prometer cura? Dar diagnóstico? Falar de política? Citar autor que você não endossa? Usar emoji? Escreva sem economia — é isso que segura o agente.',
        tipo: 'texto',
        destaque: true,
      },
    ],
  },
  {
    numero: '02',
    titulo: 'Quanto e quando',
    sub: 'O ritmo do blog.',
    perguntas: [
      { id: 'qtd', titulo: 'Quantos posts por semana?', tipo: 'linha' },
      {
        id: 'dias',
        titulo: 'Em quais dias e horários?',
        ajuda: 'Se não fizer diferença, escreva "tanto faz".',
        tipo: 'linha',
      },
      {
        id: 'tamanho',
        titulo: 'Tamanho do post',
        tipo: 'escolha',
        opcoes: [
          { valor: 'curto', rotulo: 'Curto — 400 a 600 palavras, 3 min de leitura' },
          { valor: 'medio', rotulo: 'Médio — 800 a 1.200 palavras, 5 a 7 min' },
          { valor: 'longo', rotulo: 'Longo — 1.500+ palavras, conteúdo de referência' },
          { valor: 'varia', rotulo: 'Varia conforme o assunto' },
        ],
      },
    ],
  },
  {
    numero: '03',
    titulo: 'Sobre o que',
    sub: 'Os trilhos temáticos.',
    perguntas: [
      {
        id: 'pilares',
        titulo: 'Quais são os pilares de conteúdo?',
        ajuda: 'De 3 a 6 temas, com proporção. Ex: "Psicanálise aplicada 40%, Constelação 20%, PNL 20%, bastidores 20%".',
        tipo: 'texto',
      },
      {
        id: 'fora',
        titulo: 'O que está fora do blog?',
        ajuda: 'Assuntos que o agente não deve tocar, mesmo que apareçam num vídeo seu.',
        tipo: 'texto',
      },
      {
        id: 'vender',
        titulo: 'O post deve vender?',
        ajuda: 'Todo post puxa pra uma formação no fim? Só alguns? Nenhum? E qual produto em qual tema?',
        tipo: 'texto',
      },
    ],
  },
  {
    numero: '04',
    titulo: 'Formato do texto',
    sub: 'A forma que todo post vai seguir.',
    perguntas: [
      {
        id: 'abertura',
        titulo: 'Como o post começa?',
        ajuda: 'Pergunta pro leitor? Caso clínico? Afirmação polêmica? Cena do dia a dia?',
        tipo: 'texto',
      },
      {
        id: 'estrutura',
        titulo: 'Tem uma estrutura fixa?',
        ajuda: 'Ex: abertura → o problema → o que a psicanálise diz → o que fazer na prática → convite.',
        tipo: 'texto',
      },
      { id: 'fim', titulo: 'Como o post termina?', tipo: 'texto' },
      {
        id: 'autores',
        titulo: 'Pode citar autores e teoria?',
        tipo: 'escolha',
        opcoes: [
          { valor: 'sim', rotulo: 'Sim, Freud, Lacan, Jung, Hellinger e companhia à vontade' },
          { valor: 'pouco', rotulo: 'Só quando for essencial, sem virar aula' },
          { valor: 'nao', rotulo: 'Não, texto leve, sem nome de autor' },
        ],
        extra: { id: 'autores_obs', placeholder: 'Autores que você endossa — e os que NÃO quer ver citados' },
      },
    ],
  },
  {
    numero: '05',
    titulo: 'YouTube e Instagram viram post',
    sub: 'O Pedro já pediu: todo vídeo novo vira conteúdo de blog automaticamente. Aqui você diz como.',
    perguntas: [
      {
        id: 'canais',
        titulo: 'Quais canais e perfis entram?',
        ajuda: 'Cole os links. Se tiver mais de um canal ou perfil, liste todos.',
        tipo: 'texto',
      },
      {
        id: 'tipos',
        titulo: 'Que tipo de vídeo deve virar post?',
        tipo: 'multipla',
        opcoes: [
          { valor: 'yt_longo', rotulo: 'Vídeo longo do YouTube' },
          { valor: 'yt_short', rotulo: 'Shorts do YouTube' },
          { valor: 'ig_reels', rotulo: 'Reels do Instagram' },
          { valor: 'ig_feed', rotulo: 'Post de feed com legenda longa' },
          { valor: 'lives', rotulo: 'Lives e aulas gravadas' },
        ],
      },
      {
        id: 'relacao',
        titulo: 'O post deve ser o quê, em relação ao vídeo?',
        tipo: 'escolha',
        opcoes: [
          { valor: 'transcricao', rotulo: 'Praticamente a transcrição, só organizada e limpa' },
          { valor: 'desdobra', rotulo: 'Parte do que você falou e aprofunda com o que não coube' },
          { valor: 'resumo', rotulo: 'Resumo curto, que serve de isca pro vídeo' },
        ],
      },
      {
        id: 'embed',
        titulo: 'O post deve mostrar o vídeo?',
        tipo: 'escolha',
        opcoes: [
          { valor: 'embed', rotulo: 'Sim, com o player no topo do post' },
          { valor: 'link', rotulo: 'Só um link no fim' },
          { valor: 'nada', rotulo: 'Não menciona o vídeo, o texto vive sozinho' },
        ],
      },
      {
        id: 'excecoes',
        titulo: 'Tem vídeo que NÃO deve virar post?',
        ajuda: 'Story de bastidor, divulgação de turma, vídeo com dado de aluno… Como o agente reconhece esses?',
        tipo: 'texto',
        destaque: true,
      },
    ],
  },
  {
    numero: '06',
    titulo: 'Quem aprova',
    sub: 'A parte que decide se isso roda sozinho ou com você no meio.',
    perguntas: [
      {
        id: 'aprovacao',
        titulo: 'O agente publica direto?',
        tipo: 'escolha',
        opcoes: [
          { valor: 'direto', rotulo: 'Publica sozinho, eu leio depois se quiser' },
          { valor: 'rascunho', rotulo: 'Deixa como rascunho e me avisa pra aprovar' },
          { valor: 'misto', rotulo: 'Publica os que vêm de vídeo, pede aprovação nos originais' },
        ],
      },
      {
        id: 'aviso',
        titulo: 'Por onde o agente te avisa?',
        ajuda: 'WhatsApp, e-mail, grupo do Marketing? E com que antecedência?',
        tipo: 'linha',
      },
    ],
  },
  {
    numero: '07',
    titulo: 'Referências',
    sub: 'Exemplo vale mais que adjetivo.',
    perguntas: [
      {
        id: 'gosta',
        titulo: 'Blogs ou textos que você gosta',
        ajuda: 'Cole links, mesmo de outra área. E diga o que te agrada neles.',
        tipo: 'texto',
      },
      {
        id: 'odeia',
        titulo: 'E o que você não suporta ver',
        ajuda: 'Texto genérico de IA, lista de 10 dicas, título caça-clique… seja específico.',
        tipo: 'texto',
      },
      {
        id: 'livre',
        titulo: 'Mais alguma coisa',
        ajuda: 'Qualquer regra, mania ou detalhe que não coube acima.',
        tipo: 'texto',
      },
    ],
  },
]

const TODAS = BLOCOS.flatMap(b => b.perguntas)

export function BriefingBlogForm() {
  const params = useSearchParams()
  const token = useMemo(() => {
    const t = params.get('t')
    return t && /^[a-zA-Z0-9_-]{3,64}$/.test(t) ? t : 'geral'
  }, [params])

  const [respostas, setRespostas] = useState<Record<string, string | string[]>>({})
  const [nome, setNome] = useState('')
  const [estado, setEstado] = useState('Carregando…')
  const [carregado, setCarregado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let vivo = true
    fetch(`/api/briefing-blog?t=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (!vivo) return
        if (d?.respostas && Object.keys(d.respostas).length) {
          setRespostas(d.respostas)
          setEstado('Respostas de antes carregadas')
        } else {
          setEstado('Pode começar')
        }
        if (d?.nome) setNome(d.nome)
        setCarregado(true)
      })
      .catch(() => {
        if (!vivo) return
        setEstado('Dá pra escrever, mas não consegui conectar pra salvar')
        setCarregado(true)
      })
    return () => { vivo = false }
  }, [token])

  const salvar = useCallback(
    (dados: Record<string, string | string[]>, quem: string) => {
      setEstado('Salvando…')
      fetch('/api/briefing-blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, nome: quem, respostas: dados }),
      })
        .then(r => (r.ok ? setEstado('Salvo') : setEstado('Não consegui salvar agora')))
        .catch(() => setEstado('Não consegui salvar agora'))
    },
    [token],
  )

  function mudar(id: string, valor: string | string[], quem = nome) {
    const novas = { ...respostas, [id]: valor }
    setRespostas(novas)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => salvar(novas, quem), 800)
  }

  const respondidas = TODAS.filter(p => {
    const v = respostas[p.id]
    return Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim().length > 0
  }).length

  return (
    <div className="bf">
      <style>{estilos}</style>

      <header className="bf-capa">
        <div className="bf-wrap">
          <p className="bf-eyebrow">Instituto Despertamente</p>
          <h1>Briefing do blog</h1>
          <p className="bf-intro">
            Rodrygo: o que você responder aqui vira a regra do agente que vai escrever e publicar
            no blog. Quanto mais específico, menos o robô inventa.
          </p>
        </div>
      </header>

      <div className="bf-status">
        <div className="bf-wrap bf-status-linha">
          <span>{estado}</span>
          <span className="bf-prog">
            {respondidas} de {TODAS.length} respondidas
          </span>
        </div>
      </div>

      <main className="bf-wrap bf-main">
        <div className="bf-nota">
          <strong>Não precisa responder tudo de uma vez.</strong> O que você escrever salva sozinho
          — pode fechar e voltar depois no mesmo link. Campo em branco significa &quot;decide por
          mim&quot;.
        </div>

        <div className="bf-campo">
          <label className="bf-pergunta" htmlFor="bf-nome">Quem está preenchendo</label>
          <input
            id="bf-nome"
            type="text"
            value={nome}
            disabled={!carregado}
            onChange={e => {
              setNome(e.target.value)
              if (timer.current) clearTimeout(timer.current)
              timer.current = setTimeout(() => salvar(respostas, e.target.value), 800)
            }}
            placeholder="Seu nome"
          />
        </div>

        {BLOCOS.map(bloco => (
          <section key={bloco.numero} className="bf-bloco">
            <h2>
              <span className="bf-num">{bloco.numero}</span>
              {bloco.titulo}
            </h2>
            <p className="bf-sub">{bloco.sub}</p>

            {bloco.perguntas.map(p => {
              const valor = respostas[p.id]
              return (
                <div key={p.id} className={`bf-campo${p.destaque ? ' bf-campo--destaque' : ''}`}>
                  <label className="bf-pergunta" htmlFor={`bf-${p.id}`}>{p.titulo}</label>
                  {p.ajuda && <p className="bf-ajuda">{p.ajuda}</p>}

                  {p.tipo === 'texto' && (
                    <textarea
                      id={`bf-${p.id}`}
                      value={typeof valor === 'string' ? valor : ''}
                      disabled={!carregado}
                      onChange={e => mudar(p.id, e.target.value)}
                    />
                  )}

                  {p.tipo === 'linha' && (
                    <input
                      id={`bf-${p.id}`}
                      type="text"
                      value={typeof valor === 'string' ? valor : ''}
                      disabled={!carregado}
                      onChange={e => mudar(p.id, e.target.value)}
                    />
                  )}

                  {p.tipo === 'escolha' && (
                    <div className="bf-opcoes">
                      {p.opcoes!.map(o => (
                        <label key={o.valor}>
                          <input
                            type="radio"
                            name={p.id}
                            checked={valor === o.valor}
                            disabled={!carregado}
                            onChange={() => mudar(p.id, o.valor)}
                          />
                          {o.rotulo}
                        </label>
                      ))}
                    </div>
                  )}

                  {p.tipo === 'multipla' && (
                    <div className="bf-opcoes">
                      {p.opcoes!.map(o => {
                        const lista = Array.isArray(valor) ? valor : []
                        return (
                          <label key={o.valor}>
                            <input
                              type="checkbox"
                              checked={lista.includes(o.valor)}
                              disabled={!carregado}
                              onChange={e =>
                                mudar(
                                  p.id,
                                  e.target.checked
                                    ? [...lista, o.valor]
                                    : lista.filter(v => v !== o.valor),
                                )
                              }
                            />
                            {o.rotulo}
                          </label>
                        )
                      })}
                    </div>
                  )}

                  {p.extra && (
                    <textarea
                      className="bf-extra"
                      placeholder={p.extra.placeholder}
                      value={typeof respostas[p.extra.id] === 'string' ? (respostas[p.extra.id] as string) : ''}
                      disabled={!carregado}
                      onChange={e => mudar(p.extra!.id, e.target.value)}
                    />
                  )}
                </div>
              )
            })}
          </section>
        ))}

        <footer className="bf-fim">
          <p>
            Terminou? Não precisa enviar nada — já está salvo. É só avisar o Pedro.
          </p>
        </footer>
      </main>
    </div>
  )
}

const estilos = `
.bf {
  --bf-bg:#f7f5f0; --bf-surface:#fff; --bf-line:#ddd8cd;
  --bf-ink:#11162b; --bf-ink2:#4a5068; --bf-ink3:#777d92;
  --bf-accent:#b8860b; --bf-accent-soft:#f6eed8; --bf-navy:#09122c;
  background:var(--bf-bg); color:var(--bf-ink); min-height:100vh;
  font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; line-height:1.6;
}
.bf * { box-sizing:border-box; }
.bf-wrap { max-width:760px; margin-inline:auto; padding-inline:20px; }
.bf-capa { background:var(--bf-navy); color:#fff; padding-block:56px 44px; }
.bf-eyebrow { font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:#ffb800; margin:0 0 14px; }
.bf-capa h1 { font-family:Fraunces,Georgia,serif; font-size:clamp(2rem,6vw,3rem); line-height:1.05; margin:0 0 16px; font-weight:700; }
.bf-intro { margin:0; color:#b9bed2; max-width:56ch; }
.bf-status { position:sticky; top:0; z-index:10; background:var(--bf-surface); border-bottom:1px solid var(--bf-line); }
.bf-status-linha { display:flex; justify-content:space-between; gap:12px; padding-block:10px; font-size:13px; color:var(--bf-ink3); flex-wrap:wrap; }
.bf-prog { font-variant-numeric:tabular-nums; }
.bf-main { padding-block:36px 72px; }
.bf-nota { border-left:3px solid var(--bf-accent); background:var(--bf-accent-soft); padding:14px 16px; border-radius:0 8px 8px 0; margin-bottom:28px; font-size:14px; color:var(--bf-ink2); }
.bf-bloco { margin-bottom:40px; }
.bf-bloco h2 { font-family:Fraunces,Georgia,serif; font-size:1.5rem; line-height:1.2; margin:0 0 6px; display:flex; gap:12px; align-items:baseline; }
.bf-num { font-size:12px; font-family:inherit; font-weight:700; color:var(--bf-accent); letter-spacing:.1em; }
.bf-sub { margin:0 0 20px; color:var(--bf-ink3); font-size:14px; }
.bf-campo { background:var(--bf-surface); border:1px solid var(--bf-line); border-radius:10px; padding:18px; margin-bottom:14px; }
.bf-campo--destaque { border-color:var(--bf-accent); }
.bf-pergunta { display:block; font-weight:600; margin:0 0 4px; }
.bf-ajuda { margin:0 0 12px; font-size:13px; color:var(--bf-ink3); }
.bf textarea, .bf input[type=text] { width:100%; font:inherit; font-size:15px; color:var(--bf-ink); background:var(--bf-bg); border:1px solid var(--bf-line); border-radius:6px; padding:10px 12px; }
.bf textarea { min-height:92px; resize:vertical; }
.bf textarea:focus, .bf input:focus { outline:2px solid var(--bf-accent); outline-offset:1px; }
.bf .bf-extra { margin-top:12px; }
.bf-opcoes { display:flex; flex-direction:column; gap:8px; }
.bf-opcoes label { display:flex; gap:10px; align-items:flex-start; font-size:15px; color:var(--bf-ink2); cursor:pointer; }
.bf-opcoes input { margin-top:4px; accent-color:var(--bf-accent); flex-shrink:0; }
.bf-fim { border-top:1px solid var(--bf-line); padding-top:24px; font-size:14px; color:var(--bf-ink3); }
`
