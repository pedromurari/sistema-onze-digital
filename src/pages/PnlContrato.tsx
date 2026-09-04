/**
 * PnlContrato.tsx
 * Ferramenta interna (uso da Helen/equipe) pra registrar no CRM as
 * matrículas de PNL Practitioner/Master vendidas manualmente por WhatsApp
 * (preço e parcelas negociados caso a caso, cobrança feita por fora via
 * link avulso de Mercado Pago/Asaas -- ver contexto da conversa com o dono
 * do produto em 2026-09-04). Diferente de MatriculaTimeComercial.tsx (fluxo
 * público da psicanálise com pagamento automatizado), aqui não existe
 * gateway de pagamento nenhum: o único objetivo é (1) deixar o aluno
 * registrado no financeiro/CRM e (2) gerar e enviar o contrato
 * automaticamente (Autentique + WhatsApp) -- pedido explícito: "preciso
 * pelo menos de um contrato".
 *
 * Página única (sem wizard de passos, diferente da psicanálise) -- forma
 * de pagamento é digitada livremente pela Helen (valor/parcelas), não um
 * plano tabelado.
 *
 * URL: /pnl-contrato
 */
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import logoIdm from '@/assets/logo-idm.png';

import './matricula/matricula-reference.css';
import { ensurePoppinsFontLoaded } from './matricula/theme';
import { StepPersonal, type DadosPessoais } from './matricula/StepPersonal';
import { StepAddress, type DadosEndereco } from './matricula/StepAddress';
import { ObrigadoScreen } from './matricula/ObrigadoScreen';

const SUPABASE_FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const PRODUTOS = [
  { value: 'pnl-practitioner', label: 'PNL Practitioner' },
  { value: 'pnl-master', label: 'PNL Master' },
] as const;

const FORMAS_PAGAMENTO = [
  { value: 'avista', label: 'À vista' },
  { value: 'cartao', label: 'Cartão de crédito' },
  { value: 'boleto', label: 'Boleto' },
] as const;

const formatCPF = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

const formatCEP = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.replace(/(\d{5})(\d)/, '$1-$2');
};

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface DadosPagamento {
  produto: '' | 'pnl-practitioner' | 'pnl-master';
  formaPagamento: '' | 'avista' | 'cartao' | 'boleto';
  valorParcela: string;
  numParcelas: string;
  diaVencimento: string;
}

export default function PnlContrato() {
  useState(() => { ensurePoppinsFontLoaded(); return null; });

  const [dadosPessoais, setDadosPessoais] = useState<DadosPessoais>({
    nome: '', email: '', whatsapp: '', cpf: '', rg: '', sexo: '',
    nascDia: '', nascMes: '', nascAno: '',
  });
  const [dadosEndereco, setDadosEndereco] = useState<DadosEndereco>({
    pais: 'Brasil', cep: '', endereco: '', cidadeEstado: '',
  });
  const [pagamento, setPagamento] = useState<DadosPagamento>({
    produto: '', formaPagamento: '', valorParcela: '', numParcelas: '1', diaVencimento: '',
  });
  const [declaracao, setDeclaracao] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [erro, setErro] = useState('');
  const [done, setDone] = useState(false);
  const [linkContrato, setLinkContrato] = useState('');

  if (done) {
    return (
      <div className="idm-matricula">
        <ObrigadoScreen nome={dadosPessoais.nome} />
        {linkContrato && (
          <p style={{ textAlign: 'center', marginTop: -60, position: 'relative', zIndex: 1, color: '#F5F0E4', fontSize: '0.8125rem' }}>
            Link do contrato (caso precise reenviar): <a href={linkContrato} target="_blank" rel="noreferrer" style={{ color: '#F5F0E4' }}>{linkContrato}</a>
          </p>
        )}
      </div>
    );
  }

  const cpfDigits = dadosPessoais.cpf.replace(/\D/g, '');
  const dataNascimento = (dadosPessoais.nascDia && dadosPessoais.nascMes && dadosPessoais.nascAno)
    ? `${dadosPessoais.nascAno}-${dadosPessoais.nascMes}-${dadosPessoais.nascDia}`
    : '';

  const valorParcelaNum = Number(pagamento.valorParcela.replace(',', '.'));
  const numParcelasNum = Number(pagamento.numParcelas);
  const diaVencimentoNum = Number(pagamento.diaVencimento);

  const pessoalOk =
    dadosPessoais.nome.trim().length > 0 &&
    dadosPessoais.email.trim().length > 0 &&
    dadosPessoais.whatsapp.trim().length > 0 &&
    cpfDigits.length === 11 &&
    dadosPessoais.rg.trim().length > 0 &&
    dadosPessoais.sexo.trim().length > 0 &&
    dataNascimento.length > 0;

  const enderecoOk =
    dadosEndereco.pais.trim().length > 0 &&
    dadosEndereco.cep.trim().length > 0 &&
    dadosEndereco.endereco.trim().length > 0 &&
    dadosEndereco.cidadeEstado.trim().length > 0;

  const pagamentoOk =
    pagamento.produto !== '' &&
    pagamento.formaPagamento !== '' &&
    valorParcelaNum > 0 &&
    numParcelasNum >= 1 &&
    (pagamento.formaPagamento !== 'boleto' || (diaVencimentoNum >= 1 && diaVencimentoNum <= 28));

  const podeEnviar = pessoalOk && enderecoOk && pagamentoOk && declaracao && !submitting;

  const valorTotal = valorParcelaNum > 0 && numParcelasNum >= 1 ? valorParcelaNum * numParcelasNum : 0;

  const handleSubmit = async () => {
    if (!podeEnviar) return;
    setErro('');
    setSubmitting(true);

    try {
      const { data, error } = await (supabase as any).rpc('pnl_matricula_criar', {
        p_nome: dadosPessoais.nome.trim(),
        p_email: dadosPessoais.email.trim() || null,
        p_whatsapp: dadosPessoais.whatsapp.trim() || null,
        p_cpf: dadosPessoais.cpf.trim() || null,
        p_rg: dadosPessoais.rg.trim() || null,
        p_sexo: dadosPessoais.sexo || null,
        p_data_nascimento: dataNascimento || null,
        p_pais: dadosEndereco.pais.trim() || null,
        p_endereco: dadosEndereco.endereco.trim() || null,
        p_cep: dadosEndereco.cep.trim() || null,
        p_cidade_estado: dadosEndereco.cidadeEstado.trim() || null,
        p_produto: pagamento.produto,
        p_forma_pagamento: pagamento.formaPagamento,
        p_valor_parcela: valorParcelaNum,
        p_num_parcelas: numParcelasNum,
        p_dia_vencimento: pagamento.formaPagamento === 'boleto' ? diaVencimentoNum : null,
        p_vendedor: 'Helen Magna',
      });

      if (error) {
        console.error('[PnlContrato] erro de transporte/permissão na RPC', error);
        setErro('Ocorreu um erro, tente novamente. Se persistir, avise a equipe.');
        setSubmitting(false);
        return;
      }

      if (!data?.ok) {
        if (data?.erro === 'ja_matriculado') {
          setErro('Este e-mail ou telefone já está matriculado. Confira os dados.');
        } else {
          console.error('[PnlContrato] RPC recusou a matrícula', data);
          setErro('Ocorreu um erro, tente novamente. Se persistir, avise a equipe.');
        }
        setSubmitting(false);
        return;
      }

      const alunoId = data.aluno_id as string;

      const respContrato = await fetch(`${SUPABASE_FUNCTIONS_URL}/pnl-contrato-criar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aluno_id: alunoId,
          cpf: dadosPessoais.cpf.trim(),
          data_nascimento: dataNascimento,
          endereco: dadosEndereco.endereco.trim(),
          cep: dadosEndereco.cep.trim(),
          cidade_estado: dadosEndereco.cidadeEstado.trim(),
        }),
      }).then(r => r.json()).catch(() => null);

      if (respContrato?.link_assinatura) {
        setLinkContrato(respContrato.link_assinatura);
      } else {
        console.error('[PnlContrato] contrato não gerado', respContrato);
        setErro('Matrícula registrada, mas o contrato não foi gerado automaticamente. Avise a equipe pra gerar manualmente.');
      }

      setSubmitting(false);
      setDone(true);
    } catch (err) {
      console.error('[PnlContrato] falha inesperada', err);
      setErro('Ocorreu um erro, tente novamente. Se persistir, avise a equipe.');
      setSubmitting(false);
    }
  };

  return (
    <div className="idm-matricula">
      <header className="site-header">
        <div className="header-deco"></div>
        <div className="header-inner">
          <div className="header-badge">
            <span className="badge-line"></span>
            <span className="badge-text">Instituto Despertamente</span>
            <span className="badge-line"></span>
          </div>
          <div className="header-seal">
            <img src={logoIdm} alt="Logo IDM" style={{ width: 80, height: 80, objectFit: 'contain' }} />
          </div>
          <p className="header-kicker">PNL Practitioner &amp; Master</p>
          <h1 className="header-title">
            Registro de<br /><em>Matrícula &amp; Contrato</em>
          </h1>
          <div id="lancamento-nome">Uso interno — Time Comercial</div>
          <div className="header-meta">
            <span className="meta-item"><span className="meta-dot"></span>Preencher após pagamento confirmado</span>
            <span className="meta-item"><span className="meta-dot"></span>Gera contrato automaticamente</span>
          </div>
        </div>
      </header>

      <main>
        <div className="form-shell">
          <form
            id="pnl-contrato-form"
            noValidate
            onSubmit={e => { e.preventDefault(); handleSubmit(); }}
          >
            <StepPersonal
              dados={dadosPessoais}
              onChange={(campo, valor) => {
                if (campo === 'cpf') setDadosPessoais(d => ({ ...d, cpf: formatCPF(valor as string) }));
                else setDadosPessoais(d => ({ ...d, [campo]: valor }));
              }}
            />

            <StepAddress
              dados={dadosEndereco}
              onChange={(campo, valor) => {
                if (campo === 'cep') setDadosEndereco(d => ({ ...d, cep: formatCEP(valor as string) }));
                else setDadosEndereco(d => ({ ...d, [campo]: valor }));
              }}
            />

            <section className="form-section" id="section-pagamento-pnl">
              <div className="section-header" style={{ position: 'relative' }}>
                <div className="section-num" aria-hidden="true">03</div>
                <p className="section-eyebrow">Seção 03</p>
                <h2 className="section-title">Produto e Condição Negociada</h2>
              </div>
              <div className="section-rule"></div>

              <div className="field-grid cols-2">
                <div className="field">
                  <label className="field-label" htmlFor="produto">Produto <span className="field-required">*</span></label>
                  <div className="field-control">
                    <select
                      id="produto" value={pagamento.produto}
                      onChange={e => setPagamento(p => ({ ...p, produto: e.target.value as DadosPagamento['produto'] }))}
                    >
                      <option value="">Selecione</option>
                      {PRODUTOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="forma_pagamento">Forma de pagamento <span className="field-required">*</span></label>
                  <div className="field-control">
                    <select
                      id="forma_pagamento" value={pagamento.formaPagamento}
                      onChange={e => setPagamento(p => ({ ...p, formaPagamento: e.target.value as DadosPagamento['formaPagamento'] }))}
                    >
                      <option value="">Selecione</option>
                      {FORMAS_PAGAMENTO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="valor_parcela">
                    {pagamento.numParcelas === '1' ? 'Valor' : 'Valor da parcela'} <span className="field-required">*</span>
                  </label>
                  <div className="field-control">
                    <input
                      type="text" id="valor_parcela" inputMode="decimal" placeholder="Ex: 75,00"
                      value={pagamento.valorParcela}
                      onChange={e => setPagamento(p => ({ ...p, valorParcela: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="num_parcelas">Número de parcelas <span className="field-required">*</span></label>
                  <div className="field-control">
                    <input
                      type="number" id="num_parcelas" min={1} max={24} placeholder="Ex: 8"
                      value={pagamento.numParcelas}
                      onChange={e => setPagamento(p => ({ ...p, numParcelas: e.target.value }))}
                    />
                  </div>
                </div>

                {pagamento.formaPagamento === 'boleto' && (
                  <div className="field">
                    <label className="field-label" htmlFor="dia_vencimento">Dia de vencimento <span className="field-required">*</span></label>
                    <div className="field-control">
                      <input
                        type="number" id="dia_vencimento" min={1} max={28} placeholder="Ex: 10"
                        value={pagamento.diaVencimento}
                        onChange={e => setPagamento(p => ({ ...p, diaVencimento: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
              </div>

              {valorTotal > 0 && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 'var(--space-3)' }}>
                  Total: <strong>R$ {fmtBRL(valorTotal)}</strong>
                  {numParcelasNum > 1 ? ` (${numParcelasNum}x de R$ ${fmtBRL(valorParcelaNum)})` : ''}
                </p>
              )}
            </section>

            <div className="submit-zone">
              <div className="submit-declaration">
                <p>
                  Confirmo que o pagamento desta matrícula já foi negociado e cobrado (link avulso), e que os dados
                  acima conferem com o que foi combinado com o aluno para geração do contrato.
                </p>
              </div>

              <label
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 'var(--space-4)', cursor: 'pointer',
                  fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5,
                }}
              >
                <input
                  type="checkbox" checked={declaracao} onChange={e => setDeclaracao(e.target.checked)}
                  style={{ marginTop: 3, width: 15, height: 15, accentColor: 'var(--navy)', flexShrink: 0, cursor: 'pointer' }}
                />
                <span>Confirmo os dados acima.</span>
              </label>

              <button
                type="submit"
                className={`btn-submit${submitting ? ' loading' : ''}`}
                aria-label="Registrar matrícula e gerar contrato"
                style={{ width: '100%' }}
                disabled={!podeEnviar}
              >
                <span className="btn-text">Registrar matrícula e gerar contrato</span>
                <span className="btn-icon" aria-hidden="true">→</span>
                <span className="btn-spinner" aria-hidden="true"></span>
              </button>

              {erro && <div className="global-error show" role="alert">{erro}</div>}
            </div>
          </form>
        </div>
      </main>

      <footer className="site-footer">
        <p className="footer-logo">IDM — Instituto Despertamente</p>
        <div className="footer-rule"></div>
        <p className="footer-note">Ferramenta interna · PNL Practitioner &amp; Master</p>
      </footer>
    </div>
  );
}
