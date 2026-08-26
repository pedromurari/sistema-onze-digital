/**
 * §1 Dados Pessoais — markup copiado quase 1:1 da seção `#section-personal`
 * da referência (field-grid cols-2, mesmos labels/placeholders/ordem de
 * campos), com a data de nascimento em 3 <select> (dia/mês/ano) como no
 * original em vez do <input type="date"> nativo que a versão anterior
 * desta página usava.
 */
import { useMemo } from 'react';

export interface DadosPessoais {
  nome: string;
  email: string;
  whatsapp: string;
  cpf: string;
  rg: string;
  sexo: string;
  nascDia: string;
  nascMes: string;
  nascAno: string;
}

const MESES = [
  ['01', 'Janeiro'], ['02', 'Fevereiro'], ['03', 'Março'], ['04', 'Abril'],
  ['05', 'Maio'], ['06', 'Junho'], ['07', 'Julho'], ['08', 'Agosto'],
  ['09', 'Setembro'], ['10', 'Outubro'], ['11', 'Novembro'], ['12', 'Dezembro'],
] as const;

export function StepPersonal({
  dados, onChange,
}: {
  dados: DadosPessoais;
  onChange: <K extends keyof DadosPessoais>(campo: K, valor: DadosPessoais[K]) => void;
}) {
  const dias = useMemo(() => Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')), []);
  const anos = useMemo(() => {
    const anoAtual = new Date().getFullYear();
    const out: number[] = [];
    for (let a = anoAtual - 10; a >= anoAtual - 100; a--) out.push(a);
    return out;
  }, []);

  return (
    <section className="form-section" id="section-personal">
      <div className="section-header" style={{ position: 'relative' }}>
        <div className="section-num" aria-hidden="true">01</div>
        <p className="section-eyebrow">Seção 01</p>
        <h2 className="section-title">Dados Pessoais</h2>
      </div>
      <div className="section-rule"></div>

      <div className="field-grid cols-2">

        <div className="field span-full">
          <label className="field-label" htmlFor="nome">Nome completo <span className="field-required">*</span></label>
          <div className="field-control">
            <input
              type="text" id="nome" name="nome" autoComplete="name"
              placeholder="Conforme documento de identidade"
              value={dados.nome} onChange={e => onChange('nome', e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="email">E-mail <span className="field-required">*</span></label>
          <div className="field-control">
            <input
              type="email" id="email" name="email" autoComplete="email"
              placeholder="seu@email.com"
              value={dados.email} onChange={e => onChange('email', e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="telefone">Telefone / WhatsApp <span className="field-required">*</span></label>
          <div className="field-control">
            <input
              type="tel" id="telefone" name="telefone" autoComplete="tel"
              placeholder="+55 (11) 9 0000-0000"
              value={dados.whatsapp} onChange={e => onChange('whatsapp', e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="cpf">CPF <span className="field-required">*</span></label>
          <div className="field-control">
            <input
              type="text" id="cpf" name="cpf" maxLength={14} inputMode="numeric"
              placeholder="000.000.000-00"
              value={dados.cpf} onChange={e => onChange('cpf', e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label">Data de nascimento <span className="field-required">*</span></label>
          <div className="field-control">
            <div className="date-selects" id="date-nascimento-wrap">
              <select aria-label="Dia" id="nasc-dia" value={dados.nascDia} onChange={e => onChange('nascDia', e.target.value)}>
                <option value="">Dia</option>
                {dias.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select aria-label="Mês" id="nasc-mes" value={dados.nascMes} onChange={e => onChange('nascMes', e.target.value)}>
                <option value="">Mês</option>
                {MESES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
              <select aria-label="Ano" id="nasc-ano" value={dados.nascAno} onChange={e => onChange('nascAno', e.target.value)}>
                <option value="">Ano</option>
                {anos.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="rg">RG <span className="field-required">*</span></label>
          <div className="field-control">
            <input
              type="text" id="rg" name="rg" maxLength={20}
              placeholder="Número do RG"
              value={dados.rg} onChange={e => onChange('rg', e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="sexo">Sexo <span className="field-required">*</span></label>
          <div className="field-control">
            <select id="sexo" name="sexo" value={dados.sexo} onChange={e => onChange('sexo', e.target.value)}>
              <option value="">Selecione</option>
              <option value="Masculino">Masculino</option>
              <option value="Feminino">Feminino</option>
              <option value="Outro">Outro</option>
              <option value="Prefiro não informar">Prefiro não informar</option>
            </select>
          </div>
        </div>

      </div>
    </section>
  );
}
