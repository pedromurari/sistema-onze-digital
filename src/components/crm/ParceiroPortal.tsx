import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, LogOut, ShoppingBag, BarChart3, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { DesempenhoParceiros } from './DesempenhoParceiros';
import { EntregasParceiros } from './EntregasParceiros';

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
  { key: 'desempenho', label: 'Desempenho', icon: BarChart3 },
  { key: 'entregas', label: 'Entregas', icon: ClipboardList },
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
          </div>
        );
      })}
    </div>
  );
}

export function ParceiroPortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('produtos');
  const [parceiraId, setParceiraId] = useState<string | null>(null);
  const [nomeParceira, setNomeParceira] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from('parceiros' as any).select('id, nome').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        setParceiraId((data as any)?.id ?? null);
        setNomeParceira((data as any)?.nome ?? user.nome);
        setLoading(false);
      });
  }, [user]);

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
            {tab === 'desempenho' && <DesempenhoParceiros scopedParceiroId={parceiraId} />}
            {tab === 'entregas' && <EntregasParceiros scopedParceiroId={parceiraId} />}
          </>
        )}
      </main>
    </div>
  );
}
