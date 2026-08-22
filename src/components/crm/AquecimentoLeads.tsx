import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Flame, Plus, RefreshCw, Users, Settings, X, ChevronLeft,
  Search, Send, Clock, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ── Types ─────────────────────────────────────────────────────────────────

type MsgType = 'text' | 'image' | 'audio' | 'video' | 'document';
type LeadStatus = 'aguardando_envio_fase' | 'aguardando_engajamento' | 'aguardando_isca' | 'isca_enviada' | 'erro';

interface Fase {
  id: string;
  fase_numero: number;
  nome: string;
  message_type: MsgType;
  mensagem_texto: string;
  media_url: string | null;
  ativo: boolean;
}

interface AquecConfig {
  isca_message_type: MsgType;
  isca_texto: string;
  isca_media_url: string | null;
  isca_delay_min_min: number;
  isca_delay_max_min: number;
}

interface VendedorLink {
  id: string;
  usuario_id: string;
  evolution_config_id: string;
  ativo: boolean;
}

interface Campanha {
  id: string;
  nome: string;
  leads_total: number;
  criado_em: string;
}

interface LeadRow {
  id: string;
  nome: string | null;
  phone: string;
  fase_atual: number;
  status: LeadStatus;
  isca_agendada_para: string | null;
  vendedor_id: string | null;
  error_msg: string | null;
}

interface LeadPreview { nome: string; phone: string; origem_tabela: string; origem_id: string; }

const STATUS_CFG: Record<LeadStatus, { label: string; badge: string; icon: React.ElementType }> = {
  aguardando_envio_fase:  { label: 'Aguardando envio',  badge: 'bg-gray-100 text-gray-600',       icon: Clock },
  aguardando_engajamento: { label: 'Aguardando resposta', badge: 'bg-blue-50 text-blue-700',      icon: Clock },
  aguardando_isca:        { label: 'Aguardando isca',   badge: 'bg-amber-50 text-amber-700',      icon: Clock },
  isca_enviada:           { label: 'Isca enviada',      badge: 'bg-emerald-50 text-emerald-700',  icon: CheckCircle2 },
  erro:                   { label: 'Erro',              badge: 'bg-red-50 text-red-700',          icon: AlertCircle },
};

function fmtDatetime(iso: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}–****`;
  return phone.slice(0, 6) + '****';
}

// ── Main ──────────────────────────────────────────────────────────────────

export function AquecimentoLeads() {
  const [tab, setTab] = useState<'campanhas' | 'config'>('campanhas');
  const [campanhaAberta, setCampanhaAberta] = useState<string | null>(null);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-white border-b px-6 py-3 flex-none">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => { setTab('campanhas'); setCampanhaAberta(null); }}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                tab === 'campanhas' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <Flame className="h-3.5 w-3.5" /> Campanhas
            </button>
            <button
              onClick={() => setTab('config')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                tab === 'config' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <Settings className="h-3.5 w-3.5" /> Configuração
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {tab === 'config' && <ConfigView />}
        {tab === 'campanhas' && !campanhaAberta && <CampanhasList onOpen={setCampanhaAberta} />}
        {tab === 'campanhas' && campanhaAberta && (
          <CampanhaDetalhe campanhaId={campanhaAberta} onVoltar={() => setCampanhaAberta(null)} />
        )}
      </div>
    </div>
  );
}

// ── Lista de campanhas ───────────────────────────────────────────────────

function CampanhasList({ onOpen }: { onOpen: (id: string) => void }) {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('lead_aquecimento_campanhas' as any)
      .select('id, nome, leads_total, criado_em')
      .order('criado_em', { ascending: false });
    if (error) { toast.error('Erro ao carregar campanhas: ' + error.message); setLoading(false); return; }
    setCampanhas((data ?? []) as unknown as Campanha[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{campanhas.length} campanha(s) de aquecimento</p>
        <Button size="sm" onClick={() => setModalAberto(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Nova campanha
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : campanhas.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center border rounded-lg bg-white">
          <Flame className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma campanha de aquecimento ainda</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Nome</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Leads</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Criada em</th>
              </tr>
            </thead>
            <tbody>
              {campanhas.map(c => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50/60 cursor-pointer" onClick={() => onOpen(c.id)}>
                  <td className="px-4 py-2 font-medium">{c.nome}</td>
                  <td className="px-4 py-2 text-muted-foreground">{c.leads_total}</td>
                  <td className="px-4 py-2 text-muted-foreground">{fmtDatetime(c.criado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalAberto && (
        <NovaCampanhaModal onClose={() => setModalAberto(false)} onCreated={() => { setModalAberto(false); load(); }} />
      )}
    </div>
  );
}

// ── Nova campanha: filtra leads_unificados, mesmo padrão da aba Leads ──────

const ORIGENS: { valor: string; label: string }[] = [
  { valor: 'lancamento_leads',    label: 'Lançamento' },
  { valor: 'npa_evento_leads',    label: 'Evento NPA' },
  { valor: 'alunos',              label: 'Aluno' },
  { valor: 'seu_numerologo_leads', label: 'Numerólogo' },
];

interface LeadUnificado {
  origem_tabela: string; origem_id: string; nome: string | null; telefone: string | null;
  temperatura: 'quente' | 'morno' | 'frio'; produto: string | null;
}

function NovaCampanhaModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [nome, setNome] = useState('');
  const [search, setSearch] = useState('');
  const [origemFiltro, setOrigemFiltro] = useState<Set<string>>(new Set());
  const [tempFiltro, setTempFiltro] = useState<Set<'quente' | 'morno' | 'frio'>>(new Set());
  const [preview, setPreview] = useState<LeadUnificado[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const carregarPreview = useCallback(async () => {
    setLoadingPreview(true);
    let q = supabase.from('leads_unificados' as any).select('origem_tabela, origem_id, nome, telefone, temperatura, produto', { count: 'exact' })
      .not('telefone', 'is', null);
    if (search.trim()) q = q.or(`nome.ilike.%${search.trim()}%,telefone.ilike.%${search.trim()}%`);
    if (origemFiltro.size) q = q.in('origem_tabela', [...origemFiltro]);
    if (tempFiltro.size) q = q.in('temperatura', [...tempFiltro]);
    const { data, count, error } = await q.limit(500);
    if (error) { toast.error('Erro ao filtrar leads: ' + error.message); setLoadingPreview(false); return; }
    setPreview((data ?? []) as unknown as LeadUnificado[]);
    setTotal(count ?? 0);
    setLoadingPreview(false);
  }, [search, origemFiltro, tempFiltro]);

  useEffect(() => { carregarPreview(); }, [carregarPreview]);

  function toggleSet<T>(set: Set<T>, setSet: (s: Set<T>) => void, value: T) {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    setSet(next);
  }

  async function criar() {
    if (!nome.trim()) { toast.error('Dê um nome pra campanha'); return; }
    if (!preview.length) { toast.error('Nenhum lead nesse filtro'); return; }
    setSaving(true);

    const { data: campanha, error: campErr } = await supabase
      .from('lead_aquecimento_campanhas' as any)
      .insert({ nome: nome.trim(), leads_total: preview.length } as any)
      .select('id')
      .single();
    if (campErr || !campanha) {
      toast.error('Erro ao criar campanha: ' + (campErr?.message ?? '')); setSaving(false); return;
    }

    const rows = preview
      .filter(l => l.telefone)
      .map(l => ({
        campanha_id: (campanha as any).id,
        nome: l.nome,
        phone: l.telefone,
        origem_tabela: l.origem_tabela,
        origem_id: l.origem_id,
        produto: l.produto,
      }));

    const { error: leadsErr } = await supabase.from('lead_aquecimento_leads' as any).insert(rows as any);
    if (leadsErr) { toast.error('Erro ao adicionar leads: ' + leadsErr.message); setSaving(false); return; }

    toast.success(`Campanha criada com ${rows.length} lead(s)`);
    setSaving(false);
    onCreated();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold">Nova campanha de aquecimento</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-auto">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nome da campanha</label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Base fria SP - agosto" className="mt-1" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Filtrar leads da base</label>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Buscar nome ou telefone…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 w-56 text-sm" />
              </div>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                {ORIGENS.map(o => (
                  <button key={o.valor} onClick={() => toggleSet(origemFiltro, setOrigemFiltro, o.valor)}
                    className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                      origemFiltro.has(o.valor) ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                {(['quente', 'morno', 'frio'] as const).map(t => (
                  <button key={t} onClick={() => toggleSet(tempFiltro, setTempFiltro, t)}
                    className={cn('px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all',
                      tempFiltro.has(t) ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 border-b px-3 py-1.5 text-xs text-muted-foreground flex items-center justify-between">
              <span>{loadingPreview ? 'Carregando…' : `${total} lead(s) encontrados${total > 500 ? ' (mostrando 500)' : ''}`}</span>
            </div>
            <div className="max-h-52 overflow-auto">
              {preview.slice(0, 50).map(l => (
                <div key={`${l.origem_tabela}-${l.origem_id}`} className="px-3 py-1.5 text-sm border-b last:border-0 flex items-center justify-between">
                  <span className="font-medium truncate">{l.nome || '—'}</span>
                  <span className="text-muted-foreground font-mono text-xs">{l.telefone ? maskPhone(l.telefone) : '—'}</span>
                </div>
              ))}
              {preview.length > 50 && (
                <div className="px-3 py-1.5 text-xs text-muted-foreground text-center">…e mais {preview.length - 50}</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={criar} disabled={saving || !preview.length} className="gap-1.5">
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Criar campanha ({total})
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Detalhe da campanha ──────────────────────────────────────────────────

function CampanhaDetalhe({ campanhaId, onVoltar }: { campanhaId: string; onVoltar: () => void }) {
  const [campanha, setCampanha] = useState<Campanha | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: camp }, { data: rows }] = await Promise.all([
      supabase.from('lead_aquecimento_campanhas' as any).select('id, nome, leads_total, criado_em').eq('id', campanhaId).maybeSingle(),
      supabase.from('lead_aquecimento_leads' as any)
        .select('id, nome, phone, fase_atual, status, isca_agendada_para, vendedor_id, error_msg')
        .eq('campanha_id', campanhaId)
        .order('criado_em', { ascending: false }),
    ]);
    setCampanha(camp as unknown as Campanha);
    setLeads((rows ?? []) as unknown as LeadRow[]);
    setLoading(false);
  }, [campanhaId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel(`aquecimento_leads_detalhe_${campanhaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_aquecimento_leads', filter: `campanha_id=eq.${campanhaId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [campanhaId, load]);

  const counts = leads.reduce((acc, l) => { acc[l.status] = (acc[l.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onVoltar} className="gap-1"><ChevronLeft className="h-4 w-4" /> Campanhas</Button>
        <h2 className="font-semibold">{campanha?.nome ?? '…'}</h2>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {(Object.keys(STATUS_CFG) as LeadStatus[]).map(s => (
          <div key={s} className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium', STATUS_CFG[s].badge)}>
            {counts[s] ?? 0} {STATUS_CFG[s].label}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nome</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Telefone</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Fase</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Isca agendada</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(l => {
                const cfg = STATUS_CFG[l.status];
                return (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-gray-50/60">
                    <td className="px-3 py-1.5 font-medium truncate max-w-[180px]">{l.nome || '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">{maskPhone(l.phone)}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{l.fase_atual}/4</td>
                    <td className="px-3 py-1.5">
                      <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium', cfg.badge)}>
                        <cfg.icon className="h-2.5 w-2.5" />{cfg.label}
                      </span>
                      {l.error_msg && <span className="block text-[10px] text-red-600 mt-0.5 truncate max-w-[200px]">{l.error_msg}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{fmtDatetime(l.isca_agendada_para)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Config: fases, isca, vendedores ──────────────────────────────────────

function ConfigView() {
  return (
    <div className="space-y-8 max-w-3xl">
      <FasesConfig />
      <IscaConfig />
      <VendedoresConfig />
    </div>
  );
}

function FasesConfig() {
  const [fases, setFases] = useState<Fase[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('lead_aquecimento_fases' as any).select('*').order('fase_numero');
    if (error) { toast.error('Erro ao carregar fases: ' + error.message); setLoading(false); return; }
    setFases((data ?? []) as unknown as Fase[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateLocal(id: string, patch: Partial<Fase>) {
    setFases(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  }

  async function salvar(fase: Fase) {
    setSavingId(fase.id);
    const { error } = await supabase.from('lead_aquecimento_fases' as any).update({
      nome: fase.nome, message_type: fase.message_type, mensagem_texto: fase.mensagem_texto,
      media_url: fase.media_url, ativo: fase.ativo,
    } as any).eq('id', fase.id);
    setSavingId(null);
    if (error) toast.error('Erro ao salvar fase: ' + error.message);
    else toast.success(`${fase.nome} salva`);
  }

  if (loading) return <div className="flex items-center justify-center h-24"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div>
      <h3 className="font-semibold mb-1">As 4 fases de aquecimento</h3>
      <p className="text-xs text-muted-foreground mb-3">Avanço só acontece quando o lead responde/interage. Sem resposta, fica parado na fase atual.</p>
      <div className="space-y-3">
        {fases.map(fase => (
          <div key={fase.id} className="border rounded-lg bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Input value={fase.nome} onChange={e => updateLocal(fase.id, { nome: e.target.value })} className="max-w-xs font-medium" />
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Ativa</span>
                <Switch checked={fase.ativo} onCheckedChange={v => updateLocal(fase.id, { ativo: v })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={fase.message_type} onValueChange={v => updateLocal(fase.id, { message_type: v as MsgType })}>
                <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="image">Imagem</SelectItem>
                  <SelectItem value="audio">Áudio</SelectItem>
                  <SelectItem value="video">Vídeo</SelectItem>
                  <SelectItem value="document">Documento</SelectItem>
                </SelectContent>
              </Select>
              {fase.message_type !== 'text' && (
                <Input placeholder="URL da mídia" value={fase.media_url ?? ''} onChange={e => updateLocal(fase.id, { media_url: e.target.value })} className="h-8 text-sm flex-1" />
              )}
            </div>
            <Textarea value={fase.mensagem_texto} onChange={e => updateLocal(fase.id, { mensagem_texto: e.target.value })}
              placeholder={fase.message_type === 'text' ? 'Mensagem de texto…' : 'Legenda (opcional)…'} rows={2} className="text-sm" />
            <div className="flex justify-end">
              <Button size="sm" onClick={() => salvar(fase)} disabled={savingId === fase.id}>
                {savingId === fase.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IscaConfig() {
  const [cfg, setCfg] = useState<AquecConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('lead_aquecimento_config' as any)
      .select('isca_message_type, isca_texto, isca_media_url, isca_delay_min_min, isca_delay_max_min')
      .eq('id', 'default').maybeSingle();
    if (error) { toast.error('Erro ao carregar config da isca: ' + error.message); return; }
    setCfg(data as unknown as AquecConfig);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function salvar() {
    if (!cfg) return;
    setSaving(true);
    const { error } = await supabase.from('lead_aquecimento_config' as any).update(cfg as any).eq('id', 'default');
    setSaving(false);
    if (error) toast.error('Erro ao salvar: ' + error.message);
    else toast.success('Configuração da isca salva');
  }

  if (!cfg) return null;

  return (
    <div>
      <h3 className="font-semibold mb-1">Mensagem de isca</h3>
      <p className="text-xs text-muted-foreground mb-3">Enviada automaticamente pelo número do vendedor designado, com o delay abaixo depois que o lead termina a fase 4.</p>
      <div className="border rounded-lg bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Select value={cfg.isca_message_type} onValueChange={v => setCfg({ ...cfg, isca_message_type: v as MsgType })}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Texto</SelectItem>
              <SelectItem value="image">Imagem</SelectItem>
              <SelectItem value="audio">Áudio</SelectItem>
              <SelectItem value="video">Vídeo</SelectItem>
              <SelectItem value="document">Documento</SelectItem>
            </SelectContent>
          </Select>
          {cfg.isca_message_type !== 'text' && (
            <Input placeholder="URL da mídia" value={cfg.isca_media_url ?? ''} onChange={e => setCfg({ ...cfg, isca_media_url: e.target.value })} className="h-8 text-sm flex-1" />
          )}
        </div>
        <Textarea value={cfg.isca_texto} onChange={e => setCfg({ ...cfg, isca_texto: e.target.value })}
          placeholder="Mensagem de isca…" rows={2} className="text-sm" />
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground">Delay mínimo (min)</label>
          <Input type="number" min={0} value={cfg.isca_delay_min_min} onChange={e => setCfg({ ...cfg, isca_delay_min_min: Number(e.target.value) })} className="h-8 w-20 text-sm" />
          <label className="text-xs text-muted-foreground">Delay máximo (min)</label>
          <Input type="number" min={0} value={cfg.isca_delay_max_min} onChange={e => setCfg({ ...cfg, isca_delay_max_min: Number(e.target.value) })} className="h-8 w-20 text-sm" />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={salvar} disabled={saving}>
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function VendedoresConfig() {
  const { getActiveVendedores } = useAuth();
  const vendedores = getActiveVendedores().filter(v => v.tipo === 'vendedor');
  const [links, setLinks] = useState<VendedorLink[]>([]);
  const [instancias, setInstancias] = useState<{ id: string; instance_name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: linkRows }, { data: instRows }] = await Promise.all([
      supabase.from('lead_aquecimento_vendedores' as any).select('id, usuario_id, evolution_config_id, ativo'),
      supabase.from('evolution_config').select('id, instance_name').order('instance_name'),
    ]);
    setLinks((linkRows ?? []) as unknown as VendedorLink[]);
    setInstancias((instRows ?? []) as { id: string; instance_name: string }[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setInstancia(usuarioId: string, evolutionConfigId: string) {
    const existente = links.find(l => l.usuario_id === usuarioId);
    if (existente) {
      const { error } = await supabase.from('lead_aquecimento_vendedores' as any).update({ evolution_config_id: evolutionConfigId } as any).eq('id', existente.id);
      if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('lead_aquecimento_vendedores' as any).insert({ usuario_id: usuarioId, evolution_config_id: evolutionConfigId, ativo: true } as any);
      if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    }
    load();
  }

  async function toggleAtivo(usuarioId: string, ativo: boolean) {
    const existente = links.find(l => l.usuario_id === usuarioId);
    if (!existente) return;
    const { error } = await supabase.from('lead_aquecimento_vendedores' as any).update({ ativo } as any).eq('id', existente.id);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    load();
  }

  if (loading) return <div className="flex items-center justify-center h-24"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div>
      <h3 className="font-semibold mb-1">Vendedores e suas instâncias</h3>
      <p className="text-xs text-muted-foreground mb-3">Cada vendedor precisa de uma instância WhatsApp própria pra receber a isca no rodízio. Cadastre vendedores em Equipe.</p>
      {vendedores.length === 0 ? (
        <div className="border rounded-lg bg-white p-4 text-sm text-muted-foreground">Nenhum vendedor ativo cadastrado ainda.</div>
      ) : (
        <div className="border rounded-lg bg-white divide-y">
          {vendedores.map(v => {
            const link = links.find(l => l.usuario_id === v.id);
            return (
              <div key={v.id} className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{v.nome}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Select value={link?.evolution_config_id ?? ''} onValueChange={val => setInstancia(v.id, val)}>
                    <SelectTrigger className="w-56 h-8 text-sm"><SelectValue placeholder="Selecionar instância…" /></SelectTrigger>
                    <SelectContent>
                      {instancias.map(i => <SelectItem key={i.id} value={i.id}>{i.instance_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Switch checked={link?.ativo ?? false} disabled={!link} onCheckedChange={val => toggleAtivo(v.id, val)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
