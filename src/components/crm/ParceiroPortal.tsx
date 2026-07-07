import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, LogOut, ShoppingBag, BarChart3, ClipboardList, Wallet, CheckCircle2, Ticket, UserCircle, Copy, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { DesempenhoParceiros } from './DesempenhoParceiros';
import { EntregasParceiros } from './EntregasParceiros';

function conectarMercadoPago(parceiraId: string) {
  const clientId = import.meta.env.VITE_MP_CLIENT_ID;
  if (!clientId) { toast.error('Conexão com Mercado Pago ainda não configurada pelo time do IDM.'); return; }
  const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mp-oauth-callback`;
  const url = `https://auth.mercadopago.com.br/authorization?client_id=${clientId}&response_type=code&platform_id=mp&state=${parceiraId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  window.location.href = url;
}

function linkCheckout(produtoId: string) {
  return `${window.location.origin}/comprar/${produtoId}`;
}

function copiarLink(link: string) {
  navigator.clipboard.writeText(link);
  toast.success('Link copiado!');
}

type ProdutoStatus = 'em_analise' | 'aprovado' | 'ativo' | 'pausado' | 'reprovado';

type MeuProduto = {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number | null;
  status: ProdutoStatus;
  created_at: string;
};

const STATUS_CONFIG: Record<ProdutoStatus, { label: string; className: string }> = {
  em_analise: { label: 'Em análise', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  aprovado:   { label: 'Aprovado',   className: 'bg-blue-100 text-blue-700 border-blue-200' },
  ativo:      { label: 'Ativo (com Selo IDM)', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  pausado:    { label: 'Pausado',    className: 'bg-gray-100 text-gray-700 border-gray-200' },
  reprovado:  { label: 'Reprovado',  className: 'bg-red-100 text-red-700 border-red-200' },
};

const TABS = [
  { key: 'produtos', label: 'Meus produtos', icon: ShoppingBag },
  { key: 'cupons', label: 'Meus cupons', icon: Ticket },
  { key: 'desempenho', label: 'Desempenho', icon: BarChart3 },
  { key: 'entregas', label: 'Entregas', icon: ClipboardList },
  { key: 'perfil', label: 'Meu perfil', icon: UserCircle },
] as const;

type Tab = typeof TABS[number]['key'];

function MeusProdutos({ parceiraId }: { parceiraId: string }) {
  const [produtos, setProdutos] = useState<MeuProduto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('parceiros_produtos' as any)
      .select('id, nome, descricao, preco, status, created_at')
      .eq('parceiro_id', parceiraId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setProdutos((data as any) || []); setLoading(false); });
  }, [parceiraId]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (produtos.length === 0) return <div className="text-center py-16 text-muted-foreground text-sm">Nenhum produto cadastrado ainda.</div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {produtos.map(produto => {
        const cfg = STATUS_CONFIG[produto.status];
        return (
          <div key={produto.id} className="bg-white border border-border rounded-xl p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-foreground">{produto.nome}</p>
              <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>
            </div>
            {produto.descricao && <p className="text-sm text-muted-foreground line-clamp-2">{produto.descricao}</p>}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              {produto.preco != null && <span>R$ {Number(produto.preco).toFixed(2)}</span>}
              <span>{format(new Date(produto.created_at), "dd/MM/yy", { locale: ptBR })}</span>
            </div>
            {produto.status === 'ativo' && (
              <button
                onClick={() => copiarLink(linkCheckout(produto.id))}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-lg py-1.5 transition-colors"
              >
                <Link2 className="h-3.5 w-3.5" /> Copiar link de divulgação
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

type MeuCupom = {
  id: string;
  codigo: string;
  comissao_pct: number | null;
  ativo: boolean;
  produto_id: string;
  parceiros_produtos: { nome: string; parceiros: { nome: string } | null } | null;
};

function MeusCupons({ parceiraId }: { parceiraId: string }) {
  const [cupons, setCupons] = useState<MeuCupom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('parceiros_cupons' as any)
      .select('id, codigo, comissao_pct, ativo, produto_id, parceiros_produtos(nome, parceiros(nome))')
      .eq('parceiro_afiliado_id', parceiraId)
      .order('codigo')
      .then(({ data }) => { setCupons((data as any) || []); setLoading(false); });
  }, [parceiraId]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (cupons.length === 0) return <div className="text-center py-16 text-muted-foreground text-sm">Você ainda não tem cupons de afiliada. Fale com o time do IDM.</div>;

  return (
    <div className="bg-white border border-border rounded-xl divide-y divide-border">
      {cupons.map(c => (
        <div key={c.id} className="flex items-center gap-3 p-4 flex-wrap">
          <Ticket className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-mono font-semibold text-foreground">{c.codigo}</p>
            <p className="text-xs text-muted-foreground truncate">
              {c.parceiros_produtos?.nome} ({c.parceiros_produtos?.parceiros?.nome})
              {c.comissao_pct != null && ` · sua comissão: ${c.comissao_pct}%`}
            </p>
          </div>
          <Badge variant="outline" className={cn(c.ativo ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200')}>
            {c.ativo ? 'Ativo' : 'Inativo'}
          </Badge>
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => copiarLink(linkCheckout(c.produto_id))}>
            <Copy className="h-3.5 w-3.5" /> Copiar link
          </Button>
        </div>
      ))}
    </div>
  );
}

function MeuPerfil({ parceiraId, nomeParceira, mpConectado }: { parceiraId: string; nomeParceira: string; mpConectado: boolean }) {
  return (
    <div className="space-y-4 max-w-lg">
      <div className="bg-white border border-border rounded-xl p-4 space-y-1">
        <p className="text-xs text-muted-foreground">Nome</p>
        <p className="text-sm font-medium text-foreground">{nomeParceira}</p>
      </div>

      <div className={cn(
        'flex items-center justify-between gap-3 rounded-xl border p-4',
        mpConectado ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200',
      )}>
        <div className="flex items-center gap-2">
          {mpConectado ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Wallet className="h-5 w-5 text-amber-600" />}
          <div>
            <p className="text-sm font-medium text-foreground">
              {mpConectado ? 'Mercado Pago conectado' : 'Conecte sua conta do Mercado Pago'}
            </p>
            <p className="text-xs text-muted-foreground">
              {mpConectado ? 'Sua parte das vendas e comissões cai direto na sua conta.' : 'Sem isso você não recebe automaticamente as vendas e comissões.'}
            </p>
          </div>
        </div>
        {!mpConectado && (
          <Button size="sm" onClick={() => conectarMercadoPago(parceiraId)}>Conectar</Button>
        )}
      </div>
    </div>
  );
}

export function ParceiroPortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('produtos');
  const [parceiraId, setParceiraId] = useState<string | null>(null);
  const [nomeParceira, setNomeParceira] = useState('');
  const [mpConectado, setMpConectado] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from('parceiros' as any).select('id, nome, mp_connected_at').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        setParceiraId((data as any)?.id ?? null);
        setNomeParceira((data as any)?.nome ?? user.nome);
        setMpConectado(!!(data as any)?.mp_connected_at);
        setLoading(false);
      });
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mp = params.get('mp');
    if (mp === 'ok') { toast.success('Mercado Pago conectado com sucesso!'); setMpConectado(true); }
    if (mp === 'erro') toast.error('Não deu pra conectar o Mercado Pago. Tente novamente.');
    if (mp) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-white border-b border-border">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Programa de Parceiros IDM</p>
            <p className="font-semibold text-foreground">{nomeParceira || 'Parceira'}</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6">
        <div className="flex gap-1 border-b mb-6">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !parceiraId ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            Seu login ainda não está vinculado a um cadastro de parceira. Fale com o time do IDM.
          </div>
        ) : (
          <>
            {tab === 'produtos' && <MeusProdutos parceiraId={parceiraId} />}
            {tab === 'cupons' && <MeusCupons parceiraId={parceiraId} />}
            {tab === 'desempenho' && <DesempenhoParceiros scopedParceiroId={parceiraId} />}
            {tab === 'entregas' && <EntregasParceiros scopedParceiroId={parceiraId} />}
            {tab === 'perfil' && <MeuPerfil parceiraId={parceiraId} nomeParceira={nomeParceira} mpConectado={mpConectado} />}
          </>
        )}
      </main>
    </div>
  );
}
