import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
  Plus, Search, AlertCircle, Users, Target, DollarSign,
  Loader2, Power, Trash2, Pencil, TrendingUp, BarChart2,
  ChevronUp, ChevronDown, Upload, FileText, UserCheck, Globe, Copy,
  Send, Play, Square, Pause, X as XIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useKanbanColunas } from './kanban/useKanbanColunas';
import type { KanbanColuna } from './kanban/useKanbanColunas';
import {
  KanbanColunaHeader, AddColunaButton,
  RenameColunaModal, ColunaSettingsModal, DeleteColunaModal,
} from './kanban/KanbanColunasUI';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveView = 'kanban' | 'metas' | 'relatorio' | 'trafego';

interface Launch {
  id: string;
  nome: string;
  status: 'planejamento' | 'em_andamento' | 'finalizado';
  ativo: boolean;
  created_at: string;
  valor_matricula?: number;
  meta_leads?: number;
  meta_matriculas?: number;
  meta_faturamento?: number;
  meta_campaign_id?: string;
  meta_ad_account_id?: string;
  meta_access_token?: string;
  grupo_lancamento_jid?: string;
  grupo_oferta_jid?: string;
  // Wizard: turma destino (auto-matrícula)
  turma_destino_id?: string;
  produto_destino?: string;
  valor_mensalidade_destino?: number;
  dia_vencimento_destino?: number;
  total_mensalidades_destino?: number;
}

interface LaunchLead {
  id: string;
  lancamento_id: string;
  nome: string;
  whatsapp: string;
  email?: string;
  fase: string; // UUID of kanban_colunas.id
  no_grupo: boolean;
  grupo_oferta: boolean;
  follow_up_01?: boolean | string;
  follow_up_02?: boolean | string;
  follow_up_03?: boolean | string;
  matriculado: boolean;
  erro?: string;
  observacoes?: string;
  sheets_row_index?: number;
  responsavel_id?: string;
  created_at: string;
}

interface LancamentoKanbanProps {
  lancamentoId: string;
}

interface Turma {
  id: string; nome: string; produto: string;
  valor_mensalidade?: number | null; total_mensalidades?: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALOR_MATRICULA_PADRAO = 109.90;

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Normalize column name for fuzzy matching
function normColName(s: string) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_').trim();
}

// Derive boolean flag payload from a column's nome (handles custom names too)
function getPhasePayloadByColName(nome: string): Record<string, boolean> {
  const n = normColName(nome);
  if (n === 'planilha')
    return { no_grupo: false, grupo_oferta: false, follow_up_01: false, follow_up_02: false, follow_up_03: false, matriculado: false };
  if (n.includes('grupo') && (n.includes('lancamento') || n.includes('lançamento')))
    return { no_grupo: true, grupo_oferta: false, follow_up_01: false, follow_up_02: false, follow_up_03: false, matriculado: false };
  if (n.includes('grupo') && n.includes('oferta'))
    return { grupo_oferta: true, follow_up_01: false, follow_up_02: false, follow_up_03: false, matriculado: false };
  if (n.includes('follow') && n.includes('01'))
    return { follow_up_01: true, follow_up_02: false, follow_up_03: false, matriculado: false };
  if (n.includes('follow') && n.includes('02'))
    return { follow_up_02: true, follow_up_03: false, matriculado: false };
  if (n.includes('follow') && n.includes('03'))
    return { follow_up_03: true, matriculado: false };
  if (n.includes('matricul'))
    return { matriculado: true };
  return {}; // Custom column — no boolean side-effects
}

// Map legacy string fase values → column UUID
const LEGACY_FASE_NAMES: Record<string, string> = {
  planilha:          'planilha',
  grupo_lancamento:  'grupo lancamento',
  grupo_oferta:      'grupo oferta',
  follow_up_01:      'follow up 01',
  follow_up_02:      'follow up 02',
  follow_up_03:      'follow up 03',
  matricula:         'matricula',
};

function resolveLegacyFase(fase: string, colunas: KanbanColuna[]): string {
  const target = normColName(LEGACY_FASE_NAMES[fase] ?? fase.replace(/_/g, ' '));
  const col = colunas.find(c => normColName(c.nome) === target || normColName(c.nome).includes(target));
  return col?.id ?? colunas[0].id;
}

function findColunaIdByName(colunas: KanbanColuna[], matcher: (normalizedName: string) => boolean): string | null {
  const coluna = colunas.find(c => matcher(normColName(c.nome)));
  return coluna?.id ?? null;
}

function countLeadsByFase(leads: LaunchLead[], colunaId: string | null, fallback?: (lead: LaunchLead) => boolean) {
  if (colunaId) return leads.filter(lead => lead.fase === colunaId).length;
  return fallback ? leads.filter(fallback).length : 0;
}

// ─── MetaBar ──────────────────────────────────────────────────────────────────

function MetaBar({ label, atual, meta, color }: { label: string; atual: number; meta: number; color: string }) {
  const pct = meta > 0 ? Math.min((atual / meta) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{atual} / {meta} ({pct.toFixed(0)}%)</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── MetaTab ──────────────────────────────────────────────────────────────────

function MetaTab({
  lancamento,
  leads,
  onSave,
}: {
  lancamento: Launch;
  leads: LaunchLead[];
  onSave: (updates: Partial<Launch>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    meta_leads: String(lancamento.meta_leads ?? ''),
    meta_matriculas: String(lancamento.meta_matriculas ?? ''),
    meta_faturamento: String(lancamento.meta_faturamento ?? ''),
  });
  const [saving, setSaving] = useState(false);

  const totalLeads = leads.length;
  const matriculas = leads.filter(l => l.matriculado).length;
  const valorMatricula = Number(lancamento.valor_matricula) || VALOR_MATRICULA_PADRAO;
  const receitaReal = matriculas * valorMatricula;

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      meta_leads: Number(form.meta_leads) || 0,
      meta_matriculas: Number(form.meta_matriculas) || 0,
      meta_faturamento: Number(form.meta_faturamento) || 0,
    });
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Form */}
      <Card className="p-6 border border-border space-y-4">
        <h3 className="font-semibold text-base">Definir Metas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Meta de Leads</label>
            <Input
              type="number"
              value={form.meta_leads}
              onChange={e => setForm(f => ({ ...f, meta_leads: e.target.value }))}
              placeholder="Ex: 500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Meta de Matrículas</label>
            <Input
              type="number"
              value={form.meta_matriculas}
              onChange={e => setForm(f => ({ ...f, meta_matriculas: e.target.value }))}
              placeholder="Ex: 50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Meta de Faturamento (R$)</label>
            <Input
              type="number"
              value={form.meta_faturamento}
              onChange={e => setForm(f => ({ ...f, meta_faturamento: e.target.value }))}
              placeholder="Ex: 5495"
            />
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? 'Salvando...' : 'Salvar Metas'}
        </Button>
      </Card>

      {/* Meta vs Realidade */}
      <Card className="p-6 border border-border space-y-4">
        <h3 className="font-semibold text-base">Meta vs Realidade</h3>
        <MetaBar
          label="Leads"
          atual={totalLeads}
          meta={lancamento.meta_leads ?? 0}
          color="bg-blue-500"
        />
        <MetaBar
          label="Matrículas"
          atual={matriculas}
          meta={lancamento.meta_matriculas ?? 0}
          color="bg-green-500"
        />
        <MetaBar
          label={`Faturamento (R$ ${fmt(receitaReal)})`}
          atual={receitaReal}
          meta={lancamento.meta_faturamento ?? 0}
          color="bg-purple-500"
        />
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Leads', value: String(totalLeads), color: 'text-blue-600' },
          { label: 'Matrículas', value: String(matriculas), color: 'text-green-600' },
          { label: 'Faturamento Real', value: `R$ ${fmt(receitaReal)}`, color: 'text-purple-600' },
          { label: 'Meta Leads', value: String(lancamento.meta_leads ?? 0), color: 'text-muted-foreground' },
          { label: 'Meta Matrículas', value: String(lancamento.meta_matriculas ?? 0), color: 'text-muted-foreground' },
          { label: 'Meta Faturamento', value: `R$ ${fmt(lancamento.meta_faturamento ?? 0)}`, color: 'text-muted-foreground' },
        ].map(card => (
          <Card key={card.label} className="p-4 border border-border">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── RelatorioTab ─────────────────────────────────────────────────────────────

function RelatorioTab({ lancamento, leads }: { lancamento: Launch; leads: LaunchLead[] }) {
  const valorMatricula = Number(lancamento.valor_matricula) || VALOR_MATRICULA_PADRAO;

  const totalLeads = leads.length;
  const grupoLancamento = leads.filter(l => l.no_grupo && !l.grupo_oferta && !l.follow_up_01 && !l.follow_up_02 && !l.follow_up_03 && !l.matriculado).length;
  const grupoOferta = leads.filter(l => l.grupo_oferta && !l.follow_up_01 && !l.follow_up_02 && !l.follow_up_03 && !l.matriculado).length;
  const follow1 = leads.filter(l => l.follow_up_01 && !l.follow_up_02 && !l.follow_up_03 && !l.matriculado).length;
  const follow2 = leads.filter(l => l.follow_up_02 && !l.follow_up_03 && !l.matriculado).length;
  const follow3 = leads.filter(l => l.follow_up_03 && !l.matriculado).length;
  const matriculas = leads.filter(l => l.matriculado).length;
  const receitaReal = matriculas * valorMatricula;

  const funil = [
    { label: 'Planilha (Total)', value: totalLeads, color: 'bg-gray-400' },
    { label: 'Grupo Lançamento', value: grupoLancamento, color: 'bg-amber-400' },
    { label: 'Grupo Oferta', value: grupoOferta, color: 'bg-purple-400' },
    { label: 'Follow Up 01', value: follow1, color: 'bg-orange-400' },
    { label: 'Follow Up 02', value: follow2, color: 'bg-red-400' },
    { label: 'Follow Up 03', value: follow3, color: 'bg-red-600' },
    { label: 'Matrículas', value: matriculas, color: 'bg-green-500' },
  ];

  const maxVal = totalLeads || 1;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Funil */}
      <Card className="p-6 border border-border space-y-3">
        <h3 className="font-semibold text-base">Funil do Lançamento</h3>
        {funil.map(f => (
          <div key={f.label} className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{f.label}</span>
              <span>{f.value}</span>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${f.color}`}
                style={{ width: `${(f.value / maxVal) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4 border border-border">
          <p className="text-xs text-muted-foreground">Taxa de Matrícula</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {totalLeads > 0 ? ((matriculas / totalLeads) * 100).toFixed(1) : '0.0'}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">{matriculas} de {totalLeads} leads</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-xs text-muted-foreground">Faturamento</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">R$ {fmt(receitaReal)}</p>
          <p className="text-xs text-muted-foreground mt-1">R$ {fmt(valorMatricula)} / matrícula</p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-xs text-muted-foreground">Grupo Lançamento</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{grupoLancamento}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {totalLeads > 0 ? ((grupoLancamento / totalLeads) * 100).toFixed(1) : '0.0'}% dos leads
          </p>
        </Card>
        <Card className="p-4 border border-border">
          <p className="text-xs text-muted-foreground">Grupo Oferta</p>
          <p className="text-2xl font-bold text-purple-500 mt-1">{grupoOferta}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {grupoLancamento > 0 ? ((grupoOferta / grupoLancamento) * 100).toFixed(1) : '0.0'}% do grupo lancamento
          </p>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ─── Trafego: Types & Constants ──────────────────────────────────────────────

const DATE_PRESETS = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'last_7d', label: 'Últimos 7 dias' },
  { value: 'last_30d', label: 'Últimos 30 dias' },
  { value: 'this_month', label: 'Este mês' },
];

interface MetaInsights {
  spend: string; impressions: string; reach: string; clicks: string;
  cpm: string; cpc: string; ctr: string; leads: number; cpl: number;
}

interface Campanha {
  id: string;
  lancamento_id: string;
  nome: string;
  meta_campaign_id: string;
  meta_ad_account_id: string;
  meta_access_token: string;
  ordem: number;
}

// ─── CampanhaBlock ────────────────────────────────────────────────────────────

function CampanhaBlock({ campanha, leads, usdToBrl, datePreset, onUpdate, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: {
  campanha: Campanha; leads: LaunchLead[]; usdToBrl: number; datePreset: string;
  onUpdate: (id: string, data: Partial<Campanha>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMoveUp: (id: string) => void; onMoveDown: (id: string) => void;
  canMoveUp: boolean; canMoveDown: boolean;
}) {
  const [editingConfig, setEditingConfig] = useState(!campanha.meta_campaign_id);
  const [editingName, setEditingName] = useState(false);
  const [form, setForm] = useState({
    nome: campanha.nome,
    meta_campaign_id: campanha.meta_campaign_id || '',
    meta_ad_account_id: campanha.meta_ad_account_id || '',
    meta_access_token: campanha.meta_access_token || '',
  });
  const [saving, setSaving] = useState(false);
  const [insights, setInsights] = useState<MetaInsights | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usdCurrency, setUsdCurrency] = useState(false);

  const configured = !!campanha.meta_campaign_id && !!campanha.meta_access_token;

  const fetchInsights = async () => {
    if (!campanha.meta_campaign_id || !campanha.meta_access_token) return;
    setLoadingInsights(true); setError(null);
    try {
      const fields = 'spend,impressions,reach,clicks,cpm,cpc,ctr,actions';
      const url = `https://graph.facebook.com/v19.0/${campanha.meta_campaign_id}/insights?fields=${fields}&date_preset=${datePreset}&access_token=${campanha.meta_access_token}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) { setError(json.error.message); return; }
      const d = json.data?.[0];
      if (!d) { setInsights(null); return; }
      const leadAction = d.actions?.find((a: any) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped');
      const leadsCount = leadAction ? parseFloat(leadAction.value) : 0;
      const spend = parseFloat(d.spend || '0');
      setUsdCurrency(true);
      setInsights({ spend: d.spend || '0', impressions: d.impressions || '0', reach: d.reach || '0', clicks: d.clicks || '0', cpm: d.cpm || '0', cpc: d.cpc || '0', ctr: d.ctr || '0', leads: leadsCount, cpl: leadsCount > 0 ? spend / leadsCount : 0 });
    } catch (e: any) { setError(e.message); }
    finally { setLoadingInsights(false); }
  };

  useEffect(() => { if (configured) fetchInsights(); }, [campanha.meta_campaign_id, campanha.meta_access_token, datePreset]);

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(campanha.id, { nome: form.nome, meta_campaign_id: form.meta_campaign_id, meta_ad_account_id: form.meta_ad_account_id, meta_access_token: form.meta_access_token });
    setEditingConfig(false);
    setSaving(false);
  };

  const conv = (v: number) => usdCurrency ? v * usdToBrl : v;
  const fmt = (v: number) => conv(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (v: string) => parseInt(v).toLocaleString('pt-BR');

  return (
    <div className="border border-border rounded-xl bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border">
        <div className="flex flex-col gap-0.5">
          <button onClick={() => onMoveUp(campanha.id)} disabled={!canMoveUp} className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronUp className="h-3 w-3" />
          </button>
          <button onClick={() => onMoveDown(campanha.id)} disabled={!canMoveDown} className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        {editingName ? (
          <input autoFocus className="text-sm font-semibold bg-white border border-border rounded px-2 py-0.5 flex-1 max-w-[200px]"
            value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
            onBlur={async () => { setEditingName(false); await onUpdate(campanha.id, { nome: form.nome }); }}
            onKeyDown={e => { if (e.key === 'Enter') { setEditingName(false); onUpdate(campanha.id, { nome: form.nome }); } }} />
        ) : (
          <button onClick={() => setEditingName(true)} className="text-sm font-semibold flex items-center gap-1 hover:text-primary">
            {campanha.nome} <Pencil className="h-3 w-3 opacity-40" />
          </button>
        )}

        <div className="flex-1" />
        <button onClick={() => setEditingConfig(e => !e)} className="text-xs text-primary hover:underline flex items-center gap-1">
          <Pencil className="h-3 w-3" /> {editingConfig ? 'Cancelar' : 'Configurar'}
        </button>
        <button onClick={() => onDelete(campanha.id)} className="text-xs text-destructive hover:underline flex items-center gap-1 ml-2">
          <Trash2 className="h-3 w-3" /> Remover
        </button>
      </div>

      <div className="p-4 space-y-4">
        {editingConfig && (
          <div className="bg-muted/20 border border-border rounded-lg p-4 space-y-3">
            <p className="text-xs text-muted-foreground">Vincule a campanha do Meta Ads:</p>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-xs font-medium">ID da Campanha</label>
                <Input placeholder="ex: 120202XXXXXXXXX" value={form.meta_campaign_id} onChange={e => setForm(f => ({ ...f, meta_campaign_id: e.target.value }))} className="mt-1 text-sm" />
                <p className="text-[10px] text-muted-foreground mt-1">Gerenciador de Anúncios → campanha → número na URL</p>
              </div>
              <div>
                <label className="text-xs font-medium">ID da Conta de Anúncios</label>
                <Input placeholder="ex: act_XXXXXXXXXX" value={form.meta_ad_account_id} onChange={e => setForm(f => ({ ...f, meta_ad_account_id: e.target.value }))} className="mt-1 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium">Token de Acesso</label>
                <Input type="password" placeholder="Token do Usuário do Sistema Meta" value={form.meta_access_token} onChange={e => setForm(f => ({ ...f, meta_access_token: e.target.value }))} className="mt-1 text-sm" />
                <p className="text-[10px] text-muted-foreground mt-1">Business Manager → Configurações → Usuários do Sistema → Gerar token (permissão: ads_read)</p>
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving} size="sm" className="bg-primary hover:bg-primary/90 text-white">
              {saving ? 'Salvando...' : 'Salvar configuração'}
            </Button>
          </div>
        )}

        {!configured && !editingConfig && (
          <div className="text-center py-8 text-muted-foreground">
            <BarChart2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma campanha vinculada.</p>
            <button onClick={() => setEditingConfig(true)} className="text-primary text-sm hover:underline mt-1">Configurar agora</button>
          </div>
        )}

        {configured && !editingConfig && (
          <div className="space-y-3">
            {usdCurrency && usdToBrl > 1 && <p className="text-[10px] text-muted-foreground">Valores convertidos de USD → BRL (cotação: R$ {usdToBrl.toFixed(2)})</p>}
            {loadingInsights && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando métricas...</div>}
            {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">Erro: {error}</div>}
            {insights && !loadingInsights && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-muted/20 border border-border rounded-lg p-3"><p className="text-xs text-muted-foreground">Gasto Total</p><p className="text-xl font-bold mt-1">R$ {fmt(parseFloat(insights.spend))}</p></div>
                <div className="bg-muted/20 border border-border rounded-lg p-3"><p className="text-xs text-muted-foreground">Leads Gerados</p><p className="text-xl font-bold text-primary mt-1">{insights.leads.toLocaleString('pt-BR')}</p><p className="text-[10px] text-muted-foreground">{leads.length} no CRM</p></div>
                <div className="bg-muted/20 border border-border rounded-lg p-3"><p className="text-xs text-muted-foreground">CPL</p><p className="text-xl font-bold mt-1">R$ {fmt(insights.cpl)}</p></div>
                <div className="bg-muted/20 border border-border rounded-lg p-3"><p className="text-xs text-muted-foreground">Alcance</p><p className="text-xl font-bold mt-1">{fmtInt(insights.reach)}</p><p className="text-[10px] text-muted-foreground">{fmtInt(insights.impressions)} impressões</p></div>
                <div className="bg-muted/20 border border-border rounded-lg p-3"><p className="text-xs text-muted-foreground">CTR</p><p className="text-xl font-bold mt-1">{parseFloat(insights.ctr).toFixed(2)}%</p></div>
                <div className="bg-muted/20 border border-border rounded-lg p-3"><p className="text-xs text-muted-foreground">CPC</p><p className="text-xl font-bold mt-1">R$ {fmt(parseFloat(insights.cpc))}</p></div>
                <div className="bg-muted/20 border border-border rounded-lg p-3"><p className="text-xs text-muted-foreground">CPM</p><p className="text-xl font-bold mt-1">R$ {fmt(parseFloat(insights.cpm))}</p></div>
                <div className="bg-muted/20 border border-border rounded-lg p-3"><p className="text-xs text-muted-foreground">Cliques</p><p className="text-xl font-bold mt-1">{fmtInt(insights.clicks)}</p></div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <p className="text-[10px] text-muted-foreground">ID: <span className="font-mono">{campanha.meta_campaign_id}</span></p>
              <button onClick={fetchInsights} className="text-xs text-primary hover:underline flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Atualizar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TrafegoTab ───────────────────────────────────────────────────────────────

function TrafegoTab({ lancamento, leads: crmLeads }: {
  lancamento: Launch;
  leads: LaunchLead[];
}) {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [datePreset, setDatePreset] = useState('this_month');
  const [usdToBrl, setUsdToBrl] = useState<number>(1);
  const [loadingCampanhas, setLoadingCampanhas] = useState(true);
  const [addingCampanha, setAddingCampanha] = useState(false);

  useEffect(() => {
    fetch('https://economia.awesomeapi.com.br/last/USD-BRL')
      .then(r => r.json())
      .then(d => { const rate = parseFloat(d.USDBRL?.bid); if (rate) setUsdToBrl(rate); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoadingCampanhas(true);
      const { data } = await supabase.from('lancamento_campanhas').select('*').eq('lancamento_id', lancamento.id).order('ordem', { ascending: true });
      setCampanhas((data || []) as Campanha[]);
      setLoadingCampanhas(false);
    };
    load();
  }, [lancamento.id]);

  const handleAddCampanha = async () => {
    setAddingCampanha(true);
    const nextOrdem = campanhas.length > 0 ? Math.max(...campanhas.map(c => c.ordem)) + 1 : 0;
    const { data, error } = await supabase.from('lancamento_campanhas').insert({ lancamento_id: lancamento.id, nome: `Campanha ${campanhas.length + 1}`, ordem: nextOrdem }).select().single();
    if (!error && data) { setCampanhas(prev => [...prev, data as Campanha]); toast.success('Campanha criada!'); }
    setAddingCampanha(false);
  };

  const handleUpdate = async (id: string, data: Partial<Campanha>) => {
    const { error } = await supabase.from('lancamento_campanhas').update(data as any).eq('id', id);
    if (error) { toast.error('Erro ao salvar'); return; }
    setCampanhas(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
    toast.success('Salvo!');
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('lancamento_campanhas').delete().eq('id', id);
    if (error) { toast.error('Erro ao remover'); return; }
    setCampanhas(prev => prev.filter(c => c.id !== id));
    toast.success('Campanha removida!');
  };

  const handleMove = (id: string, dir: 'up' | 'down') => {
    const idx = campanhas.findIndex(c => c.id === id);
    if ((dir === 'up' && idx === 0) || (dir === 'down' && idx === campanhas.length - 1)) return;
    const newList = [...campanhas];
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    [newList[idx], newList[swapIdx]] = [newList[swapIdx], newList[idx]];
    const updated = newList.map((c, i) => ({ ...c, ordem: i }));
    setCampanhas(updated);
    Promise.all(updated.map(c => supabase.from('lancamento_campanhas').update({ ordem: c.ordem }).eq('id', c.id)));
  };

  const hasConfigured = campanhas.some(c => c.meta_campaign_id && c.meta_access_token);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-primary" /> Gestão de Tráfego — Meta Ads
        </h3>
        <Button onClick={handleAddCampanha} disabled={addingCampanha} size="sm" className="bg-primary hover:bg-primary/90 text-white gap-1">
          <Plus className="h-3 w-3" /> {addingCampanha ? 'Criando...' : 'Nova Campanha'}
        </Button>
      </div>

      {hasConfigured && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Período:</span>
          <div className="flex gap-1 flex-wrap">
            {DATE_PRESETS.map(p => (
              <button key={p.value} onClick={() => setDatePreset(p.value)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${datePreset === p.value ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loadingCampanhas && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando campanhas...</div>}

      {!loadingCampanhas && campanhas.length === 0 && (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
          <BarChart2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma campanha criada ainda.</p>
          <button onClick={handleAddCampanha} className="text-primary text-sm hover:underline mt-2 flex items-center gap-1 mx-auto">
            <Plus className="h-3 w-3" /> Criar primeira campanha
          </button>
        </div>
      )}

      <div className="space-y-4">
        {campanhas.map((campanha, idx) => (
          <CampanhaBlock key={campanha.id} campanha={campanha} leads={crmLeads} usdToBrl={usdToBrl} datePreset={datePreset}
            onUpdate={handleUpdate} onDelete={handleDelete}
            onMoveUp={(id) => handleMove(id, 'up')} onMoveDown={(id) => handleMove(id, 'down')}
            canMoveUp={idx > 0} canMoveDown={idx < campanhas.length - 1} />
        ))}
      </div>
    </div>
  );
}

// ─── Disparo por Coluna — Types ──────────────────────────────────────────────

interface DisparoLeadStatus {
  leadId: string;
  nome: string;
  whatsapp: string;
  status: 'pending' | 'sending' | 'done' | 'error' | 'skipped';
  error?: string;
}

interface KanbanDisparo {
  id: string;
  nome: string;
  colunaIds: string[];
  colunaNomes: string[];
  template: string;
  typingDelayMs: number;
  minDelayMs: number;
  maxDelayMs: number;
  instanceName: string | null;
  leads: DisparoLeadStatus[];
  currentIdx: number;
  status: 'running' | 'paused' | 'done' | 'stopped';
  startedAt: number;
  countdownMs: number;
}

// ─── KanbanDisparoModal ───────────────────────────────────────────────────────

function KanbanDisparoModal({
  open,
  onClose,
  colunas,
  leads,
  evoInstances,
  onStart,
  initialColunaIds,
}: {
  open: boolean;
  onClose: () => void;
  colunas: KanbanColuna[];
  leads: LaunchLead[];
  evoInstances: Array<{ instance_name: string }>;
  onStart: (config: {
    colunaIds: string[];
    template: string;
    typingDelayMs: number;
    minDelayMs: number;
    maxDelayMs: number;
    instanceName: string | null;
  }) => void;
  initialColunaIds?: string[];
}) {
  const [selectedColIds, setSelectedColIds] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState(
    'Olá {{nome}}! 🎉\n\nSeu acesso está confirmado.\n\n📲 Grupo de Lançamento:\n{{link_grupo}}\n\nNos vemos lá!',
  );
  const [typingDelaySecs, setTypingDelaySecs] = useState(3);
  const [minDelaySecs, setMinDelaySecs] = useState(10);
  const [maxDelaySecs, setMaxDelaySecs] = useState(25);
  const [instanceName, setInstanceName] = useState('__priority__');
  const [activeTab, setActiveTab] = useState<'colunas' | 'mensagem' | 'antibano'>('colunas');

  useEffect(() => {
    if (!open) return;
    if (initialColunaIds && initialColunaIds.length > 0) {
      setSelectedColIds(new Set(initialColunaIds));
      setActiveTab('mensagem');
    } else {
      setSelectedColIds(new Set());
      setActiveTab('colunas');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCol = (id: string) =>
    setSelectedColIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const selectedLeads = leads.filter(l => selectedColIds.has(l.fase) && l.whatsapp);
  const allSelected   = leads.filter(l => selectedColIds.has(l.fase));

  const previewMessage = template
    .replace(/\{\{nome\}\}/g, 'João Silva')
    .replace(/\{\{whatsapp\}\}/g, '5511999999999')
    .replace(/\{\{link_grupo\}\}/g, 'https://chat.whatsapp.com/Exemplo123')
    .replace(/\{\{link_aula_1\}\}/g, 'https://exemplo.com/aula1')
    .replace(/\{\{link_aula_2\}\}/g, 'https://exemplo.com/aula2')
    .replace(/\{\{link_aula_3\}\}/g, 'https://exemplo.com/aula3');

  const avgSecs = (minDelaySecs + maxDelaySecs) / 2 + typingDelaySecs;

  const handleStart = () => {
    if (selectedColIds.size === 0) { toast.error('Selecione ao menos uma coluna'); return; }
    if (!template.trim()) { toast.error('Digite a mensagem'); return; }
    if (minDelaySecs > maxDelaySecs) { toast.error('Delay mínimo não pode ser maior que o máximo'); return; }
    onStart({
      colunaIds: [...selectedColIds],
      template,
      typingDelayMs: typingDelaySecs * 1000,
      minDelayMs: minDelaySecs * 1000,
      maxDelayMs: maxDelaySecs * 1000,
      instanceName: instanceName === '__priority__' ? null : instanceName,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-blue-600" /> Nova Campanha — Disparo por Coluna
          </DialogTitle>
          <DialogDescription>
            Selecione as colunas do kanban, configure o template e inicie o disparo com anti-ban.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border flex-shrink-0">
          {(['colunas', 'mensagem', 'antibano'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'colunas' ? '📋 Colunas' : tab === 'mensagem' ? '💬 Mensagem' : '🛡️ Anti-Ban'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 py-4">

          {/* Tab: Colunas */}
          {activeTab === 'colunas' && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-3">
                Selecione as colunas cujos leads receberão a mensagem.
                Apenas leads <strong>com WhatsApp</strong> serão disparados.
              </p>
              {colunas.map(col => {
                const total   = leads.filter(l => l.fase === col.id).length;
                const withWpp = leads.filter(l => l.fase === col.id && l.whatsapp).length;
                const checked = selectedColIds.has(col.id);
                return (
                  <label
                    key={col.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      checked ? 'border-blue-400 bg-blue-50' : 'border-border hover:border-blue-200 hover:bg-blue-50/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCol(col.id)}
                      className="w-4 h-4 rounded accent-blue-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{col.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {withWpp} com WhatsApp de {total} lead(s)
                      </p>
                    </div>
                    {withWpp === 0 && (
                      <span className="text-xs text-amber-500 shrink-0">sem WPP</span>
                    )}
                  </label>
                );
              })}
              {selectedColIds.size > 0 && (
                <div className="mt-3 p-3 rounded-lg bg-green-50 border border-green-200">
                  <p className="text-sm font-medium text-green-800">
                    ✅ {selectedLeads.length} lead(s) com WhatsApp serão disparados
                    {allSelected.length > selectedLeads.length && (
                      <span className="text-green-600 font-normal"> ({allSelected.length - selectedLeads.length} sem WPP serão ignorados)</span>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Tab: Mensagem */}
          {activeTab === 'mensagem' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-2">Template da mensagem</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {['{{nome}}', '{{link_grupo}}', '{{link_aula_1}}', '{{link_aula_2}}', '{{link_aula_3}}', '{{whatsapp}}'].map(v => (
                    <button
                      key={v}
                      onClick={() => setTemplate(t => t + v)}
                      className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 font-mono transition-colors"
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <textarea
                  className="w-full h-40 text-sm font-mono border border-border rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  value={template}
                  onChange={e => setTemplate(e.target.value)}
                  placeholder="Digite a mensagem..."
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-2">Prévia (WhatsApp)</label>
                <div className="bg-[#e5ddd5] rounded-lg p-4 max-h-52 overflow-y-auto">
                  <div className="bg-white rounded-lg px-3 py-2 shadow-sm max-w-xs ml-auto">
                    <p className="text-sm whitespace-pre-wrap text-gray-800">{previewMessage}</p>
                    <p className="text-[10px] text-gray-400 text-right mt-1">12:00 ✓✓</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Anti-Ban */}
          {activeTab === 'antibano' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                🛡️ Anti-ban simula comportamento humano: indicador de digitação antes de enviar e delays aleatórios entre mensagens.
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Delay mínimo (segundos)</label>
                  <input
                    type="number" min={3} max={300} value={minDelaySecs}
                    onChange={e => setMinDelaySecs(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-md border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Delay máximo (segundos)</label>
                  <input
                    type="number" min={3} max={300} value={maxDelaySecs}
                    onChange={e => setMaxDelaySecs(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-md border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Digitação (segundos de "digitando…" antes de enviar)</label>
                <input
                  type="number" min={0} max={15} value={typingDelaySecs}
                  onChange={e => setTypingDelaySecs(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-md border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground">0 para desativar o indicador de digitação</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Instância Evolution</label>
                <select
                  value={instanceName}
                  onChange={e => setInstanceName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                >
                  <option value="__priority__">Automático (por prioridade)</option>
                  {evoInstances.map(inst => (
                    <option key={inst.instance_name} value={inst.instance_name}>{inst.instance_name}</option>
                  ))}
                </select>
              </div>
              <div className="p-3 rounded-lg border border-border bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  <strong>Estimativa:</strong> {selectedLeads.length} lead(s) × {Math.round(avgSecs)}s médio ≈{' '}
                  <strong>{Math.round((selectedLeads.length * avgSecs) / 60)} minutos</strong>
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-3 border-t flex-shrink-0">
          <p className="text-sm text-muted-foreground">
            {selectedLeads.length > 0 ? `${selectedLeads.length} lead(s) selecionados` : 'Nenhuma coluna selecionada'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button
              onClick={handleStart}
              disabled={selectedColIds.size === 0 || selectedLeads.length === 0}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Send className="h-4 w-4" /> Iniciar Campanha
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── CampanhasDisparoPanel ────────────────────────────────────────────────────

function CampanhasDisparoPanel({
  disparos,
  onPause,
  onResume,
  onStop,
  onDismiss,
}: {
  disparos: KanbanDisparo[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onStop: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (disparos.length === 0) return null;

  const active = disparos.filter(d => d.status === 'running' || d.status === 'paused').length;

  return (
    <div className="fixed bottom-4 right-4 w-96 z-50 shadow-2xl rounded-xl border border-border bg-white overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4" />
          <span className="text-sm font-semibold">
            Campanhas{active > 0 ? ` (${active} ativa${active > 1 ? 's' : ''})` : ' (concluídas)'}
          </span>
        </div>
        {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {!collapsed && (
        <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
          {disparos.map(disp => {
            const done  = disp.leads.filter(l => l.status === 'done' || l.status === 'error' || l.status === 'skipped').length;
            const total = disp.leads.length;
            const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
            const errors = disp.leads.filter(l => l.status === 'error').length;
            const sending = disp.leads[disp.currentIdx];

            return (
              <div key={disp.id} className="p-3 space-y-2">
                {/* Row 1: Nome + botões */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{disp.nome}</p>
                    <p className="text-xs text-muted-foreground truncate">{disp.colunaNomes.join(' · ')}</p>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {disp.status === 'running' && (
                      <button onClick={() => onPause(disp.id)} title="Pausar"
                        className="p-1.5 rounded hover:bg-amber-50 text-amber-600 transition-colors">
                        <Pause className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {disp.status === 'paused' && (
                      <button onClick={() => onResume(disp.id)} title="Retomar"
                        className="p-1.5 rounded hover:bg-green-50 text-green-600 transition-colors">
                        <Play className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {(disp.status === 'running' || disp.status === 'paused') && (
                      <button onClick={() => onStop(disp.id)} title="Parar"
                        className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors">
                        <Square className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {(disp.status === 'done' || disp.status === 'stopped') && (
                      <button onClick={() => onDismiss(disp.id)} title="Fechar"
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors">
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Row 2: Progresso */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{done}/{total} enviados</span>
                    <span>
                      {disp.status === 'running' && disp.countdownMs > 0
                        ? `⏱ ${Math.ceil(disp.countdownMs / 1000)}s`
                        : disp.status === 'paused' ? '⏸ Pausado'
                        : disp.status === 'done'    ? '✅ Concluído'
                        : disp.status === 'stopped' ? '🛑 Parado'
                        : ''}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        disp.status === 'done'    ? 'bg-green-500' :
                        disp.status === 'stopped' ? 'bg-red-400'   : 'bg-blue-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Row 3: Lead atual / erros */}
                {disp.status === 'running' && sending && sending.status === 'sending' && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    Enviando para {sending.nome}…
                  </p>
                )}
                {errors > 0 && (
                  <p className="text-xs text-red-500">{errors} erro{errors > 1 ? 's' : ''} de envio</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── CSV Import Helpers ────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const first = lines[0];
  const tabs = (first.match(/\t/g) || []).length;
  const semis = (first.match(/;/g) || []).length;
  const commas = (first.match(/,/g) || []).length;
  const sep = tabs >= semis && tabs >= commas ? '\t' : semis >= commas ? ';' : ',';
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === sep && !inQ) { result.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    result.push(cur.trim());
    return result;
  };
  const headers = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, '').toLowerCase().trim());
  const rows = lines.slice(1).map(parseLine).filter(r => r.some(c => c.trim()));
  return { headers, rows };
}

function autoDetectMapping(headers: string[]): { nome: string; whatsapp: string; email: string } {
  const find = (...patterns: RegExp[]) => {
    const idx = headers.findIndex(h => patterns.some(p => p.test(h)));
    return idx >= 0 ? String(idx) : '';
  };
  return {
    nome: find(/^nome$/i, /^name$/i, /nome.+completo/i, /^nome/i, /^lead/i),
    whatsapp: find(/whatsapp/i, /celular/i, /telefone/i, /^phone/i, /^tel$/i, /^fone$/i, /^contato/i),
    email: find(/^e?-?mail$/i, /^email/i),
  };
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function LancamentoKanban({ lancamentoId }: LancamentoKanbanProps) {
  const { user, users } = useAuth();
  const navigate = useNavigate();
  const [lancamento, setLancamento] = useState<Launch | null>(null);
  const [leads, setLeads] = useState<LaunchLead[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<ActiveView>('kanban');
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [showAddLeadDialog, setShowAddLeadDialog] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({ nome: '', whatsapp: '', email: '' });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<LaunchLead | null>(null);
  const [editingLead, setEditingLead] = useState<LaunchLead | null>(null);
  const [editLeadForm, setEditLeadForm] = useState({ nome: '', whatsapp: '', email: '', observacoes: '', matriculado: false });
  const [editingValor, setEditingValor] = useState(false);
  const [valorInput, setValorInput] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importParsed, setImportParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [importMapping, setImportMapping] = useState({ nome: '', whatsapp: '', email: '' });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; dupes: number } | null>(null);

  const [showSyncGrupoModal, setShowSyncGrupoModal] = useState(false);
  const [syncGrupoInput, setSyncGrupoInput] = useState('');
  const [syncingGrupo, setSyncingGrupo] = useState(false);
  const [syncGrupoResult, setSyncGrupoResult] = useState<{ updated: number; notFound: number; lidCount?: number } | null>(null);
  const [syncingFromEvo, setSyncingFromEvo] = useState(false);
  const [syncDebug, setSyncDebug] = useState<Record<string, unknown> | null>(null);

  // Webhook groups config
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [webhookForm, setWebhookForm] = useState({ grupoLancamentoJid: '', grupoOfertaJid: '' });
  const [savingWebhook, setSavingWebhook] = useState(false);
  const WEBHOOK_URL = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/webhook-grupo';

  // Column management
  const [renamingColuna, setRenamingColuna] = useState<KanbanColuna | null>(null);
  const [deletingColuna, setDeletingColuna] = useState<KanbanColuna | null>(null);
  const [settingsColuna, setSettingsColuna] = useState<KanbanColuna | null>(null);

  // Turmas + confirm matricula modal
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [confirmMatriculaLead, setConfirmMatriculaLead] = useState<LaunchLead | null>(null);
  const [confirmMatriculaForm, setConfirmMatriculaForm] = useState({
    turma_id: '', produto: 'psicanalise', valor_mensalidade: '', dia_vencimento: '10', total_mensalidades: '15',
  });
  const [savingMatricula, setSavingMatricula] = useState(false);

  // ── Disparo por Coluna (campanhas WPP) ────────────────────────────────────
  const [disparos, setDisparos] = useState<KanbanDisparo[]>([]);
  const [showDisparoModal, setShowDisparoModal] = useState(false);
  const [preselectColunaId, setPreselectColunaId] = useState<string | null>(null);
  const [evoInstances, setEvoInstances] = useState<Array<{ instance_name: string }>>([]);
  const disparosStopMap  = useRef<Map<string, boolean>>(new Map());
  const disparosPauseMap = useRef<Map<string, boolean>>(new Map());

  // Shared column hook
  const {
    colunas, colunasRef, loadingColunas,
    addColuna, renameColuna, deleteColuna, moveColuna, updateRegraColuna,
  } = useKanbanColunas('lancamento', lancamentoId);

  // Pending guard: blocks Realtime from overwriting optimistic fase updates
  const pendingUpdates = useRef<Map<string, string>>(new Map());
  const leadsRef = useRef<LaunchLead[]>([]);
  useEffect(() => { leadsRef.current = leads; }, [leads]);

  const vinicius = users.find(u => u.nome?.toLowerCase().includes('vinicius'));

  // ── Fetch all leads with pagination (Supabase max-rows is 1000) ────────────
  const fetchAllLeads = async (lancId: string) => {
    const PAGE = 1000;
    let all: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('lancamento_leads')
        .select('*')
        .eq('lancamento_id', lancId)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  const normalizeLeadsToCurrentColunas = useCallback(
    async (loadedLeads: LaunchLead[]) => {
      if (colunasRef.current.length === 0) return loadedLeads;
      return migrateLegacyLeads(loadedLeads, colunasRef.current);
    },
    [],
  );

  // ── Load turmas (for matricula modal) ─────────────────────────────────────
  useEffect(() => {
    supabase.from('turmas').select('id, nome, produto, valor_mensalidade, total_mensalidades')
      .then(({ data }) => setTurmas((data as Turma[]) || []));
  }, []);

  // ── Load Evolution instances (for disparo modal) ───────────────────────────
  useEffect(() => {
    supabase
      .from('evolution_config')
      .select('instance_name')
      .eq('ativo', true)
      .order('prioridade', { ascending: true })
      .then(({ data }) => setEvoInstances(data || []));
  }, []);

  // ── Disparo helpers ────────────────────────────────────────────────────────
  const countdownDelay = async (disparoId: string, ms: number) => {
    const step = 200;
    let elapsed = 0;
    while (elapsed < ms) {
      if (disparosStopMap.current.get(disparoId)) return;
      if (disparosPauseMap.current.get(disparoId)) {
        // Frozen while paused
        await new Promise(r => setTimeout(r, step));
        continue;
      }
      setDisparos(prev => prev.map(d => d.id === disparoId ? { ...d, countdownMs: ms - elapsed } : d));
      await new Promise(r => setTimeout(r, step));
      elapsed += step;
    }
    setDisparos(prev => prev.map(d => d.id === disparoId ? { ...d, countdownMs: 0 } : d));
  };

  const runDisparo = async (id: string, disp: KanbanDisparo) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    for (let i = 0; i < disp.leads.length; i++) {
      if (disparosStopMap.current.get(id)) break;

      // Wait while paused
      while (disparosPauseMap.current.get(id)) {
        if (disparosStopMap.current.get(id)) break;
        await new Promise(r => setTimeout(r, 300));
      }
      if (disparosStopMap.current.get(id)) break;

      const lead = disp.leads[i];

      // Mark as sending
      setDisparos(prev => prev.map(d => d.id === id ? {
        ...d, currentIdx: i,
        leads: d.leads.map((l, idx) => idx === i ? { ...l, status: 'sending' } : l),
      } : d));

      const mensagem = disp.template
        .replace(/\{\{nome\}\}/g, lead.nome)
        .replace(/\{\{whatsapp\}\}/g, lead.whatsapp);

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/wpp-enviar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            numero: lead.whatsapp,
            mensagem,
            instance_name: disp.instanceName ?? undefined,
            typing_delay_ms: disp.typingDelayMs,
          }),
        });
        const result = await res.json();
        setDisparos(prev => prev.map(d => d.id === id ? {
          ...d, currentIdx: i + 1,
          leads: d.leads.map((l, idx) => idx === i ? {
            ...l,
            status: result.ok ? 'done' : 'error',
            error: result.ok ? undefined : (result.error ?? 'Erro desconhecido'),
          } : l),
        } : d));
      } catch (e: unknown) {
        setDisparos(prev => prev.map(d => d.id === id ? {
          ...d, currentIdx: i + 1,
          leads: d.leads.map((l, idx) => idx === i ? {
            ...l, status: 'error', error: (e as Error).message,
          } : l),
        } : d));
      }

      // Random delay before next send (skip after last)
      if (i < disp.leads.length - 1 && !disparosStopMap.current.get(id)) {
        const delay = Math.round(
          disp.minDelayMs + Math.random() * (disp.maxDelayMs - disp.minDelayMs),
        );
        await countdownDelay(id, delay);
      }
    }

    // Mark final status
    setDisparos(prev => prev.map(d => d.id === id ? {
      ...d,
      status: disparosStopMap.current.get(id) ? 'stopped' : 'done',
      countdownMs: 0,
    } : d));
  };

  const handleStartDisparo = (config: {
    colunaIds: string[];
    template: string;
    typingDelayMs: number;
    minDelayMs: number;
    maxDelayMs: number;
    instanceName: string | null;
  }) => {
    const campaignLeads = leads
      .filter(l => config.colunaIds.includes(l.fase) && l.whatsapp)
      .map(l => ({
        leadId: l.id,
        nome: l.nome,
        whatsapp: l.whatsapp,
        status: 'pending' as const,
      }));

    const colunaNomes = colunas
      .filter(c => config.colunaIds.includes(c.id))
      .map(c => c.nome);

    const newId = crypto.randomUUID();
    const nomeCampanha = `${colunaNomes.join(', ')} · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    const newDisp: KanbanDisparo = {
      id: newId,
      nome: nomeCampanha,
      colunaIds: config.colunaIds,
      colunaNomes,
      template: config.template,
      typingDelayMs: config.typingDelayMs,
      minDelayMs: config.minDelayMs,
      maxDelayMs: config.maxDelayMs,
      instanceName: config.instanceName,
      leads: campaignLeads,
      currentIdx: 0,
      status: 'running',
      startedAt: Date.now(),
      countdownMs: 0,
    };

    disparosStopMap.current.set(newId, false);
    disparosPauseMap.current.set(newId, false);
    setDisparos(prev => [...prev, newDisp]);
    runDisparo(newId, newDisp);
    toast.success(`🚀 Campanha iniciada: ${campaignLeads.length} lead(s)`);
  };

  // ── Fetch lancamento + leads ────────────────────────────────────────────────
  useEffect(() => {
    if (!lancamentoId) return;
    // Clear stale leads from previous lancamento immediately to prevent
    // the colunas-watch effect from running migrateLegacyLeads on wrong data
    setLeads([]);
    setLoading(true);

    const load = async () => {
      const { data: lancData } = await supabase
        .from('lancamentos')
        .select('*')
        .eq('id', lancamentoId)
        .single();
      if (lancData) {
        const lsKey = `trafego_config_${lancamentoId}`;
        const lsConfig = localStorage.getItem(lsKey);
        // Only use localStorage if Supabase doesn't have the config yet (migration not applied)
        let merged = { ...lancData };
        if (lsConfig && !lancData.meta_campaign_id) {
          Object.assign(merged, JSON.parse(lsConfig));
        } else if (lancData.meta_campaign_id) {
          localStorage.removeItem(lsKey);
        }
        setLancamento(merged as Launch);
        setWebhookForm({
          grupoLancamentoJid: (merged as Launch).grupo_lancamento_jid ?? '',
          grupoOfertaJid:     (merged as Launch).grupo_oferta_jid      ?? '',
        });
      }

      let loadedLeads = (await fetchAllLeads(lancamentoId)) as LaunchLead[];
      loadedLeads = await normalizeLeadsToCurrentColunas(loadedLeads);

      setLeads(loadedLeads);
      setLoading(false);
    };
    load();
  }, [lancamentoId, normalizeLeadsToCurrentColunas]);

  // ── Auto-migration: fix leads with legacy string fase ──────────────────────
  const migrateLegacyLeads = async (
    loadedLeads: LaunchLead[],
    cols: KanbanColuna[],
  ): Promise<LaunchLead[]> => {
    const validIds = new Set(cols.map(c => c.id));
    const legacy = loadedLeads.filter(l => !validIds.has(l.fase));
    if (legacy.length === 0) return loadedLeads;

    const migrated = loadedLeads.map(lead => {
      if (validIds.has(lead.fase)) return lead;
      const newFase = resolveLegacyFase(lead.fase, cols);
      return { ...lead, fase: newFase };
    });

    // Batch update DB — fire and forget errors so UI is not blocked
    // Double-check lancamento_id in WHERE clause to prevent cross-lancamento data corruption
    await Promise.all(
      legacy.map(lead => {
        const newFase = (migrated.find(m => m.id === lead.id) as LaunchLead).fase;
        return supabase
          .from('lancamento_leads')
          .update({ fase: newFase })
          .eq('id', lead.id)
          .eq('lancamento_id', lancamentoId)
          .then(({ error }) => {
            if (error) console.warn('Migration failed for lead', lead.id, error.message);
          });
      })
    );

    return migrated;
  };

  // ── Realtime ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!lancamentoId) return;

    const load = async () => {
      // reload leads only (columns are static within a session)
      const data = await fetchAllLeads(lancamentoId);
      const normalized = await normalizeLeadsToCurrentColunas(data as LaunchLead[]);
      setLeads(normalized);
    };

    const channel = supabase
      .channel(`launch-leads-${lancamentoId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lancamento_leads', filter: `lancamento_id=eq.${lancamentoId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newLead = payload.new as LaunchLead;
            setLeads(prev => prev.some(l => l.id === newLead.id) ? prev : [newLead, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as LaunchLead;
            setLeads(prev =>
              prev.map(l => {
                if (l.id !== updated.id) return l;
                const expected = pendingUpdates.current.get(updated.id);
                if (expected !== undefined) return { ...updated, fase: expected };
                return updated;
              })
            );
          } else if (payload.eventType === 'DELETE') {
            setLeads(prev => prev.filter(l => l.id !== (payload.old as LaunchLead).id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [lancamentoId, normalizeLeadsToCurrentColunas]);

  useEffect(() => {
    if (colunas.length === 0 || leadsRef.current.length === 0) return;

    // Guard: skip if any lead belongs to a different lancamento (stale state during navigation)
    if (leadsRef.current.some(lead => lead.lancamento_id !== lancamentoId)) return;

    const validIds = new Set(colunas.map(coluna => coluna.id));
    const hasLegacyPhase = leadsRef.current.some(lead => !validIds.has(lead.fase));
    if (!hasLegacyPhase) return;

    let cancelled = false;

    const syncLeads = async () => {
      const normalized = await migrateLegacyLeads(leadsRef.current, colunas);
      if (!cancelled) setLeads(normalized);
    };

    syncLeads();

    return () => {
      cancelled = true;
    };
  }, [colunas]);

  // ── Matricula modal helpers ────────────────────────────────────────────────

  const openConfirmMatricula = (lead: LaunchLead) => {
    setConfirmMatriculaLead(lead);
    // Se o wizard configurou turma destino, usa ela; senão cai para primeira turma
    const hasDestino = !!lancamento?.turma_destino_id;
    setConfirmMatriculaForm({
      turma_id: hasDestino ? lancamento!.turma_destino_id! : (turmas[0]?.id ?? ''),
      produto: hasDestino ? (lancamento!.produto_destino ?? 'psicanalise') : (turmas[0]?.produto ?? 'psicanalise'),
      valor_mensalidade: hasDestino
        ? String(lancamento!.valor_mensalidade_destino ?? '109.90')
        : String(turmas[0]?.valor_mensalidade ?? '109.90'),
      dia_vencimento: hasDestino
        ? String(lancamento!.dia_vencimento_destino ?? 10)
        : '10',
      total_mensalidades: hasDestino
        ? String(lancamento!.total_mensalidades_destino ?? 15)
        : String(turmas[0]?.total_mensalidades ?? '15'),
    });
  };

  const handleConfirmMatricula = async () => {
    if (!confirmMatriculaLead) return;
    setSavingMatricula(true);
    const { data: alunoData, error } = await supabase.from('alunos').insert({
      nome: confirmMatriculaLead.nome,
      whatsapp: confirmMatriculaLead.whatsapp || null,
      email: confirmMatriculaLead.email || null,
      turma_id: confirmMatriculaForm.turma_id || null,
      produto: confirmMatriculaForm.produto,
      valor_mensalidade: Number(confirmMatriculaForm.valor_mensalidade) || null,
      dia_vencimento: Number(confirmMatriculaForm.dia_vencimento) || null,
      total_mensalidades: Number(confirmMatriculaForm.total_mensalidades) || 15,
      status: 'pendente',  // ← fica pendente até preencher o formulário
      data_matricula: new Date().toISOString().slice(0, 10),
    }).select('id, contrato_token').single();
    setSavingMatricula(false);
    if (error) { toast.error('Erro ao criar aluno: ' + error.message); return; }
    toast.success('Aluno pré-cadastrado! Link do formulário enviado via WPP.');
    setConfirmMatriculaLead(null);

    // ── Envio do link do formulário via WPP ───────────────────────────────────
    // O aluno preenche o formulário → sistema ativa no Financeiro + gera contrato
    if (alunoData?.contrato_token && confirmMatriculaLead.whatsapp) {
      const formularioUrl = `${window.location.origin}/formulario/${alunoData.contrato_token}`;
      supabase.functions.invoke('wpp-enviar', {
        body: {
          numero:   confirmMatriculaLead.whatsapp,
          mensagem: `Olá, ${confirmMatriculaLead.nome.split(' ')[0]}! 🎉\n\nSua matrícula foi pré-aprovada! Preencha seus dados para finalizar e receber o contrato:\n\n${formularioUrl}\n\nÉ rapidinho, menos de 1 minuto! 😊`,
        },
      }).catch(() => {/* silencioso */});
    }
  };

  // ── Move lead ───────────────────────────────────────────────────────────────
  const handleMoveLead = useCallback(async (leadId: string, colunaId: string) => {
    const previousLeads = leadsRef.current;
    pendingUpdates.current.set(leadId, colunaId);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, fase: colunaId } : l));

    // Derive boolean flags from the destination column's name
    const coluna = colunasRef.current.find(c => c.id === colunaId);
    const flagPayload = coluna ? getPhasePayloadByColName(coluna.nome) : {};

    const { data: updated, error } = await supabase
      .from('lancamento_leads')
      .update({ fase: colunaId, ...flagPayload })
      .eq('id', leadId)
      .select('*')
      .single();

    if (error || !updated) {
      pendingUpdates.current.delete(leadId);
      toast.error('Erro ao mover lead' + (error ? ': ' + error.message : ''));
      setLeads(previousLeads);
      return;
    }

    const updatedLead = updated as LaunchLead;
    setLeads(prev => prev.map(l => l.id === leadId ? updatedLead : l));
    setTimeout(() => { pendingUpdates.current.delete(leadId); }, 5000);

    // If moved to matricula column, offer to register in financeiro
    if (coluna?.nome.toLowerCase().includes('matricul') && updatedLead.matriculado) {
      openConfirmMatricula(updatedLead);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turmas]);

  // ── Add lead ────────────────────────────────────────────────────────────────
  const handleAddLead = async () => {
    if (!lancamentoId || !newLeadForm.nome || !newLeadForm.whatsapp) return;
    const primeiraColuna = colunasRef.current[0];
    if (!primeiraColuna) { toast.error('Nenhuma coluna encontrada'); return; }
    setIsAddingLead(true);
    const { data: inserted, error } = await supabase.from('lancamento_leads').insert({
      lancamento_id: lancamentoId,
      nome: newLeadForm.nome,
      whatsapp: newLeadForm.whatsapp,
      email: newLeadForm.email || null,
      fase: primeiraColuna.id,
      no_grupo: false,
      grupo_oferta: false,
      matriculado: false,
      responsavel_id: vinicius?.id,
      created_at: new Date().toISOString(),
    }).select('*').single();
    setIsAddingLead(false);
    if (error) { toast.error('Erro ao adicionar lead: ' + error.message); return; }
    if (inserted) setLeads(prev => [inserted as LaunchLead, ...prev]);
    setNewLeadForm({ nome: '', whatsapp: '', email: '' });
    setShowAddLeadDialog(false);
    toast.success('Lead adicionado!');
  };

  // ── CSV Import ─────────────────────────────────────────────────────────────
  const handleFileSelect = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.headers.length === 0) { toast.error('Arquivo inválido ou vazio'); return; }
      const mapping = autoDetectMapping(parsed.headers);
      setImportParsed(parsed);
      setImportMapping(mapping);
      setImportResult(null);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleDoImport = async () => {
    if (!importParsed || !importMapping.nome || !importMapping.whatsapp) return;
    const primeiraColuna = colunasRef.current[0];
    if (!primeiraColuna) { toast.error('Nenhuma coluna encontrada'); return; }
    setImporting(true);

    const nomeIdx = Number(importMapping.nome);
    const waIdx = Number(importMapping.whatsapp);
    const emailIdx = importMapping.email !== '' && importMapping.email !== '__none__' ? Number(importMapping.email) : -1;

    const existingWas = new Set(leads.map(l => l.whatsapp.replace(/\D/g, '')));

    const toInsert = importParsed.rows
      .map(row => ({
        nome: row[nomeIdx]?.trim() || '',
        whatsapp: row[waIdx]?.trim() || '',
        email: emailIdx >= 0 ? row[emailIdx]?.trim() || null : null,
      }))
      .filter(r => r.nome && r.whatsapp);

    const dupes = toInsert.filter(r => existingWas.has(r.whatsapp.replace(/\D/g, ''))).length;
    const fresh = toInsert.filter(r => !existingWas.has(r.whatsapp.replace(/\D/g, '')));

    const BATCH = 100;
    let inserted = 0;
    for (let i = 0; i < fresh.length; i += BATCH) {
      const batch = fresh.slice(i, i + BATCH).map(r => ({
        lancamento_id: lancamentoId,
        nome: r.nome,
        whatsapp: r.whatsapp,
        email: r.email || null,
        fase: primeiraColuna.id,
        no_grupo: false,
        grupo_oferta: false,
        follow_up_01: false,
        follow_up_02: false,
        follow_up_03: false,
        matriculado: false,
        responsavel_id: vinicius?.id || null,
      }));
      const { error } = await supabase.from('lancamento_leads').insert(batch);
      if (error) { toast.error('Erro ao importar: ' + error.message); break; }
      inserted += batch.length;
    }

    setImporting(false);
    setImportResult({ inserted, dupes });
    if (inserted > 0) {
      const newLeads = await fetchAllLeads(lancamentoId) as LaunchLead[];
      const normalized = await normalizeLeadsToCurrentColunas(newLeads);
      setLeads(normalized);
      toast.success(`${inserted} leads importados!`);
    }
  };

  // ── Sync WhatsApp group ─────────────────────────────────────────────────────
  const handleSyncGrupo = async () => {
    if (!syncGrupoInput.trim()) return;
    setSyncingGrupo(true);

    const normalizePhone = (raw: string) => {
      const digits = raw.replace(/\D/g, '');
      if ((digits.length === 13 || digits.length === 12) && digits.startsWith('55')) return digits.slice(2);
      return digits.slice(-11);
    };

    // Extrai SOMENTE JIDs reais de telefone: @s.whatsapp.net ou @c.us
    // @lid são IDs internos do WhatsApp (não são números de telefone)
    const phoneJids = [
      ...[...syncGrupoInput.matchAll(/"phoneNumber"\s*:\s*"(\d{8,})@/g)].map(m => m[1]),
      ...(syncGrupoInput.match(/\d{8,}@(?:s\.whatsapp\.net|c\.us)/g) || []).map(m => m.replace(/@.*/, '')),
    ];
    const uniquePhones = [...new Set(phoneJids)];

    // Conta @lid separadamente — não podem ser comparados a números de telefone
    const lidCount = new Set(syncGrupoInput.match(/\d{7,}@lid/g) || []).size;

    const groupSuffix8 = new Set(uniquePhones.map(n => normalizePhone(n).slice(-8)));

    const matchedLeads = leads.filter(lead => {
      if (!lead.whatsapp) return false;
      const norm = normalizePhone(lead.whatsapp);
      return groupSuffix8.has(norm.slice(-8));
    });

    const notFound = uniquePhones.length - matchedLeads.length;

    const BATCH = 100;
    let updated = 0;
    for (let i = 0; i < matchedLeads.length; i += BATCH) {
      const ids = matchedLeads.slice(i, i + BATCH).map(l => l.id);
      const { error } = await supabase
        .from('lancamento_leads')
        .update({ no_grupo: true })
        .in('id', ids);
      if (!error) {
        updated += ids.length;
        setLeads(prev => prev.map(l => ids.includes(l.id) ? { ...l, no_grupo: true } : l));
      }
    }

    setSyncingGrupo(false);
    setSyncGrupoResult({ updated, notFound: Math.max(0, notFound), lidCount });
  };

  // ── Sync group participants live from Evolution API (server-side) ─────────────
  const handleSyncFromEvolution = async (tipo: 'lancamento' | 'oferta' = 'lancamento') => {
    setSyncingFromEvo(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const res = await fetch(`${supabaseUrl}/functions/v1/sync-grupo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
        body: JSON.stringify({ lancamentoId, tipo }),
      });

      const result = await res.json();

      if (!res.ok || result.error) {
        toast.error(result.error ?? 'Erro ao sincronizar grupo');
        return;
      }

      setSyncGrupoResult({ updated: result.updated, notFound: result.notFound });

      if (result._debug) {
        setSyncDebug(result._debug);
        console.group('sync-grupo debug');
        console.log('Participants (Evolution API):', result._debug.sampleParticipants);
        console.log('Participant suffix8:', result._debug.sampleParticipantSuffix8);
        console.log('Lead phones (DB):', result._debug.sampleLeadPhones);
        console.log('Lead suffix8:', result._debug.sampleLeadSuffix8);
        console.groupEnd();
      }

      // Reload leads so kanban reflects the updates
      if (result.updated > 0) {
        const fresh = await fetchAllLeads(lancamentoId);
        const normalized = await normalizeLeadsToCurrentColunas(fresh as LaunchLead[]);
        setLeads(normalized);
      }
    } catch (e: unknown) {
      toast.error('Erro ao sincronizar: ' + (e as Error).message);
    } finally {
      setSyncingFromEvo(false);
    }
  };

  // ── Toggle active ───────────────────────────────────────────────────────────
  const handleToggleActive = async () => {
    if (!lancamento) return;
    const novoAtivo = !lancamento.ativo;
    const novoStatus = novoAtivo ? 'em_andamento' : 'finalizado';
    setLancamento({ ...lancamento, ativo: novoAtivo, status: novoStatus });

    if (novoAtivo) {
      await supabase.from('lancamentos').update({ ativo: false }).neq('id', lancamentoId);
    }
    const { error } = await supabase
      .from('lancamentos')
      .update({ ativo: novoAtivo, status: novoStatus })
      .eq('id', lancamentoId);

    if (error) {
      setLancamento(lancamento);
      toast.error('Erro ao atualizar lançamento');
    } else {
      toast.success(`Lançamento ${novoAtivo ? 'ativado' : 'desativado'}!`);
    }
  };

  // ── Delete lancamento ───────────────────────────────────────────────────────
  const handleDeleteLancamento = async () => {
    const { error } = await supabase.from('lancamentos').delete().eq('id', lancamentoId);
    if (error) { toast.error('Erro ao deletar: ' + error.message); return; }
    toast.success('Lançamento deletado!');
    setShowDeleteModal(false);
    navigate('/dashboard');
  };

  // ── Save webhook group config ───────────────────────────────────────────────
  const handleSaveWebhook = async () => {
    setSavingWebhook(true);
    const { error } = await supabase
      .from('lancamentos')
      .update({
        grupo_lancamento_jid: webhookForm.grupoLancamentoJid.trim() || null,
        grupo_oferta_jid:     webhookForm.grupoOfertaJid.trim()     || null,
      })
      .eq('id', lancamentoId);
    setSavingWebhook(false);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    setLancamento(prev => prev ? {
      ...prev,
      grupo_lancamento_jid: webhookForm.grupoLancamentoJid.trim() || undefined,
      grupo_oferta_jid:     webhookForm.grupoOfertaJid.trim()     || undefined,
    } : prev);
    toast.success('Configuração de webhook salva!');
    setShowWebhookModal(false);
  };

  // ── Delete lead ─────────────────────────────────────────────────────────────
  const handleDeleteLead = async () => {
    if (!leadToDelete) return;
    const { error } = await supabase.from('lancamento_leads').delete().eq('id', leadToDelete.id);
    if (error) { toast.error('Erro ao deletar lead'); return; }
    setLeads(prev => prev.filter(l => l.id !== leadToDelete.id));
    toast.success('Lead deletado!');
    setLeadToDelete(null);
  };

  // ── Save metas ──────────────────────────────────────────────────────────────
  const handleSaveMetas = async (updates: Partial<Launch>) => {
    const { error } = await supabase.from('lancamentos').update(updates).eq('id', lancamentoId);
    if (error) { toast.error('Erro ao salvar metas'); return; }
    setLancamento(prev => prev ? { ...prev, ...updates } : prev);
    toast.success('Metas salvas!');
  };

  // ── Save valor matrícula ────────────────────────────────────────────────────
  const handleSaveValor = async () => {
    const v = parseFloat(valorInput.replace(',', '.'));
    if (isNaN(v) || v <= 0) { toast.error('Valor inválido'); return; }
    const { error } = await supabase
      .from('lancamentos')
      .update({ valor_matricula: v })
      .eq('id', lancamentoId);
    if (error) { toast.error('Erro ao salvar valor'); return; }
    setLancamento(prev => prev ? { ...prev, valor_matricula: v } : prev);
    setEditingValor(false);
    toast.success('Valor da matrícula atualizado!');
  };

  // ── Edit lead ───────────────────────────────────────────────────────────────
  const handleOpenEditLead = (lead: LaunchLead) => {
    setEditingLead(lead);
    setEditLeadForm({
      nome: lead.nome,
      whatsapp: lead.whatsapp,
      email: lead.email ?? '',
      observacoes: lead.observacoes ?? '',
      matriculado: lead.matriculado,
    });
  };

  const handleSaveEditLead = async () => {
    if (!editingLead) return;
    const { error } = await supabase
      .from('lancamento_leads')
      .update({
        nome: editLeadForm.nome,
        whatsapp: editLeadForm.whatsapp,
        email: editLeadForm.email || null,
        observacoes: editLeadForm.observacoes || null,
        matriculado: editLeadForm.matriculado,
      })
      .eq('id', editingLead.id);
    if (error) { toast.error('Erro ao salvar lead'); return; }
    const updatedLead = { ...editingLead, ...editLeadForm };
    setLeads(prev => prev.map(l => l.id === editingLead.id ? updatedLead : l));
    const wasMatriculado = editingLead.matriculado;
    setEditingLead(null);
    toast.success('Lead atualizado!');
    // If newly marked as matriculado, offer to register in financeiro
    if (!wasMatriculado && editLeadForm.matriculado) {
      openConfirmMatricula(updatedLead);
    }
  };

  // ── Delete column (move orphaned leads to first remaining column) ───────────
  const handleDeleteColWithLeads = async (id: string) => {
    const remaining = colunasRef.current.filter(c => c.id !== id);
    if (remaining.length > 0) {
      const target = remaining[0].id;
      await supabase.from('lancamento_leads').update({ fase: target }).eq('fase', id);
      setLeads(prev => prev.map(l => l.fase === id ? { ...l, fase: target } : l));
    }
    await deleteColuna(id);
    setDeletingColuna(null);
  };

  // ── Derived metrics ─────────────────────────────────────────────────────────
  const valorMatricula = Number(lancamento?.valor_matricula) || VALOR_MATRICULA_PADRAO;
  const totalLeads = leads.length;
  const grupoLancamentoColunaId = findColunaIdByName(colunas, nome => nome === 'grupo_lancamento');
  const grupoOfertaColunaId = findColunaIdByName(colunas, nome => nome === 'grupo_oferta');
  const matriculaColunaId = findColunaIdByName(colunas, nome => nome.includes('matricul'));
  const grupoLancamento = countLeadsByFase(leads, grupoLancamentoColunaId, lead => lead.no_grupo && !lead.grupo_oferta && !lead.follow_up_01 && !lead.follow_up_02 && !lead.follow_up_03 && !lead.matriculado);
  const grupoOferta = countLeadsByFase(leads, grupoOfertaColunaId, lead => lead.grupo_oferta && !lead.follow_up_01 && !lead.follow_up_02 && !lead.follow_up_03 && !lead.matriculado);
  const matriculas = countLeadsByFase(leads, matriculaColunaId, lead => lead.matriculado);
  const receitaMatriculas = matriculas * valorMatricula;

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    if (!searchQuery) return leads;
    const q = searchQuery.toLowerCase();
    return leads.filter(l =>
      l.nome.toLowerCase().includes(q) || l.whatsapp.toLowerCase().includes(q)
    );
  }, [leads, searchQuery]);

  const getLeadsByColuna = (colunaId: string) => filteredLeads.filter(l => l.fase === colunaId);


  if (loading || !lancamento) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 pb-20 lg:pb-6 overflow-y-auto h-full bg-white">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{lancamento.nome}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {lancamento.status === 'finalizado' ? '✅ Finalizado' : '🚀 Em Andamento'}
            </p>
          </div>
          {lancamento.status === 'finalizado' && (
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">
              Finalizado
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => setShowWebhookModal(true)}
            className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
            title="Configurar webhook de grupo WhatsApp"
          >
            <Globe className="h-4 w-4" />
            Webhook Grupos
            {(lancamento.grupo_lancamento_jid || lancamento.grupo_oferta_jid) && (
              <span className="w-2 h-2 rounded-full bg-green-500 ml-0.5" />
            )}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteModal(true)} className="gap-2">
            <Trash2 className="h-4 w-4" />
            Apagar
          </Button>
          <button
            onClick={handleToggleActive}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all text-white ${
              lancamento.ativo ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-500 hover:bg-gray-600'
            }`}
          >
            <Power className="h-4 w-4" />
            {lancamento.ativo ? 'Ativo' : 'Inativo'}
          </button>
        </div>
      </div>

      {/* ── Metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">Total de Leads</p>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{totalLeads}</p>
        </Card>
        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">Grupo Lançamento</p>
            <Target className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold">{grupoLancamento}</p>
        </Card>
        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">Grupo Oferta</p>
            <Target className="h-4 w-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold">{grupoOferta}</p>
        </Card>
        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">Matrículas</p>
            <div className="flex items-center gap-1">
              <DollarSign className="h-4 w-4 text-green-500" />
              <button
                onClick={() => { setValorInput(String(valorMatricula)); setEditingValor(true); }}
                className="text-muted-foreground hover:text-foreground"
                title="Editar valor da matrícula"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          </div>
          <p className="text-2xl font-bold">{matriculas}</p>
          <p className="text-xs text-green-600 font-medium mt-1">R$ {fmt(receitaMatriculas)}</p>
          <p className="text-xs text-muted-foreground">R$ {fmt(valorMatricula)} / un</p>
        </Card>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-2 border-b border-border">
        {([
          { id: 'kanban', label: 'Kanban' },
          { id: 'metas', label: 'Metas' },
          { id: 'relatorio', label: 'Relatório' },
          { id: 'trafego', label: '📊 Tráfego' },
        ] as { id: ActiveView; label: string }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeView === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Metas Tab ── */}
      {activeView === 'metas' && (
        <MetaTab lancamento={lancamento} leads={leads} onSave={handleSaveMetas} />
      )}

      {/* ── Tráfego Tab ── */}
      {activeView === 'trafego' && (
        <TrafegoTab lancamento={lancamento} leads={leads} />
      )}

      {/* ── Relatorio Tab ── */}
      {activeView === 'relatorio' && (
        <RelatorioTab lancamento={lancamento} leads={leads} />
      )}

      {/* ── Kanban Tab ── */}
      {activeView === 'kanban' && (
        <>
          {/* Search and Add */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou WhatsApp..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" className="gap-2" onClick={() => { setShowImportModal(true); setImportParsed(null); setImportResult(null); }}>
              <Upload className="h-4 w-4" />
              Importar CSV
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => { setShowSyncGrupoModal(true); setSyncGrupoInput(''); setSyncGrupoResult(null); }}>
              <UserCheck className="h-4 w-4" />
              Sincronizar Grupo
            </Button>
            <Button variant="default" className="gap-2" onClick={() => setShowAddLeadDialog(true)}>
              <Plus className="h-4 w-4" />
              Adicionar Lead
            </Button>
            <Button
              variant="outline"
              className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
              onClick={() => setShowDisparoModal(true)}
              title="Disparar mensagem WhatsApp para leads de colunas selecionadas"
            >
              <Send className="h-4 w-4" />
              Disparar
            </Button>
          </div>

          {/* Search Results (flat list) */}
          {searchQuery && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{filteredLeads.length} resultado(s) para "{searchQuery}"</p>
              {filteredLeads.length === 0 && (
                <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-lg">
                  Nenhum lead encontrado.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredLeads.map(lead => {
                  return (
                    <div key={lead.id} className={`p-3 rounded-lg border ${lead.matriculado ? 'bg-green-50 border-green-200' : 'bg-white border-border'} shadow-sm`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="font-medium text-sm flex-1">{lead.nome}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => handleOpenEditLead(lead)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
                          <button onClick={e => { e.stopPropagation(); setLeadToDelete(lead); }} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{lead.whatsapp}</p>
                      <Select
                        value={lead.fase}
                        onValueChange={value => handleMoveLead(lead.id, value)}
                        disabled={lancamento.status === 'finalizado'}
                      >
                        <SelectTrigger className="mt-2 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {colunas.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Board */}
          {!searchQuery && <div className="overflow-x-auto">
            <div className="flex gap-4 min-w-full pb-4 items-start">
              {colunas.map(coluna => {
                const colLeads = getLeadsByColuna(coluna.id);
                return (
                  <div key={coluna.id} className="group/col flex-shrink-0 w-80">
                    <div className="bg-muted rounded-lg p-4 h-full">
                      <KanbanColunaHeader
                        coluna={coluna}
                        count={colLeads.length}
                        disabled={lancamento.status === 'finalizado'}
                        onRename={() => setRenamingColuna(coluna)}
                        onDelete={() => setDeletingColuna(coluna)}
                        onMoveLeft={() => moveColuna(coluna.id, 'left')}
                        onMoveRight={() => moveColuna(coluna.id, 'right')}
                        onOpenSettings={() => setSettingsColuna(coluna)}
                      />
                      {colLeads.filter(l => l.whatsapp).length > 0 && (
                        <button
                          onClick={() => { setPreselectColunaId(coluna.id); setShowDisparoModal(true); }}
                          className="mt-1 mb-2 w-full flex items-center justify-center gap-1.5 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-md transition-colors opacity-0 group-hover/col:opacity-100"
                          title={`Disparar para ${colLeads.filter(l => l.whatsapp).length} lead(s) desta coluna`}
                        >
                          <Send className="h-3 w-3" />
                          Disparar ({colLeads.filter(l => l.whatsapp).length})
                        </button>
                      )}
                      <div className="space-y-2 max-h-[600px] overflow-y-auto">
                        {colLeads.map(lead => (
                          <div
                            key={lead.id}
                            className={`p-3 rounded-lg border ${
                              lead.erro
                                ? 'bg-red-50 border-red-200'
                                : lead.matriculado
                                ? 'bg-green-50 border-green-200'
                                : 'bg-white border-border'
                            } hover:shadow-md transition-all`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <span className="font-medium text-sm flex-1">{lead.nome}</span>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {lead.erro && <AlertCircle className="h-4 w-4 text-red-500" />}
                                <button
                                  onClick={() => handleOpenEditLead(lead)}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                  title="Editar lead"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => setLeadToDelete(lead)}
                                  className="text-muted-foreground hover:text-red-500 transition-colors"
                                  title="Apagar lead"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{lead.whatsapp}</p>
                            {lead.email && (
                              <p className="text-xs text-muted-foreground truncate">{lead.email}</p>
                            )}
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {lead.no_grupo && (
                                <Badge className="text-xs bg-amber-100 text-amber-700">Grupo</Badge>
                              )}
                              {lead.grupo_oferta && (
                                <Badge className="text-xs bg-purple-100 text-purple-700">Oferta</Badge>
                              )}
                              {lead.matriculado && (
                                <Badge className="text-xs bg-green-100 text-green-700">Matr.</Badge>
                              )}
                            </div>
                            <Select
                              value={lead.fase}
                              onValueChange={value => handleMoveLead(lead.id, value)}
                              disabled={lancamento.status === 'finalizado'}
                            >
                              <SelectTrigger className="mt-2 h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {colunas.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              <AddColunaButton
                onAdd={addColuna}
                disabled={lancamento.status === 'finalizado'}
              />
            </div>
          </div>}
        </>
      )}

      {/* ── Add Lead Modal ── */}
      <Dialog open={showAddLeadDialog} onOpenChange={open => { if (!open) { setShowAddLeadDialog(false); setNewLeadForm({ nome: '', whatsapp: '', email: '' }); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Nome *"
              value={newLeadForm.nome}
              onChange={e => setNewLeadForm({ ...newLeadForm, nome: e.target.value })}
            />
            <Input
              placeholder="WhatsApp *"
              value={newLeadForm.whatsapp}
              onChange={e => setNewLeadForm({ ...newLeadForm, whatsapp: e.target.value })}
            />
            <Input
              placeholder="Email (opcional)"
              value={newLeadForm.email}
              onChange={e => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddLeadDialog(false)}>Cancelar</Button>
              <Button onClick={handleAddLead} disabled={isAddingLead || !newLeadForm.nome || !newLeadForm.whatsapp}>
                {isAddingLead ? 'Adicionando...' : 'Adicionar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Import CSV Modal ── */}
      <Dialog open={showImportModal} onOpenChange={open => { if (!open) { setShowImportModal(false); setImportParsed(null); setImportResult(null); } }}>
        <DialogContent className="max-w-lg flex flex-col max-h-[90vh]">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Importar Leads via CSV</DialogTitle>
            <DialogDescription>
              Selecione um arquivo .csv exportado do Google Sheets, Excel ou similar. Precisa ter pelo menos as colunas de nome e WhatsApp.
            </DialogDescription>
          </DialogHeader>

          {!importParsed && !importResult && (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-10 cursor-pointer hover:border-primary transition-colors">
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground">Clique para selecionar o arquivo .csv</span>
              <input
                type="file"
                accept=".csv,.txt,.tsv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}
              />
            </label>
          )}

          {importParsed && !importResult && (
            <div className="flex flex-col gap-4 min-h-0 flex-1">
              <div className="overflow-y-auto flex-1 space-y-4 pr-1">
                <p className="text-sm text-muted-foreground">{importParsed.rows.length} linha(s) detectada(s). Configure o mapeamento de colunas:</p>
                <div className="grid grid-cols-1 gap-3">
                  {(['nome', 'whatsapp', 'email'] as const).map(field => (
                    <div key={field} className="flex items-center gap-3">
                      <span className="text-sm w-24 shrink-0 font-medium">{field === 'nome' ? 'Nome *' : field === 'whatsapp' ? 'WhatsApp *' : 'Email'}</span>
                      <Select
                        value={importMapping[field]}
                        onValueChange={v => setImportMapping(m => ({ ...m, [field]: v }))}
                      >
                        <SelectTrigger className="flex-1 h-9 text-sm">
                          <SelectValue placeholder="Selecionar coluna..." />
                        </SelectTrigger>
                        <SelectContent>
                          {field === 'email' && <SelectItem value="__none__">— Ignorar —</SelectItem>}
                          {importParsed.headers.map((h, i) => (
                            <SelectItem key={i} value={String(i)}>{h || `Coluna ${i + 1}`}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <p className="text-xs text-muted-foreground px-3 py-1.5 bg-muted border-b">Prévia (primeiras 3 linhas)</p>
                  <div className="overflow-x-auto max-h-36">
                    <table className="text-xs w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          {importParsed.headers.map((h, i) => (
                            <th key={i} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h || `Col ${i + 1}`}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importParsed.rows.slice(0, 3).map((row, ri) => (
                          <tr key={ri} className="border-b last:border-0">
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-2 py-1.5 truncate max-w-[100px] whitespace-nowrap">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 border-t flex-shrink-0">
                <button onClick={() => setImportParsed(null)} className="text-sm text-muted-foreground hover:text-foreground">Trocar arquivo</button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowImportModal(false)}>Cancelar</Button>
                  <Button
                    onClick={handleDoImport}
                    disabled={importing || !importMapping.nome || !importMapping.whatsapp}
                    className="gap-2"
                  >
                    {importing ? <><Loader2 className="h-4 w-4 animate-spin" />Importando...</> : `Importar ${importParsed.rows.length} leads`}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {importResult && (
            <div className="space-y-4 text-center py-4">
              <div className="text-4xl">✅</div>
              <div>
                <p className="text-lg font-semibold">{importResult.inserted} lead(s) importado(s)!</p>
                {importResult.dupes > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">{importResult.dupes} já existiam (WhatsApp duplicado) e foram ignorados.</p>
                )}
              </div>
              <Button onClick={() => setShowImportModal(false)}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Sincronizar Grupo WhatsApp Modal ── */}
      <Dialog open={showSyncGrupoModal} onOpenChange={open => { if (!open) { setShowSyncGrupoModal(false); setSyncGrupoInput(''); setSyncGrupoResult(null); } }}>
        <DialogContent className="max-w-lg flex flex-col max-h-[90vh]">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2"><UserCheck className="h-5 w-5" /> Sincronizar Grupo WhatsApp</DialogTitle>
            <DialogDescription>
              Cole abaixo o JSON exportado do grupo do WhatsApp. Os leads que tiverem o número detectado serão marcados como <strong>no_grupo = true</strong>.
            </DialogDescription>
          </DialogHeader>

          {!syncGrupoResult ? (
            <div className="flex flex-col gap-4 min-h-0 flex-1">
              {/* Live sync from Evolution API */}
              {lancamento?.grupo_lancamento_jid && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Buscar participantes do WhatsApp</p>
                    <p className="text-xs text-muted-foreground truncate">Grupo: {lancamento.grupo_lancamento_jid}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSyncFromEvolution('lancamento')}
                    disabled={syncingFromEvo}
                    className="shrink-0 gap-1.5"
                  >
                    {syncingFromEvo ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Buscando...</> : <><Users className="h-3.5 w-3.5" />Sincronizar</>}
                  </Button>
                </div>
              )}
              {lancamento?.grupo_oferta_jid && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Buscar participantes — Grupo Oferta</p>
                    <p className="text-xs text-muted-foreground truncate">Grupo: {lancamento.grupo_oferta_jid}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSyncFromEvolution('oferta')}
                    disabled={syncingFromEvo}
                    className="shrink-0 gap-1.5"
                  >
                    {syncingFromEvo ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Buscando...</> : <><Users className="h-3.5 w-3.5" />Sincronizar</>}
                  </Button>
                </div>
              )}
              {(lancamento?.grupo_lancamento_jid || lancamento?.grupo_oferta_jid) && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex-1 h-px bg-border" />
                  <span>ou importe manualmente</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              {/* File upload */}
              <label className="flex items-center gap-3 border border-dashed border-border rounded-lg px-4 py-3 cursor-pointer hover:border-primary transition-colors">
                <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground">
                  {syncGrupoInput ? 'Arquivo carregado — ou clique para trocar' : 'Selecionar arquivo JSON do grupo'}
                </span>
                <input
                  type="file"
                  accept=".json,.txt"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = ev => setSyncGrupoInput(ev.target?.result as string ?? '');
                    reader.readAsText(f, 'UTF-8');
                    e.target.value = '';
                  }}
                />
              </label>

              <p className="text-xs text-muted-foreground text-center">— ou cole o JSON abaixo —</p>

              <textarea
                className="flex-1 min-h-[140px] text-xs font-mono border border-border rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder='[{"phoneNumber":"5511999999999@s.whatsapp.net"}, ...]'
                value={syncGrupoInput}
                onChange={e => setSyncGrupoInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {syncGrupoInput ? (() => {
                  const phones = new Set([
                    ...[...syncGrupoInput.matchAll(/"phoneNumber"\s*:\s*"(\d{8,})@/g)].map(m => m[1]),
                    ...(syncGrupoInput.match(/\d{8,}@(?:s\.whatsapp\.net|c\.us)/g) || []).map(m => m.replace(/@.*/, '')),
                  ]);
                  const lids = new Set(syncGrupoInput.match(/\d{7,}@lid/g) || []);
                  return `${phones.size} telefone(s) detectado(s)${lids.size > 0 ? ` · ${lids.size} @lid (IDs internos — não mapeáveis)` : ''}`;
                })() : 'Aguardando arquivo ou colagem...'}
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t flex-shrink-0">
                <Button variant="outline" onClick={() => setShowSyncGrupoModal(false)}>Cancelar</Button>
                <Button
                  onClick={handleSyncGrupo}
                  disabled={syncingGrupo || !syncGrupoInput.trim()}
                  className="gap-2"
                >
                  {syncingGrupo ? <><Loader2 className="h-4 w-4 animate-spin" />Sincronizando...</> : 'Marcar como no grupo'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-center py-6">
              <div className="text-4xl">{syncGrupoResult.updated > 0 ? '✅' : '⚠️'}</div>
              <div>
                <p className="text-lg font-semibold">{syncGrupoResult.updated} lead(s) marcado(s) como no grupo!</p>
                {syncGrupoResult.notFound > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {syncGrupoResult.notFound} número(s) de telefone do grupo não encontrado(s) nos leads.
                  </p>
                )}
                {!!syncGrupoResult.lidCount && syncGrupoResult.lidCount > 0 && (
                  <p className="text-sm text-amber-600 mt-1">
                    {syncGrupoResult.lidCount} participante(s) com @lid — IDs internos do WhatsApp, não são números de telefone.
                    Use o botão "Sincronizar" acima (Evolution API) para resolvê-los automaticamente.
                  </p>
                )}
              </div>
              {syncGrupoResult.updated === 0 && syncDebug && (
                <div className="text-left bg-muted rounded-lg p-3 text-xs font-mono space-y-1 max-h-48 overflow-y-auto">
                  <p className="font-semibold text-foreground mb-1">Debug — formato dos números:</p>
                  <p className="text-muted-foreground">Evolution API (participantes):</p>
                  {(syncDebug.sampleParticipants as string[]).map((p, i) => (
                    <p key={i} className="text-green-700">{p} → suffix8: {(syncDebug.sampleParticipantSuffix8 as string[])[i]}</p>
                  ))}
                  <p className="text-muted-foreground mt-1">Leads no banco:</p>
                  {(syncDebug.sampleLeadPhones as string[]).map((p, i) => (
                    <p key={i} className="text-blue-700">{p} → suffix8: {(syncDebug.sampleLeadSuffix8 as string[])[i]}</p>
                  ))}
                </div>
              )}
              <Button onClick={() => { setShowSyncGrupoModal(false); setSyncDebug(null); }}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Valor Matrícula Modal ── */}
      <Dialog open={editingValor} onOpenChange={setEditingValor}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Valor da Matrícula</DialogTitle>
            <DialogDescription>
              Este valor será usado para calcular o faturamento de todas as métricas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
              <Input
                type="number"
                step="0.01"
                value={valorInput}
                onChange={e => setValorInput(e.target.value)}
                className="pl-9"
                placeholder="109.90"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingValor(false)}>Cancelar</Button>
              <Button onClick={handleSaveValor}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Lancamento Modal ── */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar Lançamento</DialogTitle>
            <DialogDescription>
              Tem certeza? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteLancamento}>Apagar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Lead Modal ── */}
      <Dialog open={!!leadToDelete} onOpenChange={() => setLeadToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar Lead</DialogTitle>
            <DialogDescription>
              Deseja apagar "{leadToDelete?.nome}"? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setLeadToDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteLead}>Apagar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Column Management Modals ── */}
      <RenameColunaModal
        coluna={renamingColuna}
        onSave={(id, nome) => { renameColuna(id, nome); setRenamingColuna(null); }}
        onClose={() => setRenamingColuna(null)}
      />
      <ColunaSettingsModal
        coluna={settingsColuna}
        onSave={(id, updates) => { updateRegraColuna(id, updates); setSettingsColuna(null); }}
        onClose={() => setSettingsColuna(null)}
      />
      <DeleteColunaModal
        coluna={deletingColuna}
        leadCount={deletingColuna ? getLeadsByColuna(deletingColuna.id).length : 0}
        onConfirm={handleDeleteColWithLeads}
        onClose={() => setDeletingColuna(null)}
      />

      {/* ── Confirmar Matrícula no Financeiro ── */}
      <Dialog open={!!confirmMatriculaLead} onOpenChange={() => setConfirmMatriculaLead(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-emerald-600" /> Registrar Matrícula no Financeiro
            </DialogTitle>
          </DialogHeader>

          {lancamento?.turma_destino_id ? (
            /* ── Modo rápido: turma pré-configurada pelo wizard ── */
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm space-y-2">
                <p className="font-medium text-emerald-800">
                  {confirmMatriculaLead?.nome}
                </p>
                <p className="text-emerald-700">
                  Turma: <strong>{turmas.find(t => t.id === lancamento.turma_destino_id)?.nome ?? 'Turma configurada'}</strong>
                </p>
                <div className="flex gap-4 text-xs text-emerald-600">
                  <span>R$ {Number(confirmMatriculaForm.valor_mensalidade).toFixed(2)}</span>
                  <span>·</span>
                  <span>Dia {confirmMatriculaForm.dia_vencimento}</span>
                  <span>·</span>
                  <span>{confirmMatriculaForm.total_mensalidades}x</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Após confirmar: boas-vindas e link do contrato serão enviados automaticamente via WhatsApp.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmMatriculaLead(null)}>Cancelar</Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  size="sm"
                  onClick={handleConfirmMatricula}
                  disabled={savingMatricula}
                >
                  {savingMatricula ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Registrando...</> : '✓ Confirmar Matrícula'}
                </Button>
              </div>
            </div>
          ) : (
            /* ── Modo completo: selecionar turma manualmente ── */
            <>
              <DialogDescription>
                <strong>{confirmMatriculaLead?.nome}</strong> foi marcado como matriculado.
                Deseja criar o registro de aluno no sistema financeiro?
              </DialogDescription>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Turma</label>
                  <Select
                    value={confirmMatriculaForm.turma_id}
                    onValueChange={v => {
                      const t = turmas.find(x => x.id === v);
                      setConfirmMatriculaForm(f => ({
                        ...f,
                        turma_id: v,
                        produto: t?.produto ?? f.produto,
                        valor_mensalidade: String(t?.valor_mensalidade ?? f.valor_mensalidade),
                        total_mensalidades: String(t?.total_mensalidades ?? f.total_mensalidades),
                      }));
                    }}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecionar turma..." /></SelectTrigger>
                    <SelectContent>
                      {turmas.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Valor mensalidade</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                      <Input
                        type="number" step="0.01" className="pl-8 h-9 text-sm"
                        value={confirmMatriculaForm.valor_mensalidade}
                        onChange={e => setConfirmMatriculaForm(f => ({ ...f, valor_mensalidade: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Dia vencimento</label>
                    <Input
                      type="number" min={1} max={31} className="h-9 text-sm"
                      value={confirmMatriculaForm.dia_vencimento}
                      onChange={e => setConfirmMatriculaForm(f => ({ ...f, dia_vencimento: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Total de parcelas</label>
                  <Input
                    type="number" min={1} className="h-9 text-sm"
                    value={confirmMatriculaForm.total_mensalidades}
                    onChange={e => setConfirmMatriculaForm(f => ({ ...f, total_mensalidades: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setConfirmMatriculaLead(null)}>Não agora</Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleConfirmMatricula}
                  disabled={savingMatricula}
                >
                  {savingMatricula ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Registrando...</> : 'Registrar Aluno'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Lead Modal ── */}
      <Dialog open={!!editingLead} onOpenChange={() => setEditingLead(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Nome</label>
              <Input value={editLeadForm.nome} onChange={e => setEditLeadForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">WhatsApp</label>
              <Input value={editLeadForm.whatsapp} onChange={e => setEditLeadForm(f => ({ ...f, whatsapp: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Email</label>
              <Input value={editLeadForm.email} onChange={e => setEditLeadForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Observações</label>
              <Input value={editLeadForm.observacoes} onChange={e => setEditLeadForm(f => ({ ...f, observacoes: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Status do Contrato</label>
              <Select value={editLeadForm.matriculado ? 'sim' : 'nao'} onValueChange={v => setEditLeadForm(f => ({ ...f, matriculado: v === 'sim' }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao">Sem contrato</SelectItem>
                  <SelectItem value="sim">Contrato assinado ✅</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" onClick={() => setEditingLead(null)}>Cancelar</Button>
              <Button onClick={handleSaveEditLead}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Disparo por Coluna Modal ── */}
      <KanbanDisparoModal
        open={showDisparoModal}
        onClose={() => { setShowDisparoModal(false); setPreselectColunaId(null); }}
        colunas={colunas}
        leads={leads}
        evoInstances={evoInstances}
        onStart={handleStartDisparo}
        initialColunaIds={preselectColunaId ? [preselectColunaId] : undefined}
      />

      {/* ── Campanhas Disparo Panel (floating) ── */}
      <CampanhasDisparoPanel
        disparos={disparos}
        onPause={id => {
          disparosPauseMap.current.set(id, true);
          setDisparos(prev => prev.map(d => d.id === id ? { ...d, status: 'paused' } : d));
        }}
        onResume={id => {
          disparosPauseMap.current.set(id, false);
          setDisparos(prev => prev.map(d => d.id === id ? { ...d, status: 'running' } : d));
        }}
        onStop={id => {
          disparosStopMap.current.set(id, true);
          setDisparos(prev => prev.map(d => d.id === id ? { ...d, status: 'stopped', countdownMs: 0 } : d));
        }}
        onDismiss={id => setDisparos(prev => prev.filter(d => d.id !== id))}
      />

      {/* ── Webhook Grupos Modal ── */}
      <Dialog open={showWebhookModal} onOpenChange={setShowWebhookModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-600" />
              Webhook — Entrada no Grupo WhatsApp
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* URL do webhook */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">URL do Webhook (copie para a Evolution API)</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-md bg-muted text-xs font-mono text-foreground break-all select-all">
                  {WEBHOOK_URL}
                </code>
                <Button
                  size="sm" variant="outline"
                  onClick={() => { navigator.clipboard.writeText(WEBHOOK_URL); toast.success('URL copiada!'); }}
                  className="shrink-0 gap-1.5"
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </Button>
              </div>
            </div>

            {/* Instruções */}
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 space-y-1">
              <p className="font-semibold">Como configurar na Evolution API:</p>
              <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
                <li>Acesse sua instância → <strong>Webhook</strong></li>
                <li>Cole a URL acima e marque o evento <strong>GROUP_PARTICIPANTS_UPDATE</strong></li>
                <li>Salve e ative o webhook</li>
                <li>Cole os JIDs dos grupos abaixo (encontre em <em>Grupos → ID do grupo</em>)</li>
              </ol>
            </div>

            {/* JID Grupo Lançamento */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                JID do Grupo de Lançamento
                {lancamento?.grupo_lancamento_jid && (
                  <span className="ml-2 text-xs font-normal text-green-600">● configurado</span>
                )}
              </label>
              <input
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="120363XXXXXXXXXX@g.us"
                value={webhookForm.grupoLancamentoJid}
                onChange={e => setWebhookForm(f => ({ ...f, grupoLancamentoJid: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Quando alguém entrar neste grupo: marca <code className="bg-muted px-1 rounded">no_grupo = true</code> e move o lead para a coluna <em>Grupo Lançamento</em>.
              </p>
            </div>

            {/* JID Grupo Oferta */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                JID do Grupo de Oferta
                {lancamento?.grupo_oferta_jid && (
                  <span className="ml-2 text-xs font-normal text-green-600">● configurado</span>
                )}
              </label>
              <input
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="120363YYYYYYYYYY@g.us"
                value={webhookForm.grupoOfertaJid}
                onChange={e => setWebhookForm(f => ({ ...f, grupoOfertaJid: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Quando alguém entrar neste grupo: marca <code className="bg-muted px-1 rounded">grupo_oferta = true</code> e move para <em>Grupo Oferta</em>.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowWebhookModal(false)}>Cancelar</Button>
            <Button onClick={handleSaveWebhook} disabled={savingWebhook} className="gap-2">
              {savingWebhook ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              Salvar configuração
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
