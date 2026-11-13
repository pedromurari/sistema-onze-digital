/**
 * Checkout.tsx
 * Pagina publica isolada (sem login, sem chrome da app).
 * URL: /comprar/:produtoId
 *
 * Mostra o produto, aplica cupom de afiliada (opcional) e processa o
 * pagamento via Mercado Pago Payment Bricks, usando a chave publica da
 * parceira dona do produto. O split (parceira + IDM + afiliada) acontece
 * no backend, na function checkout-criar-pagamento.
 *
 * Visual reaproveita o mesmo design system da ficha de matricula/pre
 * (matricula-reference.css: navy + dourado) -- pedido do Pedro 13/11/2026,
 * o visual anterior (cartao branco genérico) parecia phishing.
 */
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertCircle, CheckCircle2, Tag, Plus, CreditCard, QrCode, Copy, Check } from 'lucide-react';
import './matricula/matricula-reference.css';

const IDM_LOGO = 'https://turma47.semanadodespertar.online/lovable-uploads/1b0d4a56-e01f-4ce0-b2f7-0eecf33da536.png';

declare global {
  interface Window { MercadoPago: any; }
}

interface ProdutoCheckout {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  parceiro_id: string;
  mp_public_key: string | null;
  bump_ativo: boolean;
  bump_nome: string | null;
  bump_descricao: string | null;
  bump_preco: number | null;
}

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
        <h2 className="pay-header-title">Link indisponível</h2>
      </div>
      <div className="pay-body" style={{ textAlign: 'center' }}>
        <AlertCircle className="h-12 w-12 mx-auto" style={{ color: 'var(--error)' }} />
        <p style={{ marginTop: 'var(--space-4)', color: 'var(--text-muted)' }}>Esse link de compra não está mais disponível.</p>
      </div>
    </div>
  );
}

export default function Checkout() {
  const { produtoId } = useParams<{ produtoId: string }>();
  const [produto, setProduto] = useState<ProdutoCheckout | null>(null);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [cupom, setCupom] = useState('');
  const [incluirBump, setIncluirBump] = useState(false);
  const [pago, setPago] = useState(false);
  const [erro, setErro] = useState('');
  const [metodoAtivo, setMetodoAtivo] = useState<'cartao' | 'pix'>('cartao');
  const [pixLoading, setPixLoading] = useState(false);
  const [pixErro, setPixErro] = useState('');
  const [pixQr, setPixQr] = useState<{ qrCodeBase64: string | null; qrCode: string | null } | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);
  const brickContainerRef = useRef<HTMLDivElement>(null);
  const brickCriado = useRef(false);
  const brickControllerRef = useRef<any>(null);
  // Refs com os dados mais recentes do formulario, lidos no onSubmit do brick --
  // assim o efeito que monta o brick nao precisa depender de nome/whatsapp/cupom
  // (cada letra digitada recriava o formulario inteiro, duplicando a UI porque o
  // unmount() do brick anterior e assincrono e nao termina a tempo da proxima
  // tecla -- achado real 13/11/2026, print do Pedro com "Pagar" duas vezes).
  const nomeRef = useRef(nome);
  const whatsappRef = useRef(whatsapp);
  const emailRef = useRef(email);
  const cupomRef = useRef(cupom);
  const incluirBumpRef = useRef(incluirBump);
  nomeRef.current = nome;
  whatsappRef.current = whatsapp;
  emailRef.current = email;
  cupomRef.current = cupom;
  incluirBumpRef.current = incluirBump;

  useEffect(() => {
    if (!produtoId) return;
    supabase.from('parceiros_produtos_checkout' as any).select('*').eq('id', produtoId).maybeSingle()
      .then(({ data }) => { setProduto((data as any) ?? null); setLoading(false); });
  }, [produtoId]);

  const totalAmount = produto ? produto.preco + (incluirBump && produto.bump_ativo && produto.bump_preco ? produto.bump_preco : 0) : 0;
  const whatsappValido = whatsapp.replace(/\D/g, '').length >= 10;
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const mostrarBrick = !!produto?.mp_public_key && nome.trim().length > 0 && whatsappValido && emailValido;

  useEffect(() => {
    if (!mostrarBrick || !produto) return;

    let cancelado = false;

    const criarBrick = async () => {
      if (cancelado || !brickContainerRef.current) return;
      if (brickControllerRef.current) {
        await brickControllerRef.current.unmount();
        brickControllerRef.current = null;
      }
      if (cancelado) return;
      brickCriado.current = true;
      const mp = new window.MercadoPago(produto.mp_public_key, { locale: 'pt-BR' });
      const bricksBuilder = mp.bricks();
      // Brick "cardPayment" (nao "payment" generico): renderiza so o formulario
      // de cartao direto, sem lista de selecao de metodo -- o Pix roda num fluxo
      // proprio nosso (ver pagarComPix), porque o sub-passo de Pix do Brick
      // generico sempre reexibe um campo de e-mail (mesmo pre-preenchido)
      // pedindo de novo o que a pessoa ja preencheu lá em cima, e nao mostra o
      // QR Code na tela -- so manda por e-mail (achado real 13/11/2026, Pedro
      // testou e reclamou dos dois pontos: lista com 1 item so e Pix sem QR).
      brickControllerRef.current = await bricksBuilder.create('cardPayment', brickContainerRef.current.id, {
        initialization: { amount: totalAmount, payer: { email: emailRef.current } },
        // Forca a vista (1x) -- sem isso o Brick oferece parcelamento conforme
        // o cartao/bandeira, o que nao faz sentido pra sessao avulsa/pacote e
        // contraria a decisao de nunca ter cobranca recorrente/parcelada.
        customization: { paymentMethods: { maxInstallments: 1 } },
        callbacks: {
          onReady: () => {},
          onError: (error: unknown) => { console.error(error); setErro('Erro ao carregar o pagamento. Recarregue a página.'); },
          onSubmit: ({ formData }: any) => new Promise<void>((resolve, reject) => {
            const metodo = formData.payment_method_id === 'pix' ? 'pix' : 'cartao';
            fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/checkout-criar-pagamento`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                produto_id: produto.id,
                cupom_codigo: cupomRef.current.trim() || undefined,
                incluir_bump: incluirBumpRef.current,
                comprador: {
                  nome: nomeRef.current,
                  email: formData.payer?.email || emailRef.current,
                  whatsapp: whatsappRef.current || undefined,
                  cpf: formData.payer?.identification?.number,
                },
                pagamento: {
                  metodo,
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
      criarBrick();
    }

    return () => { cancelado = true; };
  }, [produto, mostrarBrick, totalAmount]);

  async function pagarComPix() {
    if (!produto || pixLoading) return;
    setPixLoading(true);
    setPixErro('');
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/checkout-criar-pagamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produto_id: produto.id,
          cupom_codigo: cupomRef.current.trim() || undefined,
          incluir_bump: incluirBumpRef.current,
          comprador: {
            nome: nomeRef.current,
            email: emailRef.current,
            whatsapp: whatsappRef.current,
          },
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
    try { await navigator.clipboard.writeText(texto); setPixCopiado(true); setTimeout(() => setPixCopiado(false), 2500); return; } catch { /* cai pro fallback */ }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = texto;
      textarea.style.position = 'fixed'; textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus(); textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setPixCopiado(true); setTimeout(() => setPixCopiado(false), 2500);
    } catch { /* usuario copia selecionando o texto na tela */ }
  }

  if (loading) return <ScreenLoading />;
  if (!produto) return <ScreenNotFound />;

  if (pago) {
    return (
      <div className="idm-matricula">
        <div className="obrigado-wrap" style={{ minHeight: '100vh' }}>
          <div className="obrigado-seal"><CheckCircle2 className="obrigado-check" /></div>
          <div className="obrigado-eyebrow">Pagamento confirmado</div>
          <h1 className="obrigado-title">Recebido!</h1>
          <div className="obrigado-instituto">Instituto Despertamente</div>
          <div className="obrigado-rule" />
          <div className="obrigado-card">
            <p>Se for <strong>Pix</strong>, confirme o pagamento no seu banco. Você vai receber a confirmação por e-mail e WhatsApp assim que cair.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="idm-matricula">
      <div className="pay-header">
        <img src={IDM_LOGO} alt="Instituto Despertamente" style={{ height: 36, margin: '0 auto var(--space-4)', display: 'block' }} loading="lazy" />
        <div className="pay-header-badge">Instituto Despertamente</div>
        <h2 className="pay-header-title">{produto.nome}</h2>
        {produto.descricao && <p className="pay-header-name">{produto.descricao}</p>}
      </div>

      <div className="pay-body">
        <div className="pix-amount-badge" style={{ margin: '0 auto var(--space-8)', display: 'flex', width: 'fit-content' }}>
          <span className="pix-amount-label">Valor</span>
          <span className="pix-amount-value">{produto.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
        </div>

        {produto.bump_ativo && produto.bump_preco != null && (
          <label
            className="pay-card"
            style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)', padding: 'var(--space-5)', cursor: 'pointer', marginBottom: 'var(--space-6)', borderColor: incluirBump ? 'var(--navy)' : undefined }}
          >
            <input
              type="checkbox"
              style={{ marginTop: 4, width: 16, height: 16, accentColor: 'var(--navy)' }}
              checked={incluirBump}
              onChange={e => setIncluirBump(e.target.checked)}
            />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus className="h-3.5 w-3.5" /> Adicionar: {produto.bump_nome}
              </p>
              {produto.bump_descricao && <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 2 }}>{produto.bump_descricao}</p>}
              <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy)', marginTop: 4 }}>
                + {produto.bump_preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
          </label>
        )}

        {incluirBump && (
          <div className="statement-divider" style={{ margin: '0 0 var(--space-8) 0' }}>
            <span className="statement-tag">Total</span>
            <span className="statement-text" style={{ fontWeight: 700, color: '#F5F0E4' }}>
              {totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
        )}

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
          <div className="field span-full">
            <label className="field-label">Cupom</label>
            <div className="field-control">
              <Tag className="h-4 w-4" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                style={{ paddingLeft: 38, textTransform: 'uppercase' }}
                placeholder="(opcional)"
                value={cupom} onChange={e => setCupom(e.target.value.toUpperCase())}
              />
            </div>
          </div>
        </div>

        {erro && (
          <div className="global-error show" style={{ marginBottom: 'var(--space-6)' }}>{erro}</div>
        )}

        {!mostrarBrick ? (
          <p style={{ textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Preencha nome, WhatsApp e e-mail para liberar o pagamento.</p>
        ) : (
          <div className="pay-options">
            <div className={`pay-card ${metodoAtivo === 'cartao' ? 'active' : ''}`}>
              <div className="pay-card-header" onClick={() => setMetodoAtivo('cartao')} style={{ cursor: 'pointer' }}>
                <div className="pay-card-icon"><CreditCard className="h-5 w-5" /></div>
                <div className="pay-card-info">
                  <div className="pay-card-title">Cartão de crédito</div>
                  <div className="pay-card-sub">Aprovação na hora</div>
                </div>
                <div className="pay-card-check">{metodoAtivo === 'cartao' ? '✓' : ''}</div>
              </div>
              <div className="pay-card-body" style={{ display: metodoAtivo === 'cartao' ? 'block' : 'none' }}>
                <div id="paymentBrick_container" ref={brickContainerRef} style={{ paddingTop: 'var(--space-4)' }} />
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
                        <span className="pix-amount-value">{totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
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
                      <p className="field-hint" style={{ textAlign: 'center' }}>Após pagar, você recebe a confirmação automática por e-mail e WhatsApp.</p>
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
        <p className="footer-note" style={{ marginTop: 'var(--space-2)' }}>CNPJ 55.184.481/0001-24 · Pagamentos processados com segurança pelo Mercado Pago</p>
      </div>
    </div>
  );
}
