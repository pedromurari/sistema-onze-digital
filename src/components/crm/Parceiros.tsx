import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Loader2, Plus, Upload, CheckCircle2, XCircle, PlayCircle, PauseCircle, RotateCcw, Users, ShoppingBag, KeyRound, TrendingUp, Settings2, ClipboardList, Ticket, DollarSign, ShieldCheck, Eye, Link2, MousePointerClick,
} from 'lucide-react';
import { DesempenhoParceiros } from './DesempenhoParceiros';
import { EntregasParceiros } from './EntregasParceiros';
import { CuponsParceiros } from './CuponsParceiros';
import { TrafegoParceiros } from './TrafegoParceiros';
import { LinksParceiros } from './LinksParceiros';
import { RepassesParceiros } from './RepassesParceiros';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

type Parceiro = {
  id: string;
  nome: string;
  whatsapp: string | null;
  email: string | null;
  status_contrato: 'pendente' | 'assinado';
  ativo: boolean;
  user_id: string | null;
  mp_connected_at: string | null;
};

function gerarSenhaProvisoria() {
  return `Idm${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 100)}!`;
}

type ProdutoStatus = 'em_analise' | 'aprovado' | 'ativo' | 'pausado' | 'reprovado';

type Produto = {
  id: string;
  parceiro_id: string;
  nome: string;
  descricao: string | null;
  preco: number | null;
  status: ProdutoStatus;
  comissao_idm_pct: number | null;
  comissao_parceiro_pct: number | null;
  comissao_afiliado_padrao_pct: number | null;
  material_url: string | null;
  created_at: string;
  parceiros: { id: string; nome: string } | null;
  meta_campaign_id: string | null;
  meta_ad_account_id: string | null;
  meta_access_token: string | null;
  bump_ativo: boolean;
  bump_nome: string | null;
  bump_descricao: string | null;
  bump_preco: number | null;
  syncpay_product_token: string | null;
  syncpay_checkout_url: string | null;
  syncpay_taxa_fixa: number | null;
};

const STATUS_CONFIG: Record<ProdutoStatus, { label: string; className: string }> = {
  em_analise: { label: 'Em análise', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  aprovado:   { label: 'Aprovado',   className: 'bg-blue-100 text-blue-700 border-blue-200' },
  ativo:      { label: 'Ativo',      className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  pausado:    { label: 'Pausado',    className: 'bg-gray-100 text-gray-700 border-gray-200' },
  reprovado:  { label: 'Reprovado',  className: 'bg-red-100 text-red-700 border-red-200' },
};

const EMPTY_FORM = {
  parceiro_id: '',
  nome: '',
  preco: '',
  descricao: '',
  comissao_idm_pct: '',
  comissao_parceiro_pct: '',
  comissao_afiliado_padrao_pct: '',
};

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

// ── Produtos tab ─────────────────────────────────────────────────────────────

function ProdutosTab() {
  const { user } = useAuth();
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [materialUrl, setMaterialUrl] = useState('');
  const [materialNome, setMaterialNome] = useState('');
  const [adsDialog, setAdsDialog] = useState<Produto | null>(null);
  const [adsForm, setAdsForm] = useState({ meta_campaign_id: '', meta_ad_account_id: '', meta_access_token: '' });
  const [savingAds, setSavingAds] = useState(false);
  const [bumpDialog, setBumpDialog] = useState<Produto | null>(null);
  const [bumpForm, setBumpForm] = useState({ bump_ativo: false, bump_nome: '', bump_descricao: '', bump_preco: '' });
  const [savingBump, setSavingBump] = useState(false);
  const [syncDialog, setSyncDialog] = useState<Produto | null>(null);
  const [syncForm, setSyncForm] = useState({ syncpay_product_token: '', syncpay_checkout_url: '', syncpay_taxa_fixa: '' });
  const [savingSync, setSavingSync] = useState(false);

  const loadParceiros = useCallback(async () => {
    const { data } = await supabase.from('parceiros' as any).select('id, nome, whatsapp, email, status_contrato, ativo').eq('ativo', true).order('nome');
    setParceiros((data as any) || []);
  }, []);

  const loadProdutos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase.from('parceiros_produtos' as any) as any)
      .select('id, parceiro_id, nome, descricao, preco, status, comissao_idm_pct, comissao_parceiro_pct, comissao_afiliado_padrao_pct, material_url, created_at, parceiros(id, nome), meta_campaign_id, meta_ad_account_id, meta_access_token, bump_ativo, bump_nome, bump_descricao, bump_preco, syncpay_product_token, syncpay_checkout_url, syncpay_taxa_fixa')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error(`Erro ao carregar produtos: ${error.message}`);
      setLoading(false);
      return;
    }
    setProdutos((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadParceiros(); }, [loadParceiros]);
  useEffect(() => { loadProdutos(); }, [loadProdutos]);

  const handleMaterialUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('parceiros-materiais').upload(path, file, { upsert: true });
    setUploading(false);
    if (error) {
      toast.error(`Erro no upload: ${error.message}`);
      return;
    }
    const { data } = supabase.storage.from('parceiros-materiais').getPublicUrl(path);
    setMaterialUrl(data.publicUrl);
    setMaterialNome(file.name);
    toast.success('Material anexado.');
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setMaterialUrl('');
    setMaterialNome('');
  };

  const criarProduto = async () => {
    if (!form.parceiro_id || !form.nome.trim()) {
      toast.error('Selecione a parceira e informe o nome do produto.');
      return;
    }
    setSaving(true);
    const { error } = await (supabase.from('parceiros_produtos' as any) as any).insert({
      parceiro_id: form.parceiro_id,
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || null,
      preco: form.preco ? Number(form.preco) : null,
      comissao_idm_pct: form.comissao_idm_pct ? Number(form.comissao_idm_pct) : null,
      comissao_parceiro_pct: form.comissao_parceiro_pct ? Number(form.comissao_parceiro_pct) : null,
      comissao_afiliado_padrao_pct: form.comissao_afiliado_padrao_pct ? Number(form.comissao_afiliado_padrao_pct) : null,
      material_url: materialUrl || null,
      status: 'em_analise',
    });
    setSaving(false);
    if (error) {
      toast.error(`Erro ao salvar produto: ${error.message}`);
      return;
    }
    toast.success('Produto cadastrado e enviado para análise.');
    resetForm();
    loadProdutos();
  };

  const updateStatus = async (produto: Produto, status: ProdutoStatus) => {
    setActingId(produto.id);
    const patch: Record<string, unknown> = { status };
    if (status === 'aprovado') {
      patch.aprovado_por = user?.id ?? null;
      patch.aprovado_em = new Date().toISOString();
    }
    const { error } = await (supabase.from('parceiros_produtos' as any) as any).update(patch).eq('id', produto.id);
    setActingId(null);
    if (error) {
      toast.error(`Erro ao atualizar status: ${error.message}`);
      return;
    }
    toast.success(`Produto marcado como "${STATUS_CONFIG[status].label}".`);
    loadProdutos();
  };

  const abrirDialogAds = (produto: Produto) => {
    setAdsDialog(produto);
    setAdsForm({
      meta_campaign_id: produto.meta_campaign_id || '',
      meta_ad_account_id: produto.meta_ad_account_id || '',
      meta_access_token: produto.meta_access_token || '',
    });
  };

  const salvarAds = async () => {
    if (!adsDialog) return;
    setSavingAds(true);
    const { error } = await (supabase.from('parceiros_produtos' as any) as any).update({
      meta_campaign_id: adsForm.meta_campaign_id.trim() || null,
      meta_ad_account_id: adsForm.meta_ad_account_id.trim() || null,
      meta_access_token: adsForm.meta_access_token.trim() || null,
    }).eq('id', adsDialog.id);
    setSavingAds(false);
    if (error) { toast.error(`Erro ao salvar campanha: ${error.message}`); return; }
    toast.success('Campanha vinculada.');
    setAdsDialog(null);
    loadProdutos();
  };

  const abrirDialogBump = (produto: Produto) => {
    setBumpDialog(produto);
    setBumpForm({
      bump_ativo: produto.bump_ativo,
      bump_nome: produto.bump_nome || '',
      bump_descricao: produto.bump_descricao || '',
      bump_preco: produto.bump_preco != null ? String(produto.bump_preco) : '',
    });
  };

  const salvarBump = async () => {
    if (!bumpDialog) return;
    if (bumpForm.bump_ativo && (!bumpForm.bump_nome.trim() || !bumpForm.bump_preco)) {
      toast.error('Informe nome e preço do order bump antes de ativar.');
      return;
    }
    setSavingBump(true);
    const { error } = await (supabase.from('parceiros_produtos' as any) as any).update({
      bump_ativo: bumpForm.bump_ativo,
      bump_nome: bumpForm.bump_nome.trim() || null,
      bump_descricao: bumpForm.bump_descricao.trim() || null,
      bump_preco: bumpForm.bump_preco ? Number(bumpForm.bump_preco) : null,
    }).eq('id', bumpDialog.id);
    setSavingBump(false);
    if (error) { toast.error(`Erro ao salvar order bump: ${error.message}`); return; }
    toast.success('Order bump atualizado.');
    setBumpDialog(null);
    loadProdutos();
  };

  const abrirDialogSync = (produto: Produto) => {
    setSyncDialog(produto);
    setSyncForm({
      syncpay_product_token: produto.syncpay_product_token || '',
      syncpay_checkout_url: produto.syncpay_checkout_url || '',
      syncpay_taxa_fixa: produto.syncpay_taxa_fixa != null ? String(produto.syncpay_taxa_fixa) : '',
    });
  };

  const salvarSync = async () => {
    if (!syncDialog) return;
    setSavingSync(true);
    const { error } = await (supabase.from('parceiros_produtos' as any) as any).update({
      syncpay_product_token: syncForm.syncpay_product_token.trim() || null,
      syncpay_checkout_url: syncForm.syncpay_checkout_url.trim() || null,
      syncpay_taxa_fixa: syncForm.syncpay_taxa_fixa ? Number(syncForm.syncpay_taxa_fixa) : 0,
    }).eq('id', syncDialog.id);
    setSavingSync(false);
    if (error) { toast.error(`Erro ao salvar SyncPay: ${error.message}`); return; }
    toast.success('Dados da SyncPay salvos.');
    setSyncDialog(null);
    loadProdutos();
  };

  const stats = {
    emAnalise: produtos.filter(p => p.status === 'em_analise').length,
    aprovados: produtos.filter(p => p.status === 'aprovado').length,
    ativos: produtos.filter(p => p.status === 'ativo').length,
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={Loader2} label="Em análise" value={stats.emAnalise} color="bg-amber-50 text-amber-600" />
        <StatCard icon={CheckCircle2} label="Aprovados" value={stats.aprovados} color="bg-blue-50 text-blue-600" />
        <StatCard icon={ShoppingBag} label="Ativos" value={stats.ativos} color="bg-emerald-50 text-emerald-600" />
      </div>

      <div className="bg-white border border-border rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">Novo produto de parceria</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Parceira</Label>
            <Select value={form.parceiro_id} onValueChange={v => setForm(f => ({ ...f, parceiro_id: v }))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecionar parceira..." /></SelectTrigger>
              <SelectContent>
                {parceiros.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Nome do produto</Label>
            <Input className="h-9" placeholder="Ex: Mentoria Foco Total" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Preço (R$)</Label>
            <Input className="h-9" placeholder="497,00" value={form.preco} onChange={e => setForm(f => ({ ...f, preco: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Comissão IDM (%)</Label>
            <Input className="h-9" placeholder="30" value={form.comissao_idm_pct} onChange={e => setForm(f => ({ ...f, comissao_idm_pct: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Comissão parceira (%)</Label>
            <Input className="h-9" placeholder="70" value={form.comissao_parceiro_pct} onChange={e => setForm(f => ({ ...f, comissao_parceiro_pct: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Comissão afiliada padrão (%)</Label>
            <Input className="h-9" placeholder="20" value={form.comissao_afiliado_padrao_pct} onChange={e => setForm(f => ({ ...f, comissao_afiliado_padrao_pct: e.target.value }))} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Descrição</Label>
          <Textarea rows={2} placeholder="Resumo do produto para a página de vendas" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <label className="inline-flex items-center gap-1.5 text-xs h-9 px-3 border border-border rounded-md cursor-pointer hover:bg-muted transition-colors">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {materialNome || 'Anexar material'}
            <input type="file" className="hidden" onChange={handleMaterialUpload} disabled={uploading} />
          </label>
          <Button className="ml-auto" disabled={saving} onClick={criarProduto}>
            <Plus className="h-4 w-4 mr-1" /> {saving ? 'Salvando...' : 'Enviar para análise'}
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Produtos cadastrados</p>
          <span className="text-xs text-muted-foreground">{produtos.length} produto{produtos.length === 1 ? '' : 's'}</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : produtos.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">Nenhum produto cadastrado ainda.</div>
        ) : (
          <div className="bg-white border border-border rounded-xl divide-y divide-border">
            {produtos.map(produto => {
              const cfg = STATUS_CONFIG[produto.status];
              const acting = actingId === produto.id;
              return (
                <div key={produto.id} className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{produto.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {produto.parceiros?.nome ?? 'Parceira'}
                      {produto.preco != null && <> &middot; R$ {Number(produto.preco).toFixed(2)}</>}
                      {' · '}{format(new Date(produto.created_at), "dd/MM/yy", { locale: ptBR })}
                    </p>
                  </div>
                  <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>
                  <div className="flex gap-1.5">
                    {produto.status === 'em_analise' && (
                      <>
                        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={acting} onClick={() => updateStatus(produto, 'aprovado')}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Aprovar
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" disabled={acting} onClick={() => updateStatus(produto, 'reprovado')} title="Reprovar">
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {produto.status === 'aprovado' && (
                      <Button size="sm" variant="outline" className="h-8 text-xs" disabled={acting} onClick={() => updateStatus(produto, 'ativo')}>
                        <PlayCircle className="h-3.5 w-3.5 mr-1" /> Ativar
                      </Button>
                    )}
                    {produto.status === 'ativo' && (
                      <Button size="sm" variant="outline" className="h-8 text-xs" disabled={acting} onClick={() => updateStatus(produto, 'pausado')}>
                        <PauseCircle className="h-3.5 w-3.5 mr-1" /> Pausar
                      </Button>
                    )}
                    {(produto.status === 'pausado' || produto.status === 'reprovado') && (
                      <Button size="sm" variant="outline" className="h-8 text-xs" disabled={acting} onClick={() => updateStatus(produto, 'em_analise')}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reabrir
                      </Button>
                    )}
                    <Button
                      size="sm" variant="ghost" className="h-8 w-8 p-0"
                      title={produto.bump_ativo ? 'Order bump ativo' : 'Configurar order bump'}
                      onClick={() => abrirDialogBump(produto)}
                    >
                      <Plus className={cn('h-3.5 w-3.5', produto.bump_ativo ? 'text-emerald-500' : 'text-muted-foreground')} />
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-8 w-8 p-0"
                      title={produto.meta_campaign_id ? 'Campanha Meta Ads vinculada' : 'Vincular campanha Meta Ads'}
                      onClick={() => abrirDialogAds(produto)}
                    >
                      <Settings2 className={cn('h-3.5 w-3.5', produto.meta_campaign_id ? 'text-blue-500' : 'text-muted-foreground')} />
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-8 w-8 p-0"
                      title={produto.syncpay_product_token ? 'SyncPay vinculada (recebendo vendas por webhook)' : 'Vincular checkout SyncPay'}
                      onClick={() => abrirDialogSync(produto)}
                    >
                      <Link2 className={cn('h-3.5 w-3.5', produto.syncpay_product_token ? 'text-emerald-500' : 'text-muted-foreground')} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!bumpDialog} onOpenChange={(open) => !open && setBumpDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Order bump — {bumpDialog?.nome}</DialogTitle>
            <DialogDescription>
              Oferta extra mostrada no checkout, além do produto principal. O comprador marca uma caixinha pra adicionar por um valor a mais.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={bumpForm.bump_ativo} onChange={e => setBumpForm(f => ({ ...f, bump_ativo: e.target.checked }))} />
              Ativar order bump neste produto
            </label>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nome do item extra</Label>
              <Input placeholder="Ex: Mentoria em grupo" value={bumpForm.bump_nome} onChange={e => setBumpForm(f => ({ ...f, bump_nome: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              <Textarea rows={2} placeholder="O que a pessoa ganha ao adicionar" value={bumpForm.bump_descricao} onChange={e => setBumpForm(f => ({ ...f, bump_descricao: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Preço extra (R$)</Label>
              <Input placeholder="97,00" value={bumpForm.bump_preco} onChange={e => setBumpForm(f => ({ ...f, bump_preco: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBumpDialog(null)}>Cancelar</Button>
            <Button disabled={savingBump} onClick={salvarBump}>{savingBump ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!adsDialog} onOpenChange={(open) => !open && setAdsDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Campanha Meta Ads — {adsDialog?.nome}</DialogTitle>
            <DialogDescription>
              Vincule a campanha de Meta Ads deste produto pra ver CPC e custo por lead reais no Dashboard de Desempenho.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">ID da campanha</Label>
              <Input placeholder="ex: 120202XXXXXXXXX" value={adsForm.meta_campaign_id} onChange={e => setAdsForm(f => ({ ...f, meta_campaign_id: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">ID da conta de anúncios</Label>
              <Input placeholder="ex: act_XXXXXXXXXX" value={adsForm.meta_ad_account_id} onChange={e => setAdsForm(f => ({ ...f, meta_ad_account_id: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Token de acesso (Sistema de Usuários Meta)</Label>
              <Input type="password" placeholder="Token do Usuário do Sistema Meta" value={adsForm.meta_access_token} onChange={e => setAdsForm(f => ({ ...f, meta_access_token: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdsDialog(null)}>Cancelar</Button>
            <Button disabled={savingAds} onClick={salvarAds}>{savingAds ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!syncDialog} onOpenChange={(open) => !open && setSyncDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>SyncPay — {syncDialog?.nome}</DialogTitle>
            <DialogDescription>
              Cole o token do produto criado no dashboard hospedado da SyncPay. Com isso a gente registra um webhook
              escopado só pra esse produto e as vendas passam a aparecer automaticamente na aba Tráfego, sem misturar
              com vendas de outra parceira na mesma conta SyncPay.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Token do produto (SyncPay)</Label>
              <Input placeholder="product_token do dashboard da Sync" value={syncForm.syncpay_product_token} onChange={e => setSyncForm(f => ({ ...f, syncpay_product_token: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Link de checkout (SyncPay)</Label>
              <Input placeholder="https://link.syncpayments.com.br/..." value={syncForm.syncpay_checkout_url} onChange={e => setSyncForm(f => ({ ...f, syncpay_checkout_url: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Taxa fixa da SyncPay por venda (R$)</Label>
              <Input type="number" step="0.01" placeholder="0,00 (ex: Pix até R$100 = grátis)" value={syncForm.syncpay_taxa_fixa} onChange={e => setSyncForm(f => ({ ...f, syncpay_taxa_fixa: e.target.value }))} />
            </div>
            {syncDialog && (
              <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-2 break-all">
                URL do webhook a registrar na SyncPay: <br />
                <span className="font-mono">https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/syncpay-webhook?produto_id={syncDialog.id}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSyncDialog(null)}>Cancelar</Button>
            <Button disabled={savingSync} onClick={salvarSync}>{savingSync ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Parceiros (cadastro) tab ─────────────────────────────────────────────────

function ParceirosTab() {
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [acessoDialog, setAcessoDialog] = useState<Parceiro | null>(null);
  const [acessoEmail, setAcessoEmail] = useState('');
  const [acessoSenha, setAcessoSenha] = useState('');
  const [criandoAcesso, setCriandoAcesso] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('parceiros' as any).select('id, nome, whatsapp, email, status_contrato, ativo, user_id, mp_connected_at').order('nome');
    setParceiros((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const criarParceiro = async () => {
    if (!nome.trim()) {
      toast.error('Informe o nome da parceira.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('parceiros' as any).insert({
      nome: nome.trim(),
      whatsapp: whatsapp.trim() || null,
      email: email.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(`Erro ao salvar parceira: ${error.message}`);
      return;
    }
    toast.success('Parceira cadastrada.');
    setNome(''); setWhatsapp(''); setEmail('');
    load();
  };

  const toggleContrato = async (p: Parceiro) => {
    const novo = p.status_contrato === 'assinado' ? 'pendente' : 'assinado';
    const { error } = await supabase.from('parceiros' as any).update({ status_contrato: novo }).eq('id', p.id);
    if (error) {
      toast.error(`Erro ao atualizar contrato: ${error.message}`);
      return;
    }
    load();
  };

  const abrirDialogAcesso = (p: Parceiro) => {
    setAcessoDialog(p);
    setAcessoEmail(p.email || '');
    setAcessoSenha(gerarSenhaProvisoria());
  };

  const criarAcesso = async () => {
    if (!acessoDialog) return;
    if (!acessoEmail.trim()) { toast.error('Informe o e-mail da parceira.'); return; }
    setCriandoAcesso(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) { toast.error('Sessão expirada. Entre novamente.'); setCriandoAcesso(false); return; }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nome: acessoDialog.nome, email: acessoEmail.trim(), password: acessoSenha, tipo: 'parceiro' }),
      });
      const created = await res.json().catch(() => ({}));
      if (!res.ok || !created?.success) {
        toast.error(created?.error || 'Erro ao criar acesso.');
        setCriandoAcesso(false);
        return;
      }

      const { error: linkError } = await supabase.from('parceiros' as any)
        .update({ user_id: created.user.id, email: acessoEmail.trim() })
        .eq('id', acessoDialog.id);
      if (linkError) {
        toast.error(`Acesso criado, mas não vinculei à parceira: ${linkError.message}`);
        setCriandoAcesso(false);
        return;
      }

      toast.success('Acesso criado! Anote a senha provisória antes de fechar — ela não aparece de novo.');
      setCriandoAcesso(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao criar acesso.');
      setCriandoAcesso(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-border rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">Nova parceira</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input className="h-9" placeholder="Nome completo" value={nome} onChange={e => setNome(e.target.value)} />
          <Input className="h-9" placeholder="WhatsApp" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
          <Input className="h-9" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <Button disabled={saving} onClick={criarParceiro}>
          <Plus className="h-4 w-4 mr-1" /> {saving ? 'Salvando...' : 'Cadastrar parceira'}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="bg-white border border-border rounded-xl divide-y divide-border">
          {parceiros.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{p.nome}</p>
                <p className="text-xs text-muted-foreground truncate">{[p.whatsapp, p.email].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}</p>
              </div>
              <Badge
                variant="outline"
                className={cn('cursor-pointer', p.status_contrato === 'assinado' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200')}
                onClick={() => toggleContrato(p)}
              >
                {p.status_contrato === 'assinado' ? 'Contrato assinado' : 'Contrato pendente'}
              </Badge>
              {p.user_id ? (
                <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200">Acesso criado</Badge>
              ) : (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => abrirDialogAcesso(p)}>
                  <KeyRound className="h-3.5 w-3.5 mr-1" /> Criar acesso
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!acessoDialog} onOpenChange={(open) => !open && setAcessoDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Criar acesso — {acessoDialog?.nome}</DialogTitle>
            <DialogDescription>
              Ela vai poder logar só na área restrita de parceira (produtos, desempenho e entregas dela). Anote a senha provisória e repasse por um canal seguro — ela não aparece de novo depois de fechar esta janela.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">E-mail de login</Label>
              <Input value={acessoEmail} onChange={e => setAcessoEmail(e.target.value)} placeholder="parceira@email.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Senha provisória</Label>
              <Input value={acessoSenha} onChange={e => setAcessoSenha(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcessoDialog(null)}>Cancelar</Button>
            <Button disabled={criandoAcesso} onClick={criarAcesso}>{criandoAcesso ? 'Criando...' : 'Criar acesso'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'desempenho', label: 'Desempenho', icon: TrendingUp },
  { key: 'trafego', label: 'Tráfego', icon: MousePointerClick },
  { key: 'entregas', label: 'Entregas', icon: ClipboardList },
  { key: 'links', label: 'Links', icon: Link2 },
] as const;

type Tab = typeof TABS[number]['key'];

const ADM_TABS = [
  { key: 'parceiras', label: 'Parceiras', icon: Users },
  { key: 'produtos', label: 'Produtos', icon: ShoppingBag },
  { key: 'cupons', label: 'Cupons', icon: Ticket },
  { key: 'repasses', label: 'Repasses', icon: DollarSign },
] as const;

type AdmTab = typeof ADM_TABS[number]['key'];

function AdmPanel() {
  const [admTab, setAdmTab] = useState<AdmTab>('parceiras');

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-1.5">
          <ShieldCheck className="h-4 w-4" /> ADM
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Gestão de Parceiros</SheetTitle>
          <SheetDescription>Visível só pra administração — cadastro de parceiras, produtos e cupons.</SheetDescription>
        </SheetHeader>

        <div className="flex gap-1 border-b mt-4 mb-4">
          {ADM_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setAdmTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                admTab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {admTab === 'parceiras' && <ParceirosTab />}
        {admTab === 'produtos' && <ProdutosTab />}
        {admTab === 'cupons' && <CuponsParceiros />}
        {admTab === 'repasses' && <RepassesParceiros />}
      </SheetContent>
    </Sheet>
  );
}

export function Parceiros() {
  const [tab, setTab] = useState<Tab>('desempenho');
  const [parceiros, setParceiros] = useState<{ id: string; nome: string }[]>([]);
  const [verComo, setVerComo] = useState<string>('todas');

  useEffect(() => {
    supabase.from('parceiros' as any).select('id, nome').eq('ativo', true).order('nome').then(({ data }) => setParceiros((data as any) || []));
  }, []);

  const scopedId = verComo === 'todas' ? undefined : verComo;

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Parceiros</h1>
          <p className="text-sm text-muted-foreground">Desempenho, entregas e vendas do Programa de Parceiros IDM.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <Select value={verComo} onValueChange={setVerComo}>
              <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Ver como..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Ver tudo (visão admin)</SelectItem>
                {parceiros.map(p => <SelectItem key={p.id} value={p.id}>Ver como {p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <AdmPanel />
        </div>
      </div>

      {scopedId && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
          Visualizando exatamente o que <strong>{parceiros.find(p => p.id === scopedId)?.nome}</strong> vê no próprio login — sem os controles de administração.
        </div>
      )}

      <div className="flex gap-1 border-b">
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

      {tab === 'desempenho' && <DesempenhoParceiros scopedParceiroId={scopedId} />}
      {tab === 'trafego' && <TrafegoParceiros scopedParceiroId={scopedId} />}
      {tab === 'entregas' && <EntregasParceiros scopedParceiroId={scopedId} />}
      {tab === 'links' && <LinksParceiros scopedParceiroId={scopedId} editable />}
    </div>
  );
}
