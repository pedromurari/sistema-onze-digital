/**
 * Checkout.tsx
 * Pagina publica isolada (sem login, sem chrome da app).
 * URL: /comprar/:produtoId
 *
 * Mostra o produto, aplica cupom de afiliada (opcional) e processa o
 * pagamento via Mercado Pago Payment Bricks, usando a chave publica da
 * parceira dona do produto. O split (parceira + IDM + afiliada) acontece
 * no backend, na function checkout-criar-pagamento.
 */
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertCircle, CheckCircle2, Tag } from 'lucide-react';

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
}

function ScreenLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f0f4f8' }}>
      <Loader2 className="h-10 w-10 animate-spin" style={{ color: '#6c63ff' }} />
    </div>
  );
}

function ScreenNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#f0f4f8' }}>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 max-w-md w-full p-10 text-center space-y-4">
        <AlertCircle className="h-14 w-14 mx-auto text-red-400" />
        <h2 className="text-xl font-semibold text-gray-800">Produto não encontrado</h2>
        <p className="text-gray-500 text-sm">Esse link de compra não está mais disponível.</p>
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
  const [pago, setPago] = useState(false);
  const [erro, setErro] = useState('');
  const brickContainerRef = useRef<HTMLDivElement>(null);
  const brickCriado = useRef(false);

  useEffect(() => {
    if (!produtoId) return;
    supabase.from('parceiros_produtos_checkout' as any).select('*').eq('id', produtoId).maybeSingle()
      .then(({ data }) => { setProduto((data as any) ?? null); setLoading(false); });
  }, [produtoId]);

  useEffect(() => {
    if (!produto?.mp_public_key || brickCriado.current || !nome.trim()) return;

    const iniciarBrick = async () => {
      if (!window.MercadoPago) {
        const script = document.createElement('script');
        script.src = 'https://sdk.mercadopago.com/js/v2';
        script.onload = criarBrick;
        document.body.appendChild(script);
      } else {
        criarBrick();
      }
    };

    const criarBrick = async () => {
      if (brickCriado.current || !brickContainerRef.current) return;
      brickCriado.current = true;
      const mp = new window.MercadoPago(produto.mp_public_key, { locale: 'pt-BR' });
      const bricksBuilder = mp.bricks();
      await bricksBuilder.create('payment', brickContainerRef.current.id, {
        initialization: { amount: produto.preco },
        customization: { paymentMethods: { creditCard: 'all', pix: 'all' } },
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
                cupom_codigo: cupom.trim() || undefined,
                comprador: {
                  nome,
                  email: formData.payer?.email,
                  whatsapp: whatsapp || undefined,
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

    iniciarBrick();
  }, [produto, nome, whatsapp, cupom]);

  if (loading) return <ScreenLoading />;
  if (!produto) return <ScreenNotFound />;

  if (pago) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#f0f4f8' }}>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 max-w-md w-full p-10 text-center space-y-4">
          <CheckCircle2 className="h-14 w-14 mx-auto text-emerald-500" />
          <h2 className="text-xl font-semibold text-gray-800">Pagamento em andamento!</h2>
          <p className="text-gray-500 text-sm">Se for Pix, confirme o pagamento no seu banco. Você receberá a confirmação por e-mail/WhatsApp.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-10 px-4" style={{ background: '#f0f4f8' }}>
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{produto.nome}</h1>
          {produto.descricao && <p className="text-sm text-gray-500 mt-1">{produto.descricao}</p>}
          <p className="text-3xl font-bold text-gray-900 mt-3">
            {produto.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>

        <div className="space-y-3">
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
            placeholder="Nome completo"
            value={nome} onChange={e => setNome(e.target.value)}
          />
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
            placeholder="WhatsApp (opcional)"
            value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
          />
          <div className="relative">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 text-sm uppercase"
              placeholder="Cupom (opcional)"
              value={cupom} onChange={e => setCupom(e.target.value.toUpperCase())}
            />
          </div>
        </div>

        {erro && <p className="text-sm text-red-500">{erro}</p>}

        {!nome.trim() ? (
          <p className="text-xs text-gray-400 text-center">Preencha seu nome para liberar o pagamento.</p>
        ) : (
          <div id="paymentBrick_container" ref={brickContainerRef} />
        )}
      </div>
    </div>
  );
}
