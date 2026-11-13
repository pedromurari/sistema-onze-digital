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
import { Loader2, AlertCircle, CheckCircle2, Tag, Plus } from 'lucide-react';
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
  const [cupom, setCupom] = useState('');
  const [incluirBump, setIncluirBump] = useState(false);
  const [pago, setPago] = useState(false);
  const [erro, setErro] = useState('');
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
  const cupomRef = useRef(cupom);
  const incluirBumpRef = useRef(incluirBump);
  nomeRef.current = nome;
  whatsappRef.current = whatsapp;
  cupomRef.current = cupom;
  incluirBumpRef.current = incluirBump;

  useEffect(() => {
    if (!produtoId) return;
    supabase.from('parceiros_produtos_checkout' as any).select('*').eq('id', produtoId).maybeSingle()
      .then(({ data }) => { setProduto((data as any) ?? null); setLoading(false); });
  }, [produtoId]);

  const totalAmount = produto ? produto.preco + (incluirBump && produto.bump_ativo && produto.bump_preco ? produto.bump_preco : 0) : 0;
  const whatsappValido = whatsapp.replace(/\D/g, '').length >= 10;
  const mostrarBrick = !!produto?.mp_public_key && nome.trim().length > 0 && whatsappValido;

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
      brickControllerRef.current = await bricksBuilder.create('payment', brickContainerRef.current.id, {
        initialization: { amount: totalAmount },
        // "pix" nao e uma chave valida pro Brick (SDK loga "Invalid param(s)
        // [pix]" e ignora silenciosamente, so sobra cartao) -- a chave certa
        // pro Pix no customization.paymentMethods e "bankTransfer".
        customization: { paymentMethods: { creditCard: 'all', bankTransfer: 'all' } },
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
                  email: formData.payer?.email,
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
          <p style={{ textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Preencha seu nome e WhatsApp para liberar o pagamento.</p>
        ) : (
          <div id="paymentBrick_container" ref={brickContainerRef} />
        )}

        <p className="pay-footer-note">
          <span className="lock-icon">🔒</span> Pagamento processado com segurança pelo Mercado Pago.
        </p>
      </div>

      <div className="site-footer">
        <p className="footer-logo">Instituto Despertamente</p>
        <div className="footer-rule" />
        <p className="footer-note">CNPJ 55.184.481/0001-24</p>
      </div>
    </div>
  );
}
