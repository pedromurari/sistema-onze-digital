/**
 * MatriculaTimeComercial.tsx
 * Página pública isolada (sem login, sem chrome da app).
 * URL: /matricula/:vendedor
 *
 * Ficha de matrícula paralela, hospedada no nosso próprio app, para o time
 * comercial usar enquanto o formulário externo (matricula.html no idmpsi.com.br)
 * está com o bug "permission denied for table leads" no backend deles.
 *
 * Visual: reconstruído para bater com a ficha oficial em produção
 * (idmpsi.com.br/matricula.html). O CSS em si é o <style> daquela página
 * extraído quase 1:1 e escopado sob `.idm-matricula` — ver
 * src/pages/matricula/matricula-reference.css. O DOM das seções (header,
 * steps, §1/§2/§3, submit, footer) segue as mesmas classes/estrutura da
 * referência, só trocando os elementos por componentes React controlados.
 * Wizard real de 3 passos (Pessoal → Endereço → Pagamento), diferente da
 * referência que é scroll único — pedido explícito do dono do produto.
 *
 * Chama a RPC SECURITY DEFINER `matricula_time_comercial_criar` — já criada e
 * testada manualmente por SQL. A lógica de cobrança (Mercado Pago: Pix,
 * boleto, Card Payment Brick) já está testada em produção e não foi
 * alterada aqui — só o layout ao redor dela.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Loader2,
  QrCode,
  Copy,
  XCircle,
  CheckCircle2,
} from 'lucide-react';

import './matricula/matricula-reference.css';
import { ensurePoppinsFontLoaded } from './matricula/theme';
import { MatriculaHeader } from './matricula/MatriculaHeader';
import { StepPersonal, type DadosPessoais } from './matricula/StepPersonal';
import { StepAddress, type DadosEndereco } from './matricula/StepAddress';
import { StepPayment, type VencimentoRadio } from './matricula/StepPayment';
import { ObrigadoScreen } from './matricula/ObrigadoScreen';

declare global {
  interface Window { MercadoPago: any; }
}

// ─── Vendedores válidos (roster atual do Time Comercial — ver src/lib/vendedores.ts) ──
// Aline saiu do time; INITIAL_VENDORS hoje tem só Helen e Miguel. Mapeamos slug → nome
// completo aqui (não importamos INITIAL_VENDORS porque o slug de URL é uma decisão desta
// página, não do modelo de dados do CRM).
//
// "direto" (2026-09-03): link genérico pra venda sem vendedor definido (ex:
// campanha direta, indicação). Rótulo só de exibição -- NUNCA vira
// vendedor_id de verdade (ver SEM_VENDEDOR_ATRIBUIDO abaixo), pra cair como
// "sem turma/sem dono" pra qualquer um da equipe reivindicar, em vez de virar
// um vendedor fantasma no faturamento por vendedor.
const VENDEDORES: Record<string, string> = {
  helen: 'Helen Magna',
  miguel: 'Miguel Fogaça',
  direto: 'Equipe Instituto Despertamente',
  promo: 'Equipe Instituto Despertamente',
};

const SEM_VENDEDOR_ATRIBUIDO = new Set(['direto', 'promo']);

// WhatsApp de cada vendedor (com DDI 55, só dígitos) — usado pra redirecionar
// o aluno assim que o pagamento é confirmado, com uma mensagem pronta de
// "finalizei a matrícula", pedido explícito do dono do produto. "direto" e
// "promo" vão pro WhatsApp do financeiro (disp3/"Financeiro IDM"), já que
// não tem consultora dona pra assumir a conversa.
const VENDEDOR_WHATSAPP: Record<string, string> = {
  helen: '5511965781940',
  miguel: '5511932203852',
  direto: '5511976736081',
  promo: '5511976736081',
};

// ─── Planos de preço por slug ───────────────────────────────────────────────
// Quantidade de parcelas é sempre a mesma (1x a 12x cartão parcelado, 15x
// boleto/recorrente) -- só o valor muda. "promo" (2026-09-04): condição
// antiga reativada pra uma venda específica (R$997 à vista, R$110/mês nas
// demais formas), em vez do padrão atual (R$1.500/R$150).
//
// cartaoBase (2026-09-04) é DIFERENTE de avista de propósito: é o valor que
// alimenta o Card Payment Brick pra calcular o parcelamento (1x a 12x) --
// não pode ser o preço com desconto do PIX/à vista, senão os juros da MP
// incidem sobre um valor menor do que deveriam e a parcela de 12x fica
// abaixo do anunciado. Os dois valores foram achados no simulador de taxas
// do próprio Mercado Pago (Cobrar > Link de pagamento > "Detalhes do
// parcelamento"), conferidos pelo dono do produto: "promo" preço-base
// R$1.080,00 -> 12x de R$109,90 (bate com o anunciado "12x de R$110");
// "padrao" preço-base R$1.474,10 -> 12x de R$150,00 (bate exato).
const PLANOS: Record<string, { avista: number; parcela: number; cartaoBase: number }> = {
  padrao: { avista: 1500, parcela: 150, cartaoBase: 1474.10 },
  promo: { avista: 997, parcela: 110, cartaoBase: 1080 },
};

const planoDoSlug = (slug: string): keyof typeof PLANOS => (slug.toLowerCase() === 'promo' ? 'promo' : 'padrao');

// Forma aceita pela RPC matricula_time_comercial_criar. Desde 2026-09-03,
// 'cartao' (parcelado, 1 transação só) e 'cartao_recorrente' (assinatura,
// 12 cobranças mensais reais) gravam valores DIFERENTES em
// alunos.forma_pagamento -- antes os dois gravavam só 'cartao', e não dava
// pra saber depois qual era qual (nem pra parcelasAluno.ts tratar direito:
// parcelado pré-marca as 12 parcelas como pagas, recorrente não pode).
type FormaPagamento = 'avista' | 'cartao' | 'cartao_recorrente' | 'boleto' | 'bolsa';

type MetodoPagamentoUI = 'avista' | 'cartao_parcelado' | 'cartao_recorrente' | 'boleto' | 'bolsa';

const formaRpcDe = (m: MetodoPagamentoUI): FormaPagamento =>
  m === 'cartao_parcelado' ? 'cartao' : m;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Telas auxiliares ───────────────────────────────────────────────────────────

function ScreenLinkInvalido() {
  return (
    <div className="idm-matricula">
      <div id="error-screen" className="show">
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', color: 'var(--navy)', marginBottom: 12 }}>
          Link inválido
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem' }}>
          Este link de matrícula não é reconhecido.<br />Confirme o link com a equipe do Instituto Despertamente.
        </p>
      </div>
    </div>
  );
}

// ─── Step de pagamento (Mercado Pago) ───────────────────────────────

type MetodoCobravel = Exclude<MetodoPagamentoUI, 'bolsa'>;

const SUPABASE_FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const LABEL_METODO: Record<MetodoCobravel, string> = {
  avista: 'PIX à vista',
  cartao_parcelado: 'Cartão (1x a 12x)',
  cartao_recorrente: 'Cartão recorrente (assinatura mensal)',
  boleto: 'Boleto bancário',
};

const ICONE_METODO: Record<MetodoCobravel, string> = {
  avista: '⚡',
  cartao_parcelado: '💳',
  cartao_recorrente: '💳',
  boleto: '📄',
};

function StatusPagamentoBadge({ status }: { status: string }) {
  const map: Record<string, { texto: string; cor: string; bg: string }> = {
    approved: { texto: 'Aprovado', cor: '#1A5C2A', bg: '#E9F5EC' },
    authorized: { texto: 'Assinatura ativa', cor: '#1A5C2A', bg: '#E9F5EC' },
    pending: { texto: 'Pendente', cor: '#8A6100', bg: '#FFF6DF' },
    in_process: { texto: 'Em análise', cor: '#8A6100', bg: '#FFF6DF' },
    rejected: { texto: 'Recusado', cor: 'var(--error)', bg: '#FFF0F0' },
  };
  const info = map[status] ?? { texto: status, cor: 'var(--text-muted)', bg: 'var(--surface-alt)' };
  return (
    <span
      style={{
        display: 'inline-block', padding: '4px 12px', borderRadius: 999,
        fontSize: '0.75rem', fontWeight: 600, color: info.cor, background: info.bg,
      }}
    >
      {info.texto}
    </span>
  );
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PagamentoStep({
  alunoId, nome, email, cpf, metodoInicial, vendedorWhatsapp, plano,
}: {
  alunoId: string;
  nome: string;
  email: string;
  cpf: string;
  metodoInicial: MetodoCobravel;
  vendedorWhatsapp: string;
  plano: { avista: number; parcela: number; cartaoBase: number };
}) {
  const [metodo, setMetodo] = useState<MetodoCobravel>(metodoInicial);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [processando, setProcessando] = useState(false);

  // Pix (usado tanto por 'avista' quanto pela 1ª parcela de 'boleto' — mesma
  // UI de QR code/polling, só muda o valor e o texto ao redor)
  const [pix, setPix] = useState<{ qrCodeBase64: string; qrCode: string; paymentId: string | number } | null>(null);
  const [pixStatus, setPixStatus] = useState<'pending' | 'approved' | 'timeout'>('pending');
  const pixPollRef = useRef<{ tentativas: number; timer: ReturnType<typeof setInterval> | null }>({ tentativas: 0, timer: null });

  // Cartão (parcelado/recorrente)
  const [cardResultado, setCardResultado] = useState<{ status: string; statusDetail?: string } | null>(null);
  const brickContainerRef = useRef<HTMLDivElement>(null);
  const brickControllerRef = useRef<any>(null);
  const pixRequestedRef = useRef(false);
  // Qual método gerou o Pix atualmente exibido — precisa saber pra decidir o
  // texto/valor certo (avista=R$1.500 à vista, boleto=R$150 = 1ª parcela).
  const pixMetodoRef = useRef<MetodoCobravel | null>(null);

  const nomeParts = nome.trim().split(/\s+/);
  const payerFirstName = nomeParts[0] || 'Aluno';
  const payerLastName = nomeParts.slice(1).join(' ') || payerFirstName;

  // ── Carrega a public key de teste (via edge function, ver mp-public-key) ────
  useEffect(() => {
    fetch(`${SUPABASE_FUNCTIONS_URL}/mp-public-key`)
      .then(r => r.json())
      .then(d => setPublicKey(d.publicKey ?? null))
      .catch(() => setErro('Não foi possível carregar o módulo de pagamento. Recarregue a página.'));
  }, []);

  // ── PIX: cria a cobrança assim que 'avista' ou 'boleto' fica ativo ──────────
  // 'boleto' também cobra via PIX agora (1ª parcela, R$150) — mesma rota/
  // resposta do 'avista' (R$1.500), só muda `forma` no body e o texto na UI.
  useEffect(() => {
    if ((metodo !== 'avista' && metodo !== 'boleto') || pixRequestedRef.current) return;
    pixRequestedRef.current = true;
    pixMetodoRef.current = metodo;
    setProcessando(true);
    setErro('');

    fetch(`${SUPABASE_FUNCTIONS_URL}/matricula-pagamento-criar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alunoId, forma: metodo,
        payerEmail: email, payerFirstName, payerLastName, payerCpf: cpf,
      }),
    })
      .then(r => r.json())
      .then(d => {
        setProcessando(false);
        if (!d.ok) { setErro(d.erro || 'Não foi possível gerar o Pix.'); pixRequestedRef.current = false; return; }
        setPix({ qrCodeBase64: d.qrCodeBase64, qrCode: d.qrCode, paymentId: d.paymentId });
      })
      .catch(() => { setProcessando(false); setErro('Erro ao gerar o Pix. Tente novamente.'); pixRequestedRef.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metodo]);

  // ── PIX: polling do status (a cada 4s, até 60 tentativas / ~4min) ───────────
  useEffect(() => {
    if (!pix || pixStatus !== 'pending') return;

    const poll = () => {
      pixPollRef.current.tentativas += 1;
      fetch(`${SUPABASE_FUNCTIONS_URL}/matricula-pagamento-criar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkStatus: true, paymentId: pix.paymentId }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.ok && d.status === 'approved') {
            setPixStatus('approved');
            if (pixPollRef.current.timer) clearInterval(pixPollRef.current.timer);
            return;
          }
          if (pixPollRef.current.tentativas >= 60) {
            setPixStatus('timeout');
            if (pixPollRef.current.timer) clearInterval(pixPollRef.current.timer);
          }
        })
        .catch(() => {});
    };

    pixPollRef.current.timer = setInterval(poll, 4000);
    return () => { if (pixPollRef.current.timer) clearInterval(pixPollRef.current.timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pix, pixStatus]);

  // ── WhatsApp do vendedor assim que o pagamento confirma ─────────────────────
  // (PIX aprovado, ou cartão aprovado/em análise) -- pedido explícito do dono
  // do produto após o teste real mostrar que a página só ficava parada na
  // tela de sucesso sem indicar o próximo passo pro aluno. Redireciona
  // automaticamente depois de um tempinho, e também mostra um botão manual
  // (fallback caso o navegador bloqueie o redirect automático, ou o aluno
  // feche a aba antes de acontecer).
  const waUrl = useMemo(() => {
    const primeiroNome = nome.trim().split(/\s+/)[0] || 'Aluno';
    const mensagem = `Olá! Sou ${primeiroNome} e acabei de finalizar minha matrícula e o pagamento na Formação em Psicanálise. 🎉`;
    return `https://wa.me/${vendedorWhatsapp}?text=${encodeURIComponent(mensagem)}`;
  }, [nome, vendedorWhatsapp]);

  const cartaoOk = cardResultado && ['approved', 'authorized', 'in_process', 'pending'].includes(cardResultado.status);
  const pagamentoConfirmado = pixStatus === 'approved' || Boolean(cartaoOk);

  const redirectRef = useRef(false);
  useEffect(() => {
    if (!pagamentoConfirmado || redirectRef.current) return;
    redirectRef.current = true;
    const timer = setTimeout(() => { window.location.href = waUrl; }, 2500);
    return () => clearTimeout(timer);
  }, [pagamentoConfirmado, waUrl]);

  // ── Cartão (parcelado/recorrente): monta o Card Payment Brick da MP ─────────
  useEffect(() => {
    if (metodo !== 'cartao_parcelado' && metodo !== 'cartao_recorrente') return;
    if (!publicKey) return;

    let cancelado = false;

    const montarBrick = async () => {
      if (!brickContainerRef.current) return;
      if (brickControllerRef.current) {
        await brickControllerRef.current.unmount().catch(() => {});
        brickControllerRef.current = null;
      }
      if (cancelado) return;

      const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
      const bricksBuilder = mp.bricks();
      // 'cartao_parcelado': a base do calculo tem que ser plano.cartaoBase --
      // NUNCA "parcela * parcelas" (isso fazia a MP aplicar juros EM CIMA de
      // um total ja multiplicado, achado real 2026-09-04) e NUNCA plano.avista
      // (esse e o preco com desconto do PIX/a vista -- o cartao usa o preco
      // "cheio", sem o desconto, senao os juros da MP incidem sobre um valor
      // menor do que deveriam e a parcela de 12x fica abaixo do anunciado).
      // Ver comentario em PLANOS (topo do arquivo) sobre como esse valor foi
      // calculado. 'cartao_recorrente' nao tem esse problema -- e uma
      // assinatura (N cobrancas mensais separadas de valor fixo), nao um
      // parcelamento no cartao, entao usa plano.parcela normalmente.
      const amount = metodo === 'cartao_parcelado' ? plano.cartaoBase : plano.parcela;

      brickControllerRef.current = await bricksBuilder.create('cardPayment', brickContainerRef.current.id, {
        initialization: { amount },
        customization: {
          paymentMethods: {
            // 1x a 12x, sempre calculado pela MP a partir do valor a vista --
            // inclui a opcao "1x sem juros" (o proprio R$997 a vista no
            // cartao, pedido explicito do dono do produto) alem do
            // parcelamento com juros de 2x a 12x. O menu de parcelas so
            // aparece quando existe mais de uma opcao (por isso ficava
            // invisivel antes, com min=max=12).
            maxInstallments: metodo === 'cartao_parcelado' ? 12 : 1,
            minInstallments: metodo === 'cartao_parcelado' ? 1 : 1,
          },
        },
        callbacks: {
          onReady: () => {},
          onError: (error: unknown) => {
            console.error('[PagamentoStep] Card Brick erro', error);
            setErro('Erro ao carregar o formulário de cartão. Recarregue a página.');
          },
          onSubmit: (cardFormData: any) => new Promise<void>((resolve, reject) => {
            setProcessando(true);
            setErro('');
            setCardResultado(null);

            fetch(`${SUPABASE_FUNCTIONS_URL}/matricula-pagamento-criar`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                alunoId,
                forma: metodo,
                cardToken: cardFormData.token,
                installments: cardFormData.installments,
                // Valor final COM os juros da parcela escolhida, calculado
                // pela propria Brick a partir do amount a vista -- so usado
                // pelo backend em cartao_parcelado (cartao_recorrente ignora,
                // usa plano.parcela fixo por cobranca mensal).
                transactionAmount: cardFormData.transaction_amount,
                paymentMethodId: cardFormData.payment_method_id,
                payerEmail: cardFormData.payer?.email || email,
                payerFirstName, payerLastName,
                payerCpf: cardFormData.payer?.identification?.number || cpf,
              }),
            })
              .then(r => r.json())
              .then(d => {
                setProcessando(false);
                if (!d.ok) {
                  setErro(d.erro || 'Pagamento não autorizado. Tente outro cartão.');
                  reject(new Error(d.erro || 'rejeitado'));
                  return;
                }
                if (metodo === 'cartao_recorrente') {
                  setCardResultado({ status: d.status });
                  if (d.status === 'authorized' || d.status === 'pending') { resolve(); }
                  else { setErro('Assinatura não autorizada. Tente outro cartão.'); reject(new Error('nao autorizado')); }
                  return;
                }
                setCardResultado({ status: d.status, statusDetail: d.statusDetail });
                if (d.status === 'approved' || d.status === 'in_process' || d.status === 'pending') {
                  resolve();
                } else {
                  setErro(mensagemRecusa(d.statusDetail));
                  reject(new Error(d.statusDetail || 'recusado'));
                }
              })
              .catch(err => {
                setProcessando(false);
                setErro('Erro ao processar pagamento. Tente novamente.');
                reject(err);
              });
          }),
        },
      });
    };

    if (!window.MercadoPago) {
      const script = document.createElement('script');
      script.src = 'https://sdk.mercadopago.com/js/v2';
      script.onload = montarBrick;
      document.body.appendChild(script);
    } else {
      montarBrick();
    }

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metodo, publicKey]);

  const trocarMetodo = (novo: MetodoCobravel) => {
    setErro('');
    setCardResultado(null);
    if (brickControllerRef.current) { brickControllerRef.current.unmount().catch(() => {}); brickControllerRef.current = null; }
    // Trocando de/para avista ou boleto: o Pix já gerado (se algum) era pro
    // método anterior (valor diferente) — descarta pra gerar um novo quando
    // o novo método for avista/boleto.
    if (novo !== pixMetodoRef.current) {
      if (pixPollRef.current.timer) { clearInterval(pixPollRef.current.timer); pixPollRef.current.timer = null; }
      pixPollRef.current.tentativas = 0;
      pixRequestedRef.current = false;
      pixMetodoRef.current = null;
      setPix(null);
      setPixStatus('pending');
    }
    setMetodo(novo);
  };

  // Cartão recorrente liberado em 2026-09-03 -- todas as formas ficam
  // disponíveis na troca de método (o aluno pode cair pro parcelado se a
  // recorrente falhar, por exemplo).
  const metodosTroca = Object.keys(LABEL_METODO) as MetodoCobravel[];

  return (
    <div className="pay-body" style={{ padding: 0 }}>
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
        Matrícula registrada. Agora é só concluir o pagamento — <strong style={{ color: 'var(--text)' }}>{LABEL_METODO[metodo]}</strong>.
      </p>

      {/* ── Troca de método sem perder a matrícula já criada ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 'var(--space-5)' }}>
        {metodosTroca.map(m => (
          <button
            key={m}
            type="button"
            onClick={() => trocarMetodo(m)}
            style={{
              padding: '8px 14px', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.04em',
              border: `1.5px solid ${metodo === m ? 'var(--navy)' : 'var(--border)'}`,
              background: metodo === m ? 'var(--navy)' : '#fff',
              color: metodo === m ? '#F5F0E4' : 'var(--text)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span>{ICONE_METODO[m]}</span> {LABEL_METODO[m]}
          </button>
        ))}
      </div>

      {erro && (
        <div style={{ background: '#FFF5F5', borderLeft: '3px solid var(--error)', color: 'var(--error)', fontSize: '0.875rem', padding: '12px 16px', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <XCircle className="h-4 w-4 flex-shrink-0" /> {erro}
        </div>
      )}

      {/* ── PIX (avista = R$1.500 à vista; boleto = 1ª parcela de R$150) ── */}
      {(metodo === 'avista' || metodo === 'boleto') && (
        <div className="pix-container">
          {!pix && processando && (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Gerando o Pix...
            </p>
          )}
          {pix && (
            <>
              <div className="pix-amount-badge">
                <span className="pix-amount-label">{metodo === 'avista' ? 'Total à vista' : '1ª parcela (PIX)'}</span>
                <span className="pix-amount-value">R$ {metodo === 'avista' ? fmtBRL(plano.avista) : fmtBRL(plano.parcela)}</span>
              </div>

              <div className="qr-wrapper">
                {pixStatus === 'approved' ? (
                  <CheckCircle2 className="h-14 w-14" style={{ color: '#1A5C2A' }} />
                ) : (
                  <img src={`data:image/png;base64,${pix.qrCodeBase64}`} alt="QR Code Pix" />
                )}
              </div>

              <StatusPagamentoBadge status={pixStatus === 'timeout' ? 'pending' : pixStatus} />

              {pixStatus === 'pending' && (
                <>
                  <div className="pix-code-wrap">
                    <p className="pix-code-label">Código Pix copia e cola</p>
                    <div className="pix-code-box">
                      <div className="pix-code-input">
                        <QrCode className="h-3.5 w-3.5" style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
                        {pix.qrCode}
                      </div>
                      <button type="button" className="btn-copy" onClick={() => navigator.clipboard?.writeText(pix.qrCode)}>
                        <Copy className="h-3.5 w-3.5" style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />
                        Copiar
                      </button>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Aguardando confirmação do pagamento...</p>
                </>
              )}
              {pixStatus === 'timeout' && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.6, textAlign: 'center', maxWidth: 360 }}>
                  Ainda não identificamos o pagamento — sua matrícula já foi registrada, o PIX pode
                  levar alguns minutos para confirmar, você pode fechar esta página.
                </p>
              )}
              {pixStatus === 'approved' && (
                <>
                  <p style={{ fontSize: '0.9375rem', color: 'var(--text)', fontWeight: 600 }}>
                    Pagamento confirmado!{metodo === 'boleto' ? ' As próximas 14 parcelas serão geradas e enviadas automaticamente por WhatsApp/e-mail, um boleto por mês.' : ''}
                  </p>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    Redirecionando para o WhatsApp da sua consultora em instantes...
                  </p>
                  <a href={waUrl} className="btn-submit" style={{ marginTop: 'var(--space-3)', display: 'inline-flex' }}>
                    <span className="btn-text">Voltar a falar com a consultora</span>
                  </a>
                </>
              )}
              {metodo === 'boleto' && pixStatus !== 'approved' && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.6, textAlign: 'center', maxWidth: 380 }}>
                  Esta é a 1ª parcela (ato de matrícula). As próximas 14 parcelas serão geradas e
                  enviadas automaticamente por WhatsApp/e-mail, um boleto por mês.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Cartão (parcelado/recorrente) ── */}
      {(metodo === 'cartao_parcelado' || metodo === 'cartao_recorrente') && (
        <div>
          <div className="pix-amount-badge" style={{ marginBottom: 'var(--space-4)' }}>
            <span className="pix-amount-label">
              {metodo === 'cartao_parcelado' ? 'Valor no cartão (parcele de 1x a 12x abaixo)' : 'Cobrança mensal (assinatura, 15x)'}
            </span>
            <span className="pix-amount-value">
              R$ {fmtBRL(metodo === 'cartao_parcelado' ? plano.cartaoBase : plano.parcela)}
            </span>
          </div>
          {metodo === 'cartao_parcelado' && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
              Escolha a quantidade de parcelas no campo abaixo — o valor de cada parcela (com os juros do cartão, quando houver) aparece no próprio menu. Pagando à vista no PIX o valor é R$ {fmtBRL(plano.avista)}.
            </p>
          )}
          {!publicKey && (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </p>
          )}
          <div id="cardPaymentBrick_container" ref={brickContainerRef} />
          {processando && (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Processando pagamento...
            </p>
          )}
          {cardResultado && ['approved', 'authorized', 'pending', 'in_process'].includes(cardResultado.status) && (
            <div style={{ textAlign: 'center', marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 className="h-12 w-12" style={{ color: '#1A5C2A' }} />
              <StatusPagamentoBadge status={cardResultado.status} />
              <p style={{ fontSize: '0.9375rem', color: 'var(--text)' }}>
                {metodo === 'cartao_recorrente'
                  ? 'Assinatura mensal ativada com sucesso.'
                  : 'Pagamento processado. Sua matrícula está confirmada.'}
              </p>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Redirecionando para o WhatsApp da sua consultora em instantes...
              </p>
              <a href={waUrl} className="btn-submit" style={{ display: 'inline-flex' }}>
                <span className="btn-text">Voltar a falar com a consultora</span>
              </a>
            </div>
          )}
        </div>
      )}

      <p className="pay-footer-note">
        <span className="lock-icon">🔒</span> Seus dados são protegidos com criptografia SSL.
      </p>
    </div>
  );
}

function mensagemRecusa(statusDetail?: string) {
  const map: Record<string, string> = {
    cc_rejected_insufficient_amount: 'Saldo/limite insuficiente.',
    cc_rejected_bad_filled_security_code: 'CVV incorreto.',
    cc_rejected_bad_filled_date: 'Data de validade incorreta.',
    cc_rejected_bad_filled_card_number: 'Número do cartão incorreto.',
    cc_rejected_call_for_authorize: 'Cartão exige autorização — ligue para a operadora.',
    cc_rejected_card_disabled: 'Cartão desabilitado. Ligue para a operadora ou use outro cartão.',
    cc_rejected_duplicated_payment: 'Pagamento duplicado.',
    cc_rejected_high_risk: 'Pagamento recusado por segurança.',
    cc_rejected_max_attempts: 'Excedeu o número de tentativas. Use outro cartão.',
    cc_rejected_other_reason: 'Pagamento recusado pelo emissor do cartão.',
  };
  return (statusDetail && map[statusDetail]) || 'Pagamento recusado. Tente outro cartão ou outra forma de pagamento.';
}

// ─── Main Component ───────────────────────────────────────────────────────────

type FormState = DadosPessoais & DadosEndereco & {
  vencimentoRadio: VencimentoRadio;
  dia_vencimento_outro: string;
  codigo_bolsa: string;
  bolsaValidada: boolean;
  declaracao: boolean;
};

export default function MatriculaTimeComercial() {
  const { vendedor: slug } = useParams<{ vendedor: string }>();
  const nomeVendedor = slug ? VENDEDORES[slug.toLowerCase()] : undefined;
  const plano = PLANOS[slug ? planoDoSlug(slug) : 'padrao'];

  useEffect(() => { ensurePoppinsFontLoaded(); }, []);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [alunoId, setAlunoId] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  const [form, setForm] = useState<FormState>({
    nome: '', email: '', whatsapp: '', cpf: '', rg: '', sexo: '',
    nascDia: '', nascMes: '', nascAno: '',
    pais: 'Brasil', endereco: '', cep: '', cidadeEstado: '',
    vencimentoRadio: '',
    dia_vencimento_outro: '',
    codigo_bolsa: '',
    bolsaValidada: false,
    declaracao: false,
  });

  const setCampo = <K extends keyof FormState>(campo: K, valor: FormState[K]) =>
    setForm(f => ({ ...f, [campo]: valor }));

  if (!nomeVendedor) return <ScreenLinkInvalido />;
  if (done) return <ObrigadoScreen nome={form.nome} />;

  // ── forma de pagamento derivada da escolha no §3 ────────────────────────────
  const formaPagamento: MetodoPagamentoUI | '' =
    form.vencimentoRadio === '' ? ''
    : form.vencimentoRadio === 'cartao_parcelado' ? 'cartao_parcelado'
    : form.vencimentoRadio === 'cartao_recorrente' ? 'cartao_recorrente'
    : form.vencimentoRadio === 'a_vista' ? 'avista'
    : form.vencimentoRadio === 'cortesia' ? 'bolsa'
    : 'boleto';

  const diaVencimentoFinal =
    form.vencimentoRadio === 'outro' ? Number(form.dia_vencimento_outro)
    : ['10', '20', '30'].includes(form.vencimentoRadio) ? Number(form.vencimentoRadio)
    : null;

  // ── Tela de cobrança: matrícula já criada, falta pagar (avista/cartão/boleto) ──
  if (alunoId && formaPagamento && formaPagamento !== 'bolsa') {
    return (
      <div className="idm-matricula">
        <div className="pay-header">
          <div className="pay-header-badge">Instituto Despertamente — IDM</div>
          <h2 className="pay-header-title">Escolha a forma de pagamento</h2>
          <p className="pay-header-name">Consultor: {nomeVendedor}</p>
        </div>
        <main className="form-shell" style={{ paddingTop: 'var(--space-10)' }}>
          <PagamentoStep
            alunoId={alunoId}
            nome={form.nome.trim()}
            email={form.email.trim()}
            cpf={form.cpf.trim()}
            metodoInicial={formaPagamento as MetodoCobravel}
            vendedorWhatsapp={VENDEDOR_WHATSAPP[slug!.toLowerCase()] ?? ''}
            plano={plano}
          />
        </main>
      </div>
    );
  }

  // ── Validação client-side por passo ─────────────────────────────────────────
  const cpfDigits = form.cpf.replace(/\D/g, '');
  const dataNascimento = (form.nascDia && form.nascMes && form.nascAno)
    ? `${form.nascAno}-${form.nascMes}-${form.nascDia}`
    : '';

  const pessoalOk =
    form.nome.trim().length > 0 &&
    form.email.trim().length > 0 &&
    form.whatsapp.trim().length > 0 &&
    cpfDigits.length === 11 &&
    form.rg.trim().length > 0 &&
    form.sexo.trim().length > 0 &&
    dataNascimento.length > 0;

  const enderecoOk =
    form.pais.trim().length > 0 &&
    form.cep.trim().length > 0 &&
    form.endereco.trim().length > 0 &&
    form.cidadeEstado.trim().length > 0;

  const pagamentoOk =
    formaPagamento !== '' &&
    (formaPagamento !== 'boleto' ||
      (diaVencimentoFinal !== null && diaVencimentoFinal >= 1 && diaVencimentoFinal <= 28)) &&
    (formaPagamento !== 'bolsa' || form.codigo_bolsa.trim().length > 0);

  const podeEnviar = pessoalOk && enderecoOk && pagamentoOk && form.declaracao && !submitting;

  // ── Submissão ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!podeEnviar) return;
    setErro('');
    setSubmitting(true);

    try {
      const { data, error } = await (supabase as any).rpc('matricula_time_comercial_criar', {
        p_nome: form.nome.trim(),
        p_email: form.email.trim() || null,
        p_whatsapp: form.whatsapp.trim() || null,
        p_cpf: form.cpf.trim() || null,
        p_rg: form.rg.trim() || null,
        p_sexo: form.sexo || null,
        p_data_nascimento: dataNascimento || null,
        p_pais: form.pais.trim() || null,
        p_endereco: form.endereco.trim() || null,
        p_cep: form.cep.trim() || null,
        p_cidade_estado: form.cidadeEstado.trim() || null,
        p_forma_pagamento: formaRpcDe(formaPagamento as MetodoPagamentoUI),
        p_dia_vencimento: formaPagamento === 'boleto' ? diaVencimentoFinal : null,
        p_codigo_bolsa: formaPagamento === 'bolsa' ? form.codigo_bolsa.trim() : null,
        p_vendedor: SEM_VENDEDOR_ATRIBUIDO.has(slug!.toLowerCase()) ? null : nomeVendedor,
        p_canal: 'Direto',
        p_valor_avista: plano.avista,
        p_valor_parcela: plano.parcela,
      });

      if (error) {
        console.error('[MatriculaTimeComercial] erro de transporte/permissão na RPC', error);
        setErro('Ocorreu um erro, tente novamente. Se persistir, avise a equipe.');
        setSubmitting(false);
        return;
      }

      if (!data?.ok) {
        if (data?.erro === 'ja_matriculado') {
          setErro('Este e-mail ou telefone já está matriculado. Fale com seu vendedor.');
        } else {
          console.error('[MatriculaTimeComercial] RPC recusou a matrícula', data);
          setErro('Ocorreu um erro, tente novamente. Se persistir, avise a equipe.');
        }
        setSubmitting(false);
        return;
      }

      if (formaPagamento === 'bolsa') {
        setDone(true);
      } else {
        setAlunoId(data.aluno_id);
      }
      setSubmitting(false);
    } catch (err) {
      console.error('[MatriculaTimeComercial] falha inesperada', err);
      setErro('Ocorreu um erro, tente novamente. Se persistir, avise a equipe.');
      setSubmitting(false);
    }
  };

  const irParaProximo = () => {
    if (step === 1 && pessoalOk) setStep(2);
    else if (step === 2 && enderecoOk) setStep(3);
  };
  const voltarPasso = () => setStep(s => (s > 1 ? ((s - 1) as 1 | 2) : s));

  const dadosPessoais: DadosPessoais = {
    nome: form.nome, email: form.email, whatsapp: form.whatsapp, cpf: form.cpf,
    rg: form.rg, sexo: form.sexo, nascDia: form.nascDia, nascMes: form.nascMes, nascAno: form.nascAno,
  };
  const dadosEndereco: DadosEndereco = {
    pais: form.pais, cep: form.cep, endereco: form.endereco, cidadeEstado: form.cidadeEstado,
  };

  return (
    <div className="idm-matricula">
      <MatriculaHeader nomeVendedor={nomeVendedor} currentStep={step} />

      <main>
        <div className="form-shell">
          <form
            id="matricula-form"
            noValidate
            onSubmit={e => { e.preventDefault(); if (step === 3) handleSubmit(); }}
          >

            {step === 1 && (
              <StepPersonal
                dados={dadosPessoais}
                onChange={(campo, valor) => {
                  if (campo === 'cpf') setCampo('cpf', formatCPF(valor as string) as any);
                  else setCampo(campo as keyof FormState, valor as any);
                }}
              />
            )}

            {step === 2 && (
              <StepAddress
                dados={dadosEndereco}
                onChange={(campo, valor) => {
                  if (campo === 'cep') setCampo('cep', formatCEP(valor as string) as any);
                  else setCampo(campo as keyof FormState, valor as any);
                }}
              />
            )}

            {step === 3 && (
              <StepPayment
                vencimentoRadio={form.vencimentoRadio}
                onSelecionar={v => setCampo('vencimentoRadio', v)}
                diaOutro={form.dia_vencimento_outro}
                onDiaOutroChange={v => setCampo('dia_vencimento_outro', v)}
                codigoBolsa={form.codigo_bolsa}
                onCodigoBolsaChange={v => setCampo('codigo_bolsa', v)}
                bolsaValidada={form.bolsaValidada}
                onValidarBolsa={() => setCampo('bolsaValidada', true)}
                declaracao={form.declaracao}
                onDeclaracaoChange={v => setCampo('declaracao', v)}
                submitting={submitting}
                podeEnviar={podeEnviar}
                erro={erro}
                onVoltar={voltarPasso}
                plano={plano}
              />
            )}

          </form>

          {step < 3 && (
            <div style={{ display: 'flex', gap: 'var(--space-3)', paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-16)' }}>
              {step > 1 && (
                <button
                  type="button"
                  className="btn-submit"
                  style={{ background: 'transparent', color: 'var(--navy)', border: '1.5px solid var(--border)', flex: '0 0 auto', width: 120 }}
                  onClick={voltarPasso}
                >
                  <span className="btn-text">Voltar</span>
                </button>
              )}
              <button
                type="button"
                className="btn-submit"
                style={{ flex: 1 }}
                disabled={step === 1 ? !pessoalOk : !enderecoOk}
                onClick={irParaProximo}
              >
                <span className="btn-text">Continuar</span>
                <span className="btn-icon" aria-hidden="true">→</span>
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="site-footer">
        <p className="footer-logo">IDM — Instituto Despertamente</p>
        <div className="footer-rule"></div>
        <p className="footer-note">Documento oficial de matrícula · Todas as informações são confidenciais</p>
      </footer>
    </div>
  );
}
