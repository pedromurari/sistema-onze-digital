/**
 * §2 Endereço — markup copiado quase 1:1 da seção `#section-address` da
 * referência.
 */
export interface DadosEndereco {
  pais: string;
  cep: string;
  endereco: string;
  cidadeEstado: string;
}

export function StepAddress({
  dados, onChange,
}: {
  dados: DadosEndereco;
  onChange: <K extends keyof DadosEndereco>(campo: K, valor: DadosEndereco[K]) => void;
}) {
  return (
    <section className="form-section" id="section-address">
      <div className="section-header" style={{ position: 'relative' }}>
        <div className="section-num" aria-hidden="true">02</div>
        <p className="section-eyebrow">Seção 02</p>
        <h2 className="section-title">Endereço</h2>
      </div>
      <div className="section-rule"></div>

      <div className="field-grid cols-2">

        <div className="field">
          <label className="field-label" htmlFor="pais">País <span className="field-required">*</span></label>
          <div className="field-control">
            <input
              type="text" id="pais" name="pais" placeholder="Brasil"
              value={dados.pais} onChange={e => onChange('pais', e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="cep">CEP <span className="field-required">*</span></label>
          <div className="field-control">
            <input
              type="text" id="cep" name="cep" maxLength={9} inputMode="numeric"
              placeholder="00000-000"
              value={dados.cep} onChange={e => onChange('cep', e.target.value)}
            />
          </div>
        </div>

        <div className="field span-full">
          <label className="field-label" htmlFor="endereco">Endereço completo com número <span className="field-required">*</span></label>
          <div className="field-control">
            <textarea
              id="endereco" name="endereco" rows={3}
              placeholder="Rua / Avenida, número, complemento, bairro"
              value={dados.endereco} onChange={e => onChange('endereco', e.target.value)}
            />
          </div>
        </div>

        <div className="field span-full">
          <label className="field-label" htmlFor="cidade_estado">Cidade / Estado <span className="field-required">*</span></label>
          <div className="field-control">
            <input
              type="text" id="cidade_estado" name="cidade_estado" placeholder="São Paulo / SP"
              value={dados.cidadeEstado} onChange={e => onChange('cidadeEstado', e.target.value)}
            />
          </div>
        </div>

      </div>
    </section>
  );
}
