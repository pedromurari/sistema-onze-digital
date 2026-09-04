/**
 * §3 Pagamento — markup copiado quase 1:1 da seção `#section-payment` da
 * referência (venc-grupos: boleto com pills de dia, cartão e PIX como
 * opção única, bolsa de estudo com gate de código) + a `submit-zone`
 * (declaração + botão "Confirmar minha matrícula").
 *
 * Diferença de conteúdo: a referência oferece boleto OU cartão como
 * "parcelado" (SyncPay decide na página seguinte); aqui cada forma já é
 * uma opção própria porque o RPC `matricula_time_comercial_criar` espera
 * uma forma de pagamento definida neste mesmo passo (boleto/cartão/PIX/
 * bolsa cobram por integrações diferentes no passo seguinte).
 */
import { useState } from 'react';

export type VencimentoRadio = '' | '10' | '20' | '30' | 'outro' | 'cartao_parcelado' | 'cartao_recorrente' | 'a_vista' | 'cortesia';

const DIAS_BOLETO: Array<'10' | '20' | '30'> = ['10', '20', '30'];

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function StepPayment({
  vencimentoRadio, onSelecionar,
  diaOutro, onDiaOutroChange,
  codigoBolsa, onCodigoBolsaChange,
  bolsaValidada, onValidarBolsa,
  declaracao, onDeclaracaoChange,
  submitting, podeEnviar, erro,
  onSubmit, onVoltar,
  plano,
}: {
  vencimentoRadio: VencimentoRadio;
  onSelecionar: (v: VencimentoRadio) => void;
  diaOutro: string;
  onDiaOutroChange: (v: string) => void;
  codigoBolsa: string;
  onCodigoBolsaChange: (v: string) => void;
  bolsaValidada: boolean;
  onValidarBolsa: () => void;
  declaracao: boolean;
  onDeclaracaoChange: (v: boolean) => void;
  submitting: boolean;
  podeEnviar: boolean;
  erro: string;
  onSubmit: () => void;
  onVoltar: () => void;
  plano: { avista: number; parcela: number };
}) {
  const [gateMsg, setGateMsg] = useState('');

  const handleValidar = () => {
    if (!codigoBolsa.trim()) {
      setGateMsg('Digite o código para continuar.');
      return;
    }
    setGateMsg('');
    onValidarBolsa();
  };

  return (
    <>
      <section className="form-section" id="section-payment">
        <div className="section-header" style={{ position: 'relative' }}>
          <div className="section-num" aria-hidden="true">03</div>
          <p className="section-eyebrow">Seção 03</p>
          <h2 className="section-title">Vencimento das Faturas</h2>
        </div>
        <div className="section-rule"></div>

        <div className="field">
          <label className="field-label">Como prefere pagar? <span className="field-required">*</span></label>

          <div className="venc-grupos" id="venc-grid">

            {/* GRUPO CARTÃO PARCELADO (1x a 12x, uma única cobrança -- juros de
                2x em diante calculados pela MP a partir do valor à vista) */}
            <div className={`venc-grupo${vencimentoRadio === 'cartao_parcelado' ? ' has-selection' : ''}`}>
              <div className="venc-grupo-header">
                <span className="venc-grupo-icon">💳</span>
                <div>
                  <div className="venc-grupo-title">Cartão parcelado</div>
                  <div className="venc-grupo-desc">De 1x a 12x no cartão · R$ {fmtBRL(plano.avista)} à vista, ou parcelado com juros</div>
                </div>
              </div>
              <div className="venc-grupo-body">
                <label className={`venc-option-single${vencimentoRadio === 'cartao_parcelado' ? ' selected' : ''}`}>
                  <input type="radio" name="dia_vencimento" value="cartao_parcelado" checked={vencimentoRadio === 'cartao_parcelado'} onChange={() => onSelecionar('cartao_parcelado')} />
                  <span className="venc-option-text">Vou pagar no cartão, à vista ou parcelado</span>
                </label>
              </div>
            </div>

            {/* GRUPO CARTÃO RECORRENTE (assinatura, 15 cobranças mensais) */}
            <div className={`venc-grupo${vencimentoRadio === 'cartao_recorrente' ? ' has-selection' : ''}`}>
              <div className="venc-grupo-header">
                <span className="venc-grupo-icon">🔄</span>
                <div>
                  <div className="venc-grupo-title">Cartão recorrente</div>
                  <div className="venc-grupo-desc">15x de R$ {fmtBRL(plano.parcela)} · cobrança mensal automática no cartão</div>
                </div>
              </div>
              <div className="venc-grupo-body">
                <label className={`venc-option-single${vencimentoRadio === 'cartao_recorrente' ? ' selected' : ''}`}>
                  <input type="radio" name="dia_vencimento" value="cartao_recorrente" checked={vencimentoRadio === 'cartao_recorrente'} onChange={() => onSelecionar('cartao_recorrente')} />
                  <span className="venc-option-text">Vou pagar no cartão, assinatura mensal</span>
                </label>
              </div>
            </div>

            {/* GRUPO BOLETO RECORRENTE (15x, 1ª parcela no PIX, depois boleto mensal) */}
            <div className={`venc-grupo${['10', '20', '30', 'outro'].includes(vencimentoRadio) ? ' has-selection' : ''}`}>
              <div className="venc-grupo-header">
                <span className="venc-grupo-icon">📄</span>
                <div>
                  <div className="venc-grupo-title">Boleto recorrente</div>
                  <div className="venc-grupo-desc">15x de R$ {fmtBRL(plano.parcela)} · Escolha o melhor dia de vencimento</div>
                  <div className="venc-grupo-desc" style={{ marginTop: 2 }}>1ª parcela no PIX, depois boleto mensal</div>
                </div>
              </div>
              <div className="venc-grupo-body">
                <div className="venc-sub-grid">
                  {DIAS_BOLETO.map(dia => (
                    <label key={dia} className={`venc-option${vencimentoRadio === dia ? ' selected' : ''}`}>
                      <input type="radio" name="dia_vencimento" value={dia} checked={vencimentoRadio === dia} onChange={() => onSelecionar(dia)} />
                      <span className="venc-option-text">Dia {dia}</span>
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <label className={`venc-option${vencimentoRadio === 'outro' ? ' selected' : ''}`} style={{ width: '100%' }}>
                    <input type="radio" name="dia_vencimento" value="outro" checked={vencimentoRadio === 'outro'} onChange={() => onSelecionar('outro')} />
                    <span className="venc-option-text">Outro dia</span>
                  </label>
                </div>
                <div className={`outro-field-wrap${vencimentoRadio === 'outro' ? ' show' : ''}`}>
                  <input
                    type="number" min={1} max={28} placeholder="Qual dia prefere? (1-28)"
                    value={diaOutro} onChange={e => onDiaOutroChange(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* GRUPO À VISTA */}
            <div className={`venc-grupo${vencimentoRadio === 'a_vista' ? ' has-selection' : ''}`}>
              <div className="venc-grupo-header">
                <span className="venc-grupo-icon">⚡</span>
                <div>
                  <div className="venc-grupo-title">PIX à vista</div>
                  <div className="venc-grupo-desc">R$ {fmtBRL(plano.avista)} · Melhor valor</div>
                </div>
              </div>
              <div className="venc-grupo-body">
                <label className={`venc-option-single${vencimentoRadio === 'a_vista' ? ' selected' : ''}`}>
                  <input type="radio" name="dia_vencimento" value="a_vista" checked={vencimentoRadio === 'a_vista'} onChange={() => onSelecionar('a_vista')} />
                  <span className="venc-option-text">Vou pagar à vista no PIX</span>
                </label>
              </div>
            </div>

            {/* GRUPO BOLSA */}
            <div className={`venc-grupo${vencimentoRadio === 'cortesia' ? ' has-selection' : ''}`}>
              <div className="venc-grupo-header">
                <span className="venc-grupo-icon">🎓</span>
                <div>
                  <div className="venc-grupo-title">Bolsa de Estudo</div>
                  <div className="venc-grupo-desc">Acesso exclusivo mediante código de autorização</div>
                </div>
              </div>
              <div className="venc-grupo-body">

                {!bolsaValidada && (
                  <div className="cortesia-gate">
                    <p className="cortesia-gate-text">Recebeu uma bolsa de estudo da nossa equipe? Digite o código de autorização para liberar esta opção.</p>
                    <div className="cortesia-gate-row">
                      <input
                        type="text" placeholder="Código de autorização" autoComplete="off"
                        value={codigoBolsa}
                        onChange={e => { onCodigoBolsaChange(e.target.value); setGateMsg(''); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleValidar(); } }}
                      />
                      <button type="button" className="btn-cortesia-validar" onClick={handleValidar}>Validar</button>
                    </div>
                    {gateMsg && <span className="cortesia-gate-msg show error">{gateMsg}</span>}
                  </div>
                )}

                {bolsaValidada && (
                  <label className={`venc-option-single${vencimentoRadio === 'cortesia' ? ' selected' : ''}`}>
                    <input type="radio" name="dia_vencimento" value="cortesia" checked={vencimentoRadio === 'cortesia'} onChange={() => onSelecionar('cortesia')} />
                    <span className="venc-option-text">✓ Bolsa de estudo autorizada — código validado</span>
                  </label>
                )}

              </div>
            </div>

          </div>
        </div>
      </section>

      <div className="submit-zone">

        <div className="submit-declaration">
          <p>
            Ao enviar esta ficha, declaro que as informações prestadas são verdadeiras e autorizo o
            Instituto Despertamente — IDM a utilizá-las para fins de matrícula e emissão do contrato de formação.
          </p>
        </div>

        <label
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 'var(--space-4)', cursor: 'pointer',
            fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5,
          }}
        >
          <input
            type="checkbox" checked={declaracao} onChange={e => onDeclaracaoChange(e.target.checked)}
            style={{ marginTop: 3, width: 15, height: 15, accentColor: 'var(--navy)', flexShrink: 0, cursor: 'pointer' }}
          />
          <span>Li e estou de acordo com a declaração acima.</span>
        </label>

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button
            type="button"
            className="btn-submit"
            style={{ background: 'transparent', color: 'var(--navy)', border: '1.5px solid var(--border)', flex: '0 0 auto', width: 120 }}
            onClick={onVoltar}
            disabled={submitting}
          >
            <span className="btn-text">Voltar</span>
          </button>

          <button
            type="submit"
            className={`btn-submit${submitting ? ' loading' : ''}`}
            aria-label="Confirmar matrícula"
            style={{ flex: 1 }}
            disabled={!podeEnviar}
            onClick={onSubmit}
          >
            <span className="btn-text">Confirmar minha matrícula</span>
            <span className="btn-icon" aria-hidden="true">→</span>
            <span className="btn-spinner" aria-hidden="true"></span>
          </button>
        </div>

        <p className="submit-subtext">
          <span className="lock-icon">🔒</span>
          Seus dados são criptografados e protegidos
        </p>

        {erro && <div className="global-error show" role="alert">{erro}</div>}

      </div>
    </>
  );
}
