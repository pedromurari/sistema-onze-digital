/**
 * Faixa amarela em letreiro (texto passando de lado), a mesma da Black IDM
 * da página de Psicanálise, em versão reutilizável. A lista é repetida o
 * bastante pra encher a largura toda e duplicada pra o loop não ter emenda.
 *
 * O `!important` da animação é de propósito: o globals.css zera toda
 * animação quando o sistema pede menos movimento, e o letreiro é exceção
 * pedida pelo Pedro (no PC dele as animações do Windows estão desligadas).
 */
export function FaixaLetreiro({
  itens,
  selo = 'BLACK IDM',
  compacta = false,
  abaixoDoMenu = false,
}: {
  itens: string[]
  selo?: string
  compacta?: boolean
  /** true na primeira faixa da página: nasce embaixo do menu fixo (73px). */
  abaixoDoMenu?: boolean
}) {
  const repetidos = [...itens, ...itens, ...itens]
  const bloco = (oculto: boolean) => (
    <div className="faixa-letreiro-bloco" aria-hidden={oculto || undefined}>
      {repetidos.map((t, i) => (
        <span key={i} className="inline-flex items-center" style={{ gap: 18, paddingRight: 18 }}>
          {i % itens.length === 0 && (
            <span style={{ background: '#080808', color: 'var(--fds-accent)', padding: '2px 10px', borderRadius: 4, fontSize: 12, letterSpacing: '0.12em' }}>
              {selo}
            </span>
          )}
          <span>{t}</span>
          <span aria-hidden style={{ opacity: 0.55 }}>✦</span>
        </span>
      ))}
    </div>
  )
  return (
    <div
      className="faixa-letreiro overflow-hidden"
      style={{
        background: 'var(--fds-accent)',
        color: '#080808',
        padding: compacta ? '10px 0' : '14px 0',
        marginTop: abaixoDoMenu ? 73 : 0,
        fontWeight: 700,
        fontSize: compacta ? 14 : 15,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      <style>{`
        .faixa-letreiro-trilho { display: flex; width: max-content; animation: faixa-letreiro-passa 40s linear infinite !important; animation-duration: 40s !important; animation-iteration-count: infinite !important; }
        .faixa-letreiro:hover .faixa-letreiro-trilho { animation-play-state: paused; }
        .faixa-letreiro-bloco { display: flex; flex-shrink: 0; }
        @keyframes faixa-letreiro-passa { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      `}</style>
      <div className="faixa-letreiro-trilho">
        {bloco(false)}
        {bloco(true)}
      </div>
    </div>
  )
}
