/**
 * Hero (`site-header`) + barra de steps (`steps-bar`) + trilha de progresso
 * (`progress-track`), copiados quase 1:1 do DOM/classes da ficha oficial
 * (idmpsi.com.br/matricula.html — ver matricula-reference.css e o arquivo
 * de referência salvo em scratchpad). Único desvio de conteúdo: a linha de
 * atendimento mostra "Consultor: <nome>" no lugar do `#lancamento-nome`
 * (que na referência é preenchido via query string de campanha, que não
 * existe aqui), e o selo usa a logo real do IDM em vez do <img> com
 * fallback em texto da referência (não precisamos do fallback: o asset
 * está local e não passa por 404).
 */
import { Fragment } from 'react';
import logoIdm from '@/assets/logo-idm.png';

const STEP_LABELS = ['Pessoal', 'Endereço', 'Pagamento'] as const;

export function MatriculaHeader({
  nomeVendedor,
  currentStep,
}: {
  nomeVendedor: string;
  currentStep: 1 | 2 | 3;
}) {
  const progressPct = ((currentStep - 1) / 2) * 100;

  return (
    <>
      <header className="site-header">
        <div className="header-deco"></div>
        <div className="header-inner">

          <div className="header-badge">
            <span className="badge-line"></span>
            <span className="badge-text">Instituto Despertamente</span>
            <span className="badge-line"></span>
          </div>

          <div className="header-seal">
            <img
              src={logoIdm}
              alt="Logo IDM"
              style={{ width: 80, height: 80, objectFit: 'contain' }}
            />
          </div>

          <p className="header-kicker">Formações de Psicanálise</p>

          <h1 className="header-title">
            Ficha de<br /><em>Matrícula Oficial</em>
          </h1>

          <div id="lancamento-nome">
            Consultor: <strong>{nomeVendedor}</strong>
          </div>

          <div className="header-meta">
            <span className="meta-item"><span className="meta-dot"></span>Documento oficial</span>
            <span className="meta-item"><span className="meta-dot"></span>Dados protegidos</span>
            <span className="meta-item"><span className="meta-dot"></span>Preenchimento obrigatório</span>
          </div>

          <div className="anhanguera-badge">
            <div className="anhanguera-rule">
              <span className="anhanguera-label">Parceria oficial</span>
            </div>
            <div className="anhanguera-content">
              <span className="anhanguera-name">Faculdade Anhanguera</span>
              <span className="anhanguera-desc">Formação com Extensão Universitária reconhecida</span>
            </div>
          </div>

        </div>
      </header>

      <nav className="steps-bar" aria-label="Etapas do formulário">
        <div className="steps-inner">
          {STEP_LABELS.map((label, idx) => {
            const stepNum = (idx + 1) as 1 | 2 | 3;
            const isActive = stepNum === currentStep;
            const isDone = stepNum < currentStep;
            return (
              <Fragment key={label}>
                <div className="step-item">
                  <div className={`step-circle${isActive ? ' active' : ''}${isDone ? ' done' : ''}`}>
                    {stepNum}
                  </div>
                  <span className={`step-label${isActive ? ' active' : ''}`}>{label}</span>
                </div>
                {idx < STEP_LABELS.length - 1 && <div className="step-connector"></div>}
              </Fragment>
            );
          })}
        </div>
      </nav>

      <div className="progress-track" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill" style={{ width: `${progressPct}%` }}></div>
      </div>
    </>
  );
}
