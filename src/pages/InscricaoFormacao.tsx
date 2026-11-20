/**
 * InscricaoFormacao.tsx
 * Página pública isolada (sem login, sem chrome da app).
 * URL: /inscricao/:slug   (ex: /inscricao/constelacao-familiar)
 *
 * Ficha de inscrição das formações de preço único (tabela `formacao_ofertas`).
 * Primeiro produto: Despertar Sistêmico — Constelação Familiar (20/11/2026).
 *
 * Vem da landing page do site institucional (apps/membros,
 * /programas/constelacao-familiar): o formulário de lá já manda nome,
 * WhatsApp e e-mail por query string, então a pessoa cai aqui com tudo
 * preenchido e só escolhe como pagar -- pedido do Pedro, pra não fazer
 * ninguém digitar os mesmos dados duas vezes.
 *
 * Cobrança na conta Mercado Pago INSTITUCIONAL (edge function
 * `formacao-inscricao-criar` + secret MP_ACCESS_TOKEN). Cartão usa o Brick
 * "cardPayment" (aceita parcelamento até o limite da oferta); Pix abre QR
 * Code + copia-e-cola na própria tela. Mesmo desenho já validado no checkout
 * do Divã -- ver src/pages/Checkout.tsx.
 */
import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertCircle, CheckCircle2, CreditCard, QrCode, Copy, Check } from 'lucide-react';
import './matricula/matricula-reference.css';

const IDM_LOGO = 'https://turma47.semanadodespertar.online/lovable-uploads/1b0d4a56-e01f-4ce0-b2f7-0eecf33da536.png';

// Mesmo mapeamento do checkout do Divã -- status_detail vem sempre que o
// cartão é recusado (HTTP 200, não é erro de API).
function mensagemRecusa(statusDetail?: string | null) {
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
  return (statusDetail && map[statusDetail]) || 'Pagamento recusado. Tente outro cartão ou o Pix.';
}

declare global {
  interface Window { MercadoPago: any; }
}

interface Oferta {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  preco: number;
  max_parcelas: number;
  // Valor real da parcela (com juros do gateway). Não é preco/max_parcelas --
  // o Mercado Pago cobra os juros do parcelamento do comprador.
  parcela_cartao: number | null;
}

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

function ScreenLoading() {
  return (
    <div className="idm-matricula" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy-deeper)' }}>
      <Loader2 className="h-10 w-10 animate-spin" style={{ color: 'var(--gold-light)' }} />
    </div>
  );
}

function ScreenNotFound() {
  return (
    <div className="idm-matricula">
      <div className="pay-header">
        <div className="pay-header-badge">Instituto Despertamente</div>
        <h2 className="pay-header-title">Inscrição indisponível</h2>
      </div>
      <div className="pay-body" style={{ textAlign: 'center' }}>
        <AlertCircle className="h-12 w-12 mx-auto" style={{ color: 'var(--error)' }} />
        <p style={{ marginTop: 'var(--space-4)', color: 'var(--text-muted)' }}>
          Essa formação não está com inscrições abertas no momento.
        </p>
      </div>
    </div>
  );
}

export default function InscricaoFormacao() {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();

  const [oferta, setOferta] = useState<Oferta | null>(null);
  const [loading, setLoading] = useState(true);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  // Prefill vindo da landing page (?nome=&whatsapp=&email=).
  const [nome, setNome] = useState(params.get('nome') ?? '');
  const [whatsapp, setWhatsapp] = useState(params.get('whatsapp') ?? '');
  const [email, setEmail] = useState(params.get('email') ?? '');

  const [pago, setPago] = useState(false);
  const [pagoStatus, setPagoStatus] = useState<'aprovado' | 'pendente'>('aprovado');
  const [erro, setErro] = useState('');
  const [metodoAtivo, setMetodoAtivo] = useState<'cartao' | 'pix'>('cartao');
  const [pixLoading, setPixLoading] = useState(false);
  const [pixErro, setPixErro] = useState('');
  const [pixQr, setPixQr] = useState<{ qrCodeBase64: string | null; qrCode: string | null } | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);

  const brickContainerRef = useRef<HTMLDivElement>(null);
  const brickControllerRef = useRef<any>(null);

  // Refs com os dados mais recentes, lidos dentro do onSubmit do Brick -- sem
  // isso cada tecla digitada recria o formulário inteiro e duplica a UI (o
  // unmount do Brick é assíncrono). Mesmo cuidado do Checkout.tsx.
  const nomeRef = useRef(nome);
  const whatsappRef = useRef(whatsapp);
  const emailRef = useRef(email);
  nomeRef.current = nome;
  whatsappRef.current = whatsapp;
  emailRef.current = email;

  useEffect(() => {
    if (!slug) return;
    void (async () => {
      const { data } = await supabase
        .from('formacao_ofertas' as any)
        .select('id, slug, nome, descricao, preco, max_parcelas, parcela_cartao')
        .eq('slug', slug)
        .eq('ativo', true)
        .maybeSingle();
      setOferta(
        data
          ? ({
              ...(data as any),
              preco: Number((data as any).preco),
              parcela_cartao: (data as any).parcela_cartao != null ? Number((data as any).parcela_cartao) : null,
            })
          : null,
      );
      setLoading(false);
    })();
  }, [slug]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${FN_URL}/mp-public-key`);
        const json = await res.json();
        setPublicKey(json.publicKey ?? null);
      } catch { /* sem chave o cartão não monta; o Pix continua funcionando */ }
    })();
  }, []);

  const whatsappValido = whatsapp.replace(/\D/g, '').length >= 10;
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const dadosOk = nome.trim().length > 1 && whatsappValido && emailValido;
  const mostrarPagamento = !!oferta && dadosOk;

  useEffect(() => {
    if (!mostrarPagamento || !oferta || !publicKey || metodoAtivo !== 'cartao') return;

    let cancelado = false;

    const criarBrick = async () => {
      if (cancelado || !brickContainerRef.current) return;
      if (brickControllerRef.current) {
        await brickControllerRef.current.unmount();
        brickControllerRef.current = null;
      }
      if (cancelado) return;

      const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
      const bricksBuilder = mp.bricks();
      brickControllerRef.current = await bricksBuilder.create('cardPayment', brickContainerRef.current.id, {
        initialization: { amount: oferta.preco, payer: { email: emailRef.current } },
        customization: { paymentMethods: { maxInstallments: oferta.max_parcelas } },
        callbacks: {
          onReady: () => {},
          onError: (error: unknown) => {
            console.error(error);
            setErro('Erro ao carregar o pagamento. Recarregue a página.');
          },
          onSubmit: ({ formData }: any) => new Promise<void>((resolve, reject) => {
            fetch(`${FN_URL}/formacao-inscricao-criar`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                slug: oferta.slug,
                nome: nomeRef.current,
                email: formData.payer?.email || emailRef.current,
                whatsapp: whatsappRef.current,
                cpf: formData.payer?.identification?.number,
                pagamento: {
                  metodo: 'cartao',
                  token: formData.token,
                  payment_method_id: formData.payment_method_id,
                  installments: formData.installments,
                  issuer_id: formData.issuer_id,
                },
              }),
            })
              .then(r => r.json())
              .then(json => {
                if (json.error) { setErro(json.error); reject(json.error); return; }
                if (json.status === 'recusado') {
                  const msg = mensagemRecusa(json.status_detail);
                  setErro(msg); reject(new Error(msg)); return;
                }
                setPagoStatus(json.status === 'pendente' ? 'pendente' : 'aprovado');
                setPago(true);
                resolve();
              })
              .catch(err => { setErro('Erro ao processar pagamento.'); reject(err); });
          }),
        },
      });
    };

    if (!window.MercadoPago) {
      const script = document.createElement('script');
      script.src = 'https://sdk.mercadopago.com/js/v2';
      script.onload = criarBrick;
      document.body.appendChild(script);
    } else {
      void criarBrick();
    }

    return () => { cancelado = true; };
  }, [oferta, mostrarPagamento, publicKey, metodoAtivo]);

  // Registra o lead no Kanban assim que os dados ficam válidos, antes de
  // qualquer pagamento -- quem desiste no meio também precisa aparecer pra
  // vendedora ir atrás.
  const leadRegistrado = useRef(false);
  useEffect(() => {
    if (!dadosOk || !oferta || leadRegistrado.current) return;
    leadRegistrado.current = true;
    void fetch(`${FN_URL}/formacao-inscricao-criar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: oferta.slug, nome, email, whatsapp }),
    }).catch(() => { leadRegistrado.current = false; });
  }, [dadosOk, oferta, nome, email, whatsapp]);

  async function pagarComPix() {
    if (!oferta || pixLoading) return;
    setPixLoading(true);
    setPixErro('');
    try {
      const res = await fetch(`${FN_URL}/formacao-inscricao-criar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: oferta.slug,
          nome: nomeRef.current,
          email: emailRef.current,
          whatsapp: whatsappRef.current,
          pagamento: { metodo: 'pix' },
        }),
      });
      const json = await res.json();
      if (json.error) { setPixErro(json.error); return; }
      setPixQr({ qrCodeBase64: json.qr_code_base64 ?? null, qrCode: json.qr_code ?? null });
    } catch {
      setPixErro('Erro ao gerar o Pix. Tente novamente.');
    } finally {
      setPixLoading(false);
    }
  }

  async function copiarPix(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setPixCopiado(true); setTimeout(() => setPixCopiado(false), 2500);
      return;
    } catch { /* cai pro fallback */ }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = texto;
      textarea.style.position = 'fixed'; textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus(); textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setPixCopiado(true); setTimeout(() => setPixCopiado(false), 2500);
    } catch { /* a pessoa copia selecionando na tela */ }
  }

  if (loading) return <ScreenLoading />;
  if (!oferta) return <ScreenNotFound />;

  if (pago) {
    return (
      <div className="idm-matricula">
        <div className="obrigado-wrap" style={{ minHeight: '100vh' }}>
          <div className="obrigado-seal"><CheckCircle2 className="obrigado-check" /></div>
          <div className="obrigado-eyebrow">{pagoStatus === 'pendente' ? 'Pagamento em análise' : 'Inscrição confirmada'}</div>
          <h1 className="obrigado-title">{pagoStatus === 'pendente' ? 'Quase lá!' : 'Bem-vindo(a)!'}</h1>
          <div className="obrigado-instituto">{oferta.nome}</div>
          <div className="obrigado-rule" />
          <div className="obrigado-card">
            <p>
              {pagoStatus === 'pendente'
                ? 'Seu cartão está em análise pelo banco. Assim que for aprovado, você recebe a confirmação e os próximos passos por e-mail e WhatsApp.'
                : 'Você vai receber a confirmação e os próximos passos por e-mail e WhatsApp.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Só mostra valor de parcela quando ele foi cadastrado de verdade. Sem isso,
  // o certo é falar só do número de parcelas -- o valor exato aparece no
  // próprio formulário do cartão, direto do Mercado Pago.
  const parcelaCartao = oferta.parcela_cartao;

  return (
    <div className="idm-matricula">
      <div className="pay-header">
        <img src={IDM_LOGO} alt="Instituto Despertamente" style={{ height: 36, margin: '0 auto var(--space-4)', display: 'block' }} loading="lazy" />
        <div className="pay-header-badge">Instituto Despertamente</div>
        <h2 className="pay-header-title">{oferta.nome}</h2>
        {oferta.descricao && <p className="pay-header-name">{oferta.descricao}</p>}
      </div>

      <div className="pay-body">
        <div className="pix-amount-badge" style={{ margin: '0 auto var(--space-8)', display: 'flex', width: 'fit-content' }}>
          <span className="pix-amount-label">Investimento</span>
          <span className="pix-amount-value">{oferta.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 'calc(var(--space-8) * -1 + var(--space-2))', marginBottom: 'var(--space-8)' }}>
          à vista no Pix · ou até {oferta.max_parcelas}x
          {parcelaCartao != null
            ? ` de ${parcelaCartao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
            : ''}{' '}
          no cartão
        </p>

        <div className="field-grid" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="field span-full">
            <label className="field-label">Nome completo<span className="field-required">*</span></label>
            <input type="text" placeholder="Seu nome" value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div className="field span-full">
            <label className="field-label">WhatsApp<span className="field-required">*</span></label>
            <input type="tel" placeholder="(11) 91234-5678" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
          </div>
          <div className="field span-full">
            <label className="field-label">E-mail<span className="field-required">*</span></label>
            <input type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
        </div>

        {erro && <div className="global-error show" style={{ marginBottom: 'var(--space-6)' }}>{erro}</div>}

        {!mostrarPagamento ? (
          <p style={{ textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Preencha nome, WhatsApp e e-mail para liberar o pagamento.
          </p>
        ) : (
          <div className="pay-options">
            <div className={`pay-card ${metodoAtivo === 'cartao' ? 'active' : ''}`}>
              <div className="pay-card-header" onClick={() => setMetodoAtivo('cartao')} style={{ cursor: 'pointer' }}>
                <div className="pay-card-icon"><CreditCard className="h-5 w-5" /></div>
                <div className="pay-card-info">
                  <div className="pay-card-title">Cartão de crédito</div>
                  <div className="pay-card-sub">Em até {oferta.max_parcelas}x · aprovação na hora</div>
                </div>
                <div className="pay-card-check">{metodoAtivo === 'cartao' ? '✓' : ''}</div>
              </div>
              <div className="pay-card-body" style={{ display: metodoAtivo === 'cartao' ? 'block' : 'none' }}>
                {!publicKey ? (
                  <p className="field-hint" style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
                    Carregando o formulário do cartão…
                  </p>
                ) : (
                  <div id="formacaoBrick_container" ref={brickContainerRef} style={{ paddingTop: 'var(--space-4)' }} />
                )}
              </div>
            </div>

            <div className={`pay-card ${metodoAtivo === 'pix' ? 'active' : ''}`}>
              <div className="pay-card-header" onClick={() => setMetodoAtivo('pix')} style={{ cursor: 'pointer' }}>
                <div className="pay-card-icon"><QrCode className="h-5 w-5" /></div>
                <div className="pay-card-info">
                  <div className="pay-card-title">Pix</div>
                  <div className="pay-card-sub">QR Code ou copia e cola</div>
                </div>
                <div className="pay-card-check">{metodoAtivo === 'pix' ? '✓' : ''}</div>
              </div>
              <div className="pay-card-body" style={{ display: metodoAtivo === 'pix' ? 'block' : 'none' }}>
                <div className="pix-container">
                  {pixErro && <div className="global-error show">{pixErro}</div>}
                  {!pixQr ? (
                    <button type="button" className="btn-submit" style={{ marginTop: 'var(--space-4)' }} onClick={() => void pagarComPix()} disabled={pixLoading}>
                      {pixLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="btn-text">Gerar código Pix</span>}
                    </button>
                  ) : (
                    <>
                      <div className="pix-amount-badge">
                        <span className="pix-amount-label">Total no Pix</span>
                        <span className="pix-amount-value">{oferta.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                      </div>
                      {pixQr.qrCodeBase64 && (
                        <div className="qr-wrapper">
                          <img src={`data:image/png;base64,${pixQr.qrCodeBase64}`} alt="QR Code Pix" />
                        </div>
                      )}
                      {pixQr.qrCode && (
                        <div className="pix-code-wrap">
                          <p className="pix-code-label">Código Pix copia e cola</p>
                          <div className="pix-code-box">
                            <div className="pix-code-input">{pixQr.qrCode}</div>
                            <button type="button" className={`btn-copy ${pixCopiado ? 'copied' : ''}`} onClick={() => void copiarPix(pixQr.qrCode!)}>
                              {pixCopiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </div>
                      )}
                      <p className="field-hint" style={{ textAlign: 'center' }}>
                        Após pagar, a confirmação chega automaticamente por e-mail e WhatsApp.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <p className="pay-footer-note">
          <span className="lock-icon">🔒</span> Pagamento processado com segurança pelo Mercado Pago.
        </p>
      </div>

      <div className="site-footer">
        <p className="footer-logo">Instituto Despertamente</p>
        <div className="footer-rule" />
        <p className="footer-note">
          <a href="/politica-de-privacidade#privacidade" style={{ color: 'inherit', textDecoration: 'underline' }}>Política de Privacidade</a>
          {' · '}
          <a href="/termos-de-uso#termos" style={{ color: 'inherit', textDecoration: 'underline' }}>Termos de Uso</a>
        </p>
        <p className="footer-note" style={{ marginTop: 'var(--space-2)' }}>
          CNPJ 55.184.481/0001-24 · Pagamentos processados com segurança pelo Mercado Pago
        </p>
      </div>
    </div>
  );
}
