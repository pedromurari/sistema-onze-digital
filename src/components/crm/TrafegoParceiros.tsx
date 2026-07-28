import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, Plus, Copy, Link2, MousePointerClick, ShoppingCart, DollarSign, Power } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

type ParceiroLite = { id: string; nome: string };
type ProdutoLite = { id: string; nome: string; parceiro_id: string };

type LinkRow = {
  id: string;
  parceiro_id: string;
  produto_id: string | null;
  slug: string;
  titulo: string | null;
  destino_url: string;
  ativo: boolean;
  created_at: string;
  parceiros_produtos: { nome: string } | null;
};

type VendaResumo = { produto_id: string; produto_nome: string; vendas: number; receita: number };

const ACCENT_MAP: Record<string, string> = {
  á: 'a', à: 'a', ã: 'a', â: 'a', ä: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', õ: 'o', ô: 'o', ö: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ç: 'c', ñ: 'n',
};

function slugify(s: string) {
  const semAcento = s.toLowerCase().split('').map(c => ACCENT_MAP[c] ?? c).join('');
  return semAcento
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Dominio proprio pros links rastreaveis (em vez do dominio feio do Vercel).
// Precisa de um CNAME em ir.idmpsi.com.br apontando pra este projeto Vercel.
const LINK_BASE_URL = 'https://ir.idmpsi.com.br';

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
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

// ── Componente principal ─────────────────────────────────────────────────────

export function TrafegoParceiros({ scopedParceiroId }: { scopedParceiroId?: string }) {
  const admin = !scopedParceiroId;
  const [parceiros, setParceiros] = useState<ParceiroLite[]>([]);
  const [produtos, setProdutos] = useState<ProdutoLite[]>([]);
  const [filtroParceira, setFiltroParceira] = useState<string>(scopedParceiroId || 'all');
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [cliquesPorLink, setCliquesPorLink] = useState<Record<string, number>>({});
  const [cliquesPorDia, setCliquesPorDia] = useState<{ dia: string; cliques: number }[]>([]);
  const [vendasResumo, setVendasResumo] = useState<VendaResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ parceiro_id: scopedParceiroId || '', produto_id: '', titulo: '', destino_url: '' });

  const parceiraAtual = admin ? (filtroParceira === 'all' ? null : filtroParceira) : scopedParceiroId!;

  useEffect(() => {
    if (!admin) return;
    supabase.from('parceiros' as any).select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => setParceiros((data as any) || []));
  }, [admin]);

  const loadProdutos = useCallback(async () => {
    let query = supabase.from('parceiros_produtos' as any).select('id, nome, parceiro_id');
    if (parceiraAtual) query = query.eq('parceiro_id', parceiraAtual);
    const { data } = await query.order('nome');
    setProdutos((data as any) || []);
  }, [parceiraAtual]);

  useEffect(() => { loadProdutos(); }, [loadProdutos]);

  const load = useCallback(async () => {
    setLoading(true);

    let linksQuery = supabase.from('parceiros_links' as any)
      .select('id, parceiro_id, produto_id, slug, titulo, destino_url, ativo, created_at, parceiros_produtos(nome)')
      .order('created_at', { ascending: false });
    if (parceiraAtual) linksQuery = linksQuery.eq('parceiro_id', parceiraAtual);
    const { data: linksData, error: linksErr } = await linksQuery;
    if (linksErr) { toast.error(`Erro ao carregar links: ${linksErr.message}`); setLoading(false); return; }
    const linkRows = ((linksData as any) || []) as LinkRow[];
    setLinks(linkRows);

    const linkIds = linkRows.map(l => l.id);
    if (linkIds.length > 0) {
      const desde = startOfDay(subDays(new Date(), 13)).toISOString();
      const { data: cliques } = await supabase.from('parceiros_cliques' as any)
        .select('link_id, created_at')
        .in('link_id', linkIds)
        .gte('created_at', desde);
      const rows = ((cliques as any) || []) as { link_id: string; created_at: string }[];

      const porLink: Record<string, number> = {};
      const porDia: Record<string, number> = {};
      for (let i = 13; i >= 0; i--) porDia[format(subDays(new Date(), i), 'dd/MM')] = 0;
      rows.forEach(c => {
        porLink[c.link_id] = (porLink[c.link_id] || 0) + 1;
        const dia = format(new Date(c.created_at), 'dd/MM');
        if (dia in porDia) porDia[dia] += 1;
      });
      setCliquesPorLink(porLink);
      setCliquesPorDia(Object.entries(porDia).map(([dia, cliques]) => ({ dia, cliques })));
    } else {
      setCliquesPorLink({});
      setCliquesPorDia([]);
    }

    let vendasQuery = supabase.from('parceiros_vendas' as any)
      .select('produto_id, valor_bruto, status, parceiros_produtos!inner(nome, parceiro_id)')
      .neq('status', 'recusado');
    if (parceiraAtual) vendasQuery = vendasQuery.eq('parceiros_produtos.parceiro_id', parceiraAtual);
    const { data: vendasData } = await vendasQuery;
    const resumo: Record<string, VendaResumo> = {};
    ((vendasData as any) || []).forEach((v: any) => {
      const key = v.produto_id;
      if (!resumo[key]) resumo[key] = { produto_id: key, produto_nome: v.parceiros_produtos?.nome ?? 'Produto', vendas: 0, receita: 0 };
      resumo[key].vendas += 1;
      if (v.status === 'aprovado') resumo[key].receita += Number(v.valor_bruto || 0);
    });
    setVendasResumo(Object.values(resumo));

    setLoading(false);
  }, [parceiraAtual]);

  useEffect(() => { load(); }, [load]);

  const totalCliques = useMemo(() => Object.values(cliquesPorLink).reduce((s, v) => s + v, 0), [cliquesPorLink]);
  const totalVendas = useMemo(() => vendasResumo.reduce((s, v) => s + v.vendas, 0), [vendasResumo]);
  const totalReceita = useMemo(() => vendasResumo.reduce((s, v) => s + v.receita, 0), [vendasResumo]);

  const criarLink = async () => {
    if (!form.parceiro_id) { toast.error('Selecione a parceira.'); return; }
    if (!form.destino_url.trim()) { toast.error('Informe a URL de destino (ex: link de checkout da SyncPay).'); return; }
    if (!form.titulo.trim()) { toast.error('Dê um nome pro link (ex: "Cicatrizes — bio do Instagram").'); return; }

    const base = slugify(form.titulo) || 'link';
    const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;

    setSaving(true);
    const { data: parceiraRow } = await supabase.from('parceiros' as any).select('nome').eq('id', form.parceiro_id).maybeSingle();
    const parceiraNome = (parceiraRow as any)?.nome ?? null;
    let produtoNome: string | null = null;
    if (form.produto_id) {
      const { data: produtoRow } = await supabase.from('parceiros_produtos' as any).select('nome').eq('id', form.produto_id).maybeSingle();
      produtoNome = (produtoRow as any)?.nome ?? null;
    }
    const { error } = await (supabase.from('parceiros_links' as any) as any).insert({
      parceiro_id: form.parceiro_id,
      produto_id: form.produto_id || null,
      titulo: form.titulo.trim(),
      destino_url: form.destino_url.trim(),
      slug,
      parceira_nome: parceiraNome,
      produto_nome: produtoNome,
    });
    setSaving(false);
    if (error) { toast.error(`Erro ao criar link: ${error.message}`); return; }
    toast.success('Link criado.');
    setForm(f => ({ ...f, titulo: '', destino_url: '', produto_id: '' }));
    load();
  };

  const toggleAtivo = async (link: LinkRow) => {
    const { error } = await supabase.from('parceiros_links' as any).update({ ativo: !link.ativo }).eq('id', link.id);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    load();
  };

  const copiarLink = (slug: string) => {
    navigator.clipboard.writeText(`${LINK_BASE_URL}/ir/${slug}`);
    toast.success('Link copiado!');
  };

  return (
    <div className="space-y-5">
      {admin && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filtroParceira} onValueChange={setFiltroParceira}>
            <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Parceira" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as parceiras</SelectItem>
              {parceiros.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
        Os cliques abaixo são dos <strong>nossos links de divulgação</strong> (aba de baixo). Vendas de checkout hospedado (SyncPay) não repassam quem clicou em qual link — por isso cliques e vendas aparecem como funil aproximado, não 1-para-1 por visitante.
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={MousePointerClick} label="Cliques (14 dias)" value={totalCliques.toLocaleString('pt-BR')} color="bg-blue-50 text-blue-600" />
        <StatCard icon={ShoppingCart} label="Vendas" value={String(totalVendas)} color="bg-violet-50 text-violet-600" />
        <StatCard icon={DollarSign} label="Receita aprovada" value={totalReceita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} color="bg-emerald-50 text-emerald-600" />
        <StatCard icon={Link2} label="Links ativos" value={String(links.filter(l => l.ativo).length)} color="bg-amber-50 text-amber-600" />
      </div>

      {cliquesPorDia.some(d => d.cliques > 0) && (
        <div className="bg-white border border-border rounded-xl p-4">
          <p className="text-sm font-semibold text-foreground mb-3">Cliques por dia (últimos 14 dias)</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={cliquesPorDia}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="dia" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} width={28} />
              <Tooltip />
              <Bar dataKey="cliques" fill="#6c63ff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {vendasResumo.length > 0 && (
        <div className="bg-white border border-border rounded-xl divide-y divide-border">
          <p className="text-sm font-semibold text-foreground p-3 pb-2">Vendas por produto</p>
          {vendasResumo.map(v => (
            <div key={v.produto_id} className="flex items-center gap-3 p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{v.produto_nome}</p>
                <p className="text-xs text-muted-foreground">{v.vendas} venda{v.vendas === 1 ? '' : 's'}</p>
              </div>
              <span className="text-sm font-semibold text-emerald-600">{v.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-border rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">Novo link rastreável</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {admin && (
            <Select value={form.parceiro_id} onValueChange={v => setForm(f => ({ ...f, parceiro_id: v, produto_id: '' }))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Parceira..." /></SelectTrigger>
              <SelectContent>{parceiros.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={form.produto_id || 'none'} onValueChange={v => setForm(f => ({ ...f, produto_id: v === 'none' ? '' : v }))}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Produto (opcional)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem produto específico</SelectItem>
              {produtos.filter(p => !form.parceiro_id || p.parceiro_id === form.parceiro_id).map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input className="h-9" placeholder="Nome do link (ex: bio Instagram)" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
          <Input className="h-9" placeholder="URL de destino (checkout, etc)" value={form.destino_url} onChange={e => setForm(f => ({ ...f, destino_url: e.target.value }))} />
        </div>
        <Button disabled={saving} onClick={criarLink}>
          <Plus className="h-4 w-4 mr-1" /> {saving ? 'Salvando...' : 'Criar link'}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : links.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Nenhum link criado ainda.</div>
      ) : (
        <div className="bg-white border border-border rounded-xl divide-y divide-border">
          {links.map(l => (
            <div key={l.id} className="flex items-center gap-3 p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{l.titulo || l.slug}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {l.parceiros_produtos?.nome ? `${l.parceiros_produtos.nome} · ` : ''}/ir/{l.slug}
                  {' · '}{format(new Date(l.created_at), "dd/MM/yy", { locale: ptBR })}
                </p>
              </div>
              <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200">
                {cliquesPorLink[l.id] || 0} clique{(cliquesPorLink[l.id] || 0) === 1 ? '' : 's'}
              </Badge>
              <Badge variant="outline" className={cn(l.ativo ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200')}>
                {l.ativo ? 'Ativo' : 'Pausado'}
              </Badge>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Copiar link" onClick={() => copiarLink(l.slug)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              {admin && (
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title={l.ativo ? 'Pausar' : 'Reativar'} onClick={() => toggleAtivo(l)}>
                  <Power className={cn('h-3.5 w-3.5', l.ativo ? 'text-emerald-600' : 'text-muted-foreground')} />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
