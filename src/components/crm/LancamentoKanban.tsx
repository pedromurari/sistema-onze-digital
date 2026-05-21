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
  const [syncGrupoResult, setSyncGrupoResult] = useState<{ updated: number; notFound: number } | null>(null);
  const [syncingFromEvo, setSyncingFromEvo] = useState(false);

  // Webhook groups config
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [webhookForm, setWebhookForm] = useState({ grupoLancamentoJid: '', grupoOfertaJid: '' });
  const [savingWebhook, setSavingWebhook] = useState(false);
  const WEBHOOK_URL = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/webhook-grupo';

  // Column management
  const [renamingColuna, setRenamingColuna] = useState<KanbanColuna | null>(null);
  const [deletingColuna, setDeletingColuna] = useState<KanbanColuna | null>(null);
  const [settingsColuna, setSettingsColuna] = useState<KanbanColuna | null>(null);

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

    setLeads(prev => prev.map(l => l.id === leadId ? (updated as LaunchLead) : l));
    setTimeout(() => { pendingUpdates.current.delete(leadId); }, 5000);
  }, []);

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

    // Normalize phone to last 11 digits (DDD + número), removing country code 55 if present
    const normalizePhone = (raw: string) => {
      const digits = raw.replace(/\D/g, '');
      if ((digits.length === 13 || digits.length === 12) && digits.startsWith('55')) return digits.slice(2);
      return digits.slice(-11);
    };

    // Extract phoneNumber fields (format: "5511999999999@s.whatsapp.net") first,
    // falling back to any 8+ digit sequence if none found
    const phoneFieldMatches = [...syncGrupoInput.matchAll(/"phoneNumber"\s*:\s*"(\d+)@/g)].map(m => m[1]);
    const rawNumbers = phoneFieldMatches.length > 0
      ? phoneFieldMatches
      : (syncGrupoInput.match(/(\d{8,})@s\.whatsapp\.net/g) || []).map(m => m.replace(/@.*/, ''))
        .concat((syncGrupoInput.match(/\d{8,}/g) || []));
    const uniqueRaw = [...new Set(rawNumbers)];
    // Compare by last 8 digits (core number without area code or 9-prefix)
    // WhatsApp stores old 8-digit format; leads may have new 9-digit format
    const groupSuffix8 = new Set(uniqueRaw.map(n => normalizePhone(n).slice(-8)));

    const matchedLeads = leads.filter(lead => {
      const norm = normalizePhone(lead.whatsapp);
      return groupSuffix8.has(norm.slice(-8));
    });

    const notFound = uniqueRaw.length - matchedLeads.length;

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
    setSyncGrupoResult({ updated, notFound: Math.max(0, notFound) });
  };

  // ── Sync group participants live from Evolution API ─────────────────────────
  const handleSyncFromEvolution = async (tipo: 'lancamento' | 'oferta' = 'lancamento') => {
    const jid = tipo === 'lancamento' ? lancamento?.grupo_lancamento_jid : lancamento?.grupo_oferta_jid;
    if (!jid) { toast.error('JID do grupo não configurado'); return; }

    setSyncingFromEvo(true);
    try {
      // Fetch active Evolution instance
      const { data: instances } = await (supabase as any)
        .from('evolution_config')
        .select('instance_name, api_url, api_key')
        .eq('ativo', true)
        .limit(1);

      if (!instances?.length) {
        toast.error('Nenhuma instância Evolution API ativa encontrada. Configure em Disparo → Instâncias.');
        return;
      }

      const { instance_name, api_url, api_key } = instances[0];

      // Try Evolution API v2 endpoint first, fall back to v1
      let participants: string[] = [];
      const headers = { 'apikey': api_key, 'Content-Type': 'application/json' };

      for (const endpoint of [
        `${api_url}/group/findParticipants/${instance_name}?groupJid=${encodeURIComponent(jid)}`,
        `${api_url}/group/participants/${instance_name}?groupJid=${encodeURIComponent(jid)}`,
      ]) {
        let res: Response;
        try { res = await fetch(endpoint, { headers }); } catch { continue; }
        if (!res.ok) continue;
        const json = await res.json();
        // Response may be array or { participants: [] }
        const raw: unknown[] = Array.isArray(json) ? json : (json?.participants ?? json?.data ?? []);
        participants = raw.map((p: any) => String(p?.id ?? p?.phone ?? p?.phoneNumber ?? ''))
          .filter(s => /\d{8,}/.test(s));
        if (participants.length) break;
      }

      if (!participants.length) {
        toast.error('Nenhum participante retornado. Verifique a instância e o JID do grupo.');
        return;
      }

      // Find "Grupo Lançamento" column ID to move leads
      const grupoColId = tipo === 'lancamento'
        ? findColunaIdByName(colunas, n => n.includes('grupol') || (n.includes('grupo') && n.includes('lancamento')))
        : findColunaIdByName(colunas, n => n.includes('grupoo') || (n.includes('grupo') && n.includes('oferta')));

      const normalizePhone = (raw: string) => {
        const digits = raw.replace(/\D/g, '');
        if ((digits.length === 13 || digits.length === 12) && digits.startsWith('55')) return digits.slice(2);
        return digits.slice(-11);
      };
      const groupSuffix8 = new Set(participants.map(p => normalizePhone(p).slice(-8)));
      const matchedLeads = leads.filter(l => groupSuffix8.has(normalizePhone(l.whatsapp).slice(-8)));
      const notFound = participants.length - matchedLeads.length;

      const fieldName = tipo === 'lancamento' ? 'no_grupo' : 'grupo_oferta';
      const updates: Record<string, unknown> = { [fieldName]: true };
      if (grupoColId) updates.fase = grupoColId;

      const BATCH = 100;
      let updated = 0;
      for (let i = 0; i < matchedLeads.length; i += BATCH) {
        const ids = matchedLeads.slice(i, i + BATCH).map(l => l.id);
        const { error } = await supabase.from('lancamento_leads').update(updates).in('id', ids);
        if (!error) {
          updated += ids.length;
          setLeads(prev => prev.map(l => ids.includes(l.id) ? { ...l, ...updates as Partial<LaunchLead> } : l));
        }
      }

      setSyncGrupoResult({ updated, notFound: Math.max(0, notFound) });
      toast.success(`${updated} lead(s) marcado(s) como no grupo!`);
    } catch (e: unknown) {
      toast.error('Erro ao buscar participantes: ' + (e as Error).message);
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
    setLeads(prev => prev.map(l => l.id === editingLead.id ? { ...l, ...editLeadForm } : l));
    setEditingLead(null);
    toast.success('Lead atualizado!');
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
                {syncGrupoInput
                  ? `${[...syncGrupoInput.matchAll(/"phoneNumber"\s*:\s*[\n\r\s]*"(\d+)@/g)].length || (syncGrupoInput.match(/\d{8,}/g) || []).length} número(s) detectado(s)`
                  : 'Aguardando arquivo ou colagem...'}
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
              <div className="text-4xl">✅</div>
              <div>
                <p className="text-lg font-semibold">{syncGrupoResult.updated} lead(s) marcado(s) como no grupo!</p>
                {syncGrupoResult.notFound > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">{syncGrupoResult.notFound} número(s) do grupo não encontrado(s) na planilha.</p>
                )}
              </div>
              <Button onClick={() => setShowSyncGrupoModal(false)}>Fechar</Button>
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
