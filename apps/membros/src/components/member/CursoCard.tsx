/**
 * Card de curso da tela "Meus cursos".
 *
 * Substitui a grade de até 5 colunas de card pequeno, onde o nome da
 * formação não cabia e, com 3 ou 4 cursos, sobrava buraco. Aqui o card é
 * grande e responde a única pergunta que o aluno tem ao abrir a tela: onde
 * eu parei e o que faço agora. O botão muda com o estado do curso.
 */

import Image from 'next/image'
import Link from 'next/link'

type Estado = 'andamento' | 'nao-iniciado' | 'concluido'

export function CursoCard({
  slug,
  titulo,
  capa,
  aulasFeitas,
  totalAulas,
  percentual,
  prioridade = false,
}: {
  slug: string
  titulo: string
  capa: string | null
  aulasFeitas: number
  totalAulas: number
  percentual: number
  prioridade?: boolean
}) {
  const estado: Estado = percentual >= 100 ? 'concluido' : percentual > 0 ? 'andamento' : 'nao-iniciado'
  const href = `/cursos/${slug}`

  const etiqueta = {
    andamento: { texto: 'Em andamento', destaque: true },
    'nao-iniciado': { texto: 'Não iniciado', destaque: false },
    concluido: { texto: 'Concluído', destaque: false },
  }[estado]

  const legenda =
    estado === 'concluido'
      ? 'Concluído · o acesso continua liberado'
      : estado === 'andamento'
        ? `${aulasFeitas} de ${totalAulas} aulas`
        : totalAulas > 0
          ? `${totalAulas} aulas · você ainda não começou`
          : 'Você ainda não começou'

  return (
    <article
      className="flex flex-col overflow-hidden rounded-[10px]"
      style={{
        background: '#09122c',
        border: `1px solid ${estado === 'andamento' ? '#ffb800' : 'rgba(255,255,255,0.09)'}`,
      }}
    >
      <Link href={href} className="relative block aspect-video bg-white/[0.04]">
        {capa && (
          <Image
            src={capa}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            priority={prioridade}
            className="object-cover"
          />
        )}
        <span
          className="absolute left-3.5 top-3.5 rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em]"
          style={
            etiqueta.destaque
              ? { background: '#ffb800', color: '#09122c' }
              : { background: 'rgba(8,9,13,0.75)', color: '#f2f2f3', border: '1px solid rgba(255,255,255,0.25)' }
          }
        >
          {etiqueta.texto}
        </span>
      </Link>

      <div className="flex flex-1 flex-col gap-3.5 p-6">
        <h2 className="font-display text-[21px] font-bold leading-tight text-white">
          <Link href={href}>{titulo}</Link>
        </h2>
        <p className="flex-1 text-sm text-white/50">{legenda}</p>

        {estado === 'andamento' && (
          <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.12]">
              <div className="h-full bg-[#ffb800]" style={{ width: `${Math.round(percentual)}%` }} />
            </div>
            <span className="text-[13px] text-white/50">{Math.round(percentual)}%</span>
          </div>
        )}

        {estado === 'concluido' ? (
          <div className="flex gap-2.5">
            <Link href="/certificados" className="flex-1 rounded bg-[#ffb800] py-3 text-center text-sm font-semibold text-[#09122c]">
              Certificado
            </Link>
            <Link href={href} className="flex-1 rounded border border-white/[0.18] py-3 text-center text-sm font-semibold text-white">
              Rever
            </Link>
          </div>
        ) : (
          <Link
            href={href}
            className={
              estado === 'andamento'
                ? 'rounded bg-[#ffb800] py-3.5 text-center text-[15px] font-semibold text-[#09122c]'
                : 'rounded border border-[#ffb800] py-3.5 text-center text-[15px] font-semibold text-[#ffb800]'
            }
          >
            {estado === 'andamento' ? 'Retomar' : 'Começar agora'}
          </Link>
        )}
      </div>
    </article>
  )
}
