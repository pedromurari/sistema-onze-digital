import React, { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, differenceInYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Search, Users, ShoppingCart, MessageSquare, TrendingUp, ChevronLeft, ChevronRight, X, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const SeuNumerologoKanban = lazy(() => import('./SeuNumerologoKanban').then(m => ({ default: m.SeuNumerologoKanban })));

// ── Types ────────────────────────────────────────────────────────────────────

type QuizLead = {
  id: string;
  created_at: string;
  email: string | null;
  phone_number: string | null;
  mae_nome: string | null;
  filho_nome: string | null;
  filho_nascimento: string | null;
  perfil_numero: number | null;
  perfil_nome: string | null;
  pontuacao: number | null;
  desconto_pct: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  checkout_clicked: boolean;
  lead_popup_submitted: boolean;
};

const PAGE_SIZE = 50;

const PERFIL_COLORS: Record<number, string> = {
  1: 'bg-violet-100 text-violet-700 border-violet-200',
  2: 'bg-blue-100 text-blue-700 border-blue-200',
  3: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  4: 'bg-orange-100 text-orange-700 border-orange-200',
  5: 'bg-pink-100 text-pink-700 border-pink-200',
  6: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  7: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  8: 'bg-red-100 text-red-700 border-red-200',
};

function perfilColor(num: number | null) {
  if (!num) return 'bg-gray-100 text-gray-600 border-gray-200';
  return PERFIL_COLORS[num] ?? 'bg-gray-100 text-gray-600 border-gray-200';
}

function descontoColor(d: string | null) {
  if (!d) return 'bg-gray-100 text-gray-500 border-gray-200';
  const v = d.toLowerCase();
  if (v === 'especial') return 'bg-purple-100 text-purple-700 border-purple-200';
  if (v === 'alto')     return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (v === 'medio')    return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-gray-100 text-gray-500 border-gray-200';
}

function age(dob: string | null): string {
  if (!dob) return '—';
  try {
    const years = differenceInYears(new Date(), new Date(dob));
    return `${years} anos`;
  } catch { return '—'; }
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white border border-border rounded-xl p-4 flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
      </div>
    </div>
  );
}

// ── Quiz IDM tab ─────────────────────────────────────────────────────────────

function QuizIDMTab() {
  const [leads, setLeads] = useState<QuizLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPerfil, setFilterPerfil] = useState('');
  const [filterDesconto, setFilterDesconto] = useState('');
  const [filterCheckout, setFilterCheckout] = useState<'all' | 'yes' | 'no'>('all');
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState({ total: 0, checkouts: 0, popups: 0 });
  const [perfis, setPerfis] = useState<string[]>([]);
  const [descontos, setDescontos] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('idm_quiz_leads' as any).select('id', { count: 'exact', head: true }),
      supabase.from('idm_quiz_leads' as any).select('id', { count: 'exact', head: true }).eq('checkout_clicked', true),
      supabase.from('idm_quiz_leads' as any).select('id', { count: 'exact', head: true }).eq('lead_popup_submitted', true),
      supabase.from('idm_quiz_leads' as any).select('perfil_nome').not('perfil_nome', 'is', null),
      supabase.from('idm_quiz_leads' as any).select('desconto_pct').not('desconto_pct', 'is', null),
    ]).then(([tot, ckout, popup, perfilData, descData]) => {
      setStats({ total: (tot as any).count || 0, checkouts: (ckout as any).count || 0, popups: (popup as any).count || 0 });
      const uniquePerfis = [...new Set(((perfilData as any).data || []).map((r: any) => r.perfil_nome))].filter(Boolean) as string[];
      const uniqueDescontos = [...new Set(((descData as any).data || []).map((r: any) => r.desconto_pct))].filter(Boolean) as string[];
      setPerfis(uniquePerfis.sort());
      setDescontos(uniqueDescontos.sort());
    });
  }, []);

  const loadLeads = useCallback(async (p: number) => {
    setLoading(true);
    let query = (supabase.from('idm_quiz_leads' as any) as any)
      .select(
        'id, created_at, email, phone_number, mae_nome, filho_nome, filho_nascimento, perfil_numero, perfil_nome, pontuacao, desconto_pct, utm_source, utm_medium, utm_campaign, checkout_clicked, lead_popup_submitted',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1);

    if (search.trim()) {
      query = query.or(`email.ilike.%${search.trim()}%,mae_nome.ilike.%${search.trim()}%,filho_nome.ilike.%${search.trim()}%,phone_number.ilike.%${search.trim()}%`);
    }
    if (filterPerfil)  query = query.eq('perfil_nome', filterPerfil);
    if (filterDesconto) query = query.eq('desconto_pct', filterDesconto);
    if (filterCheckout === 'yes') query = query.eq('checkout_clicked', true);
    if (filterCheckout === 'no')  query = query.eq('checkout_clicked', false);

    const { data, count } = await query;
    setLeads((data as QuizLead[]) || []);
    setTotal(count || 0);
    setLoading(false);
  }, [search, filterPerfil, filterDesconto, filterCheckout]);

  useEffect(() => { setPage(0); }, [search, filterPerfil, filterDesconto, filterCheckout]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadLeads(page), search ? 350 : 0);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [loadLeads, page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const checkoutRate = stats.total > 0 ? ((stats.checkouts / stats.total) * 100).toFixed(1) : '0';

  const activeFilters = [
    filterPerfil && { label: filterPerfil, clear: () => setFilterPerfil('') },
    filterDesconto && { label: `Desconto: ${filterDesconto}`, clear: () => setFilterDesconto('') },
    filterCheckout !== 'all' && { label: filterCheckout === 'yes' ? 'Checkout: sim' : 'Checkout: não', clear: () => setFilterCheckout('all') },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users}         label="Total de Leads"    value={stats.total.toLocaleString('pt-BR')} color="bg-blue-50 text-blue-600" />
        <StatCard icon={ShoppingCart}  label="Clicaram Checkout" value={stats.checkouts.toLocaleString('pt-BR')} color="bg-emerald-50 text-emerald-600" />
        <StatCard icon={MessageSquare} label="Popup Submetido"   value={stats.popups.toLocaleString('pt-BR')} color="bg-violet-50 text-violet-600" />
        <StatCard icon={TrendingUp}    label="Taxa de Checkout"  value={`${checkoutRate}%`} color="bg-orange-50 text-orange-600" />
      </div>

      {/* Filters */}
      <div className="bg-white border border-border rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por nome, e-mail, telefone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <select
            value={filterPerfil}
            onChange={e => setFilterPerfil(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Todos os perfis</option>
            {perfis.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select
            value={filterDesconto}
            onChange={e => setFilterDesconto(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Todos os descontos</option>
            {descontos.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          <select
            value={filterCheckout}
            onChange={e => setFilterCheckout(e.target.value as 'all' | 'yes' | 'no')}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">Checkout: todos</option>
            <option value="yes">Checkout: sim</option>
            <option value="no">Checkout: não</option>
          </select>

          {activeFilters.length > 0 && (
            <button
              onClick={() => { setFilterPerfil(''); setFilterDesconto(''); setFilterCheckout('all'); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Limpar filtros
            </button>
          )}
        </div>

        {activeFilters.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {activeFilters.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/8 text-primary text-xs font-medium border border-primary/20">
                {f.label}
                <button onClick={f.clear} className="hover:opacity-70"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">Data</th>
                <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">Mãe</th>
                <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">Filho(a)</th>
                <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">Perfil</th>
                <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">Pontos</th>
                <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">Desconto</th>
                <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">Checkout</th>
                <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">Popup</th>
                <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">E-mail</th>
                <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">Telefone</th>
                <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      Carregando...
                    </div>
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                    Nenhum lead encontrado
                  </td>
                </tr>
              ) : (
                leads.map((lead, i) => (
                  <tr key={lead.id} className={cn('transition-colors hover:bg-muted/20', i % 2 === 0 ? 'bg-white' : 'bg-muted/10')}>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {format(new Date(lead.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">{lead.mae_nome || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium text-foreground">{lead.filho_nome || '—'}</span>
                      {lead.filho_nascimento && (
                        <span className="ml-1.5 text-xs text-muted-foreground">({age(lead.filho_nascimento)})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {lead.perfil_nome ? (
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', perfilColor(lead.perfil_numero))}>
                          {lead.perfil_numero && <span className="font-bold">{lead.perfil_numero}.</span>}
                          {lead.perfil_nome}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {lead.pontuacao != null ? (
                        <span className="font-mono font-semibold text-foreground">{lead.pontuacao}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {lead.desconto_pct ? (
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize', descontoColor(lead.desconto_pct))}>
                          {lead.desconto_pct}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {lead.checkout_clicked
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        : <XCircle className="h-4 w-4 text-muted-foreground/40" />}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {lead.lead_popup_submitted
                        ? <CheckCircle2 className="h-4 w-4 text-violet-500" />
                        : <XCircle className="h-4 w-4 text-muted-foreground/40" />}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">{lead.email || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{lead.phone_number || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{lead.utm_source || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
          <p className="text-xs text-muted-foreground">
            {total === 0 ? 'Nenhum resultado' : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} de ${total.toLocaleString('pt-BR')} leads`}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-muted-foreground px-2">
              {page + 1} / {Math.max(1, totalPages)}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'quiz', label: 'Quiz IDM' },
  { key: 'mapa', label: 'Mapa 7 Esperas' },
] as const;

type Tab = typeof TABS[number]['key'];

// ── Main ─────────────────────────────────────────────────────────────────────

export function Produtos() {
  const [tab, setTab] = useState<Tab>('quiz');

  return (
    <div className={cn('flex flex-col', tab === 'mapa' ? 'h-full' : 'p-6 space-y-6 max-w-[1600px]')}>
      {/* Header + tabs */}
      <div className={cn(tab === 'mapa' && 'px-6 pt-6')}>
        <h1 className="text-2xl font-bold text-foreground">Produtos</h1>
        <div className="flex gap-1 border-b mt-4">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {tab === 'quiz' && (
        <QuizIDMTab />
      )}
      {tab === 'mapa' && (
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
            <SeuNumerologoKanban />
          </Suspense>
        </div>
      )}
    </div>
  );
}
