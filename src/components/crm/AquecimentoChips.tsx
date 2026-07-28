import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Flame, Users, MessageSquare, Settings2, ListChecks, Gauge,
  Plus, RefreshCw, Pause, Play, CheckCircle2, Trash2, X, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ── Types ─────────────────────────────────────────────────────────────────────

type ChipStatus = 'aquecendo' | 'pausado' | 'pronto';

interface EvoInstance { id: string; instance_name: string; ativo: boolean; }

interface AquecimentoChip {
  id: string;
  evolution_config_id: string;
  numero_whatsapp: string;
  ativo: boolean;
  data_inicio: string;
  status: ChipStatus;
  enviados_hoje: number;
  consecutive_errors: number;
}

interface Grupo {
  id: string;
  nome: string;
  grupo_jid: string;
  membros: string[];
  ativo: boolean;
}

interface Mensagem {
  id: string;
  texto: string;
  tipo: 'dm' | 'grupo' | 'ambos';
  ativo: boolean;
}

interface SaudeRow {
  chip_id: string;
  instance_name: string;
  numero_whatsapp: string;
  status: ChipStatus;
  dia_aquecimento: number;
  total_enviados: number;
  total_entregues: number;
  total_lidos: number;
  total_falhas: number;
  taxa_entrega: number | null;
  taxa_leitura: number | null;
  desconexoes_7d: number;
  estado_atual: string | null;
  classificacao: 'pronto' | 'atencao' | 'risco';
}

interface RampaEstagio { dia_inicio: number; dia_fim: number | null; min: number; max: number; }

interface AquecimentoConfig {
  ativo: boolean;
  rampa: RampaEstagio[];
  pct_dm: number;
  delay_min_s: number;
  delay_max_s: number;
  msgs_por_sessao_min: number;
  msgs_por_sessao_max: number;
  safe_hour_start: number;
  safe_hour_end: number;
  max_errors_seq: number;
  saude_taxa_entrega_min: number;
  saude_max_desconexoes_7d: number;
  saude_dias_min_pronto: number;
}

interface Job {
  id: string;
  tipo: 'dm' | 'grupo';
  chip_origem_id: string;
  chip_destino_id: string | null;
  grupo_id: string | null;
  status: string;
  ack_status: string;
  error_msg: string | null;
  scheduled_at: string;
  done_at: string | null;
}

type MainTab = 'chips' | 'metricas' | 'grupos' | 'mensagens' | 'config' | 'monitor';

const CLASSIFICACAO_CFG: Record<SaudeRow['classificacao'], { label: string; badge: string; dot: string }> = {
  pronto:  { label: 'Pronto',  badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  atencao: { label: 'Atenção', badge: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-400' },
  risco:   { label: 'Risco',   badge: 'bg-red-50 text-red-700 border-red-200',             dot: 'bg-red-500' },
};

function fmtPct(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return `${Math.round(v * 100)}%`;
}

function fmtDatetime(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AquecimentoChips() {
  const [mainTab, setMainTab] = useState<MainTab>('chips');

  const TABS: { key: MainTab; label: string; icon: React.ElementType }[] = [
    { key: 'chips',     label: 'Chips',          icon: Users },
    { key: 'metricas',  label: 'Métricas',       icon: Gauge },
    { key: 'grupos',    label: 'Grupos',         icon: MessageSquare },
    { key: 'mensagens', label: 'Mensagens',      icon: ListChecks },
    { key: 'config',    label: 'Configurações',  icon: Settings2 },
    { key: 'monitor',   label: 'Monitor',        icon: RefreshCw },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50/40">
      <div className="bg-white border-b px-6 pt-4 flex-none">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-none">
            <Flame className="h-4.5 w-4.5 text-primary" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Aquecimento de Chips</h1>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 mb-3 w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setMainTab(t.key)}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                mainTab === t.key ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {mainTab === 'chips' && <ChipsTab />}
        {mainTab === 'metricas' && <MetricasTab />}
        {mainTab === 'grupos' && <GruposTab />}
        {mainTab === 'mensagens' && <MensagensTab />}
        {mainTab === 'config' && <ConfigTab />}
        {mainTab === 'monitor' && <MonitorTab />}
      </div>
    </div>
  );
}

// ── Chips Tab ─────────────────────────────────────────────────────────────────

function ChipsTab() {
  const [instances, setInstances] = useState<EvoInstance[]>([]);
  const [chips, setChips] = useState<AquecimentoChip[]>([]);
  const [loading, setLoading] = useState(true);
  const [numeroDrafts, setNumeroDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [instRes, chipsRes] = await Promise.all([
      supabase.from('evolution_config' as any).select('id, instance_name, ativo').order('prioridade', { ascending: true }),
      (supabase as any).from('aquecimento_chips').select('*'),
    ]);
    setInstances((instRes.data ?? []) as EvoInstance[]);
    setChips((chipsRes.data ?? []) as AquecimentoChip[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function adicionar(inst: EvoInstance) {
    const numero = (numeroDrafts[inst.id] ?? '').replace(/\D/g, '');
    if (!numero) { toast.error('Informe o número do WhatsApp desse chip'); return; }
    const { error } = await (supabase as any).from('aquecimento_chips').insert({
      evolution_config_id: inst.id, numero_whatsapp: numero,
    });
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(`${inst.instance_name} adicionado ao aquecimento`);
    load();
  }

  async function toggleAtivo(chip: AquecimentoChip) {
    await (supabase as any).from('aquecimento_chips').update({ ativo: !chip.ativo }).eq('id', chip.id);
    load();
  }

  async function pausarRetomar(chip: AquecimentoChip) {
    const novo = chip.status === 'pausado' ? 'aquecendo' : 'pausado';
    await (supabase as any).from('aquecimento_chips').update({ status: novo, consecutive_errors: 0 }).eq('id', chip.id);
    toast.success(novo === 'pausado' ? 'Chip pausado' : 'Chip retomado');
    load();
  }

  async function marcarPronto(chip: AquecimentoChip) {
    await (supabase as any).from('aquecimento_chips').update({ status: 'pronto' }).eq('id', chip.id);
    toast.success('Chip marcado como pronto para disparo');
    load();
  }

  if (loading) return <div className="flex items-center justify-center h-40"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const semCadastro = instances.filter(i => !chips.some(c => c.evolution_config_id === i.id));

  return (
    <div className="space-y-6">
      <div className="border rounded-lg overflow-hidden bg-white">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Instância</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Número</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Início</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Enviados hoje</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ativo</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {chips.map(chip => {
              const inst = instances.find(i => i.id === chip.evolution_config_id);
              return (
                <tr key={chip.id} className="border-b last:border-0 hover:bg-gray-50/60">
                  <td className="px-3 py-2 font-medium">{inst?.instance_name ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{chip.numero_whatsapp}</td>
                  <td className="px-3 py-2 text-muted-foreground">{chip.data_inicio}</td>
                  <td className="px-3 py-2">
                    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border',
                      chip.status === 'pronto' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : chip.status === 'pausado' ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200')}>
                      {chip.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{chip.enviados_hoje}</td>
                  <td className="px-3 py-2"><Switch checked={chip.ativo} onCheckedChange={() => toggleAtivo(chip)} /></td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => pausarRetomar(chip)}>
                        {chip.status === 'pausado' ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                        {chip.status === 'pausado' ? 'Retomar' : 'Pausar'}
                      </Button>
                      {chip.status !== 'pronto' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => marcarPronto(chip)}>
                          <CheckCircle2 className="h-3 w-3" /> Marcar pronto
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {chips.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-sm text-muted-foreground">Nenhum chip no aquecimento ainda — adicione abaixo</p>
          </div>
        )}
      </div>

      {semCadastro.length > 0 && (
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Adicionar chip ao aquecimento</p>
          <div className="space-y-2">
            {semCadastro.map(inst => (
              <div key={inst.id} className="flex items-center gap-2">
                <span className="text-sm font-medium w-40 truncate">{inst.instance_name}</span>
                <Input placeholder="Número WhatsApp (ex: 5511999999999)" className="h-8 text-sm max-w-xs"
                  value={numeroDrafts[inst.id] ?? ''}
                  onChange={e => setNumeroDrafts(prev => ({ ...prev, [inst.id]: e.target.value }))} />
                <Button size="sm" className="h-8 gap-1" onClick={() => adicionar(inst)}>
                  <Plus className="h-3.5 w-3.5" /> Adicionar
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Métricas Tab ──────────────────────────────────────────────────────────────

function MetricasTab() {
  const [rows, setRows] = useState<SaudeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from('aquecimento_saude_view').select('*');
    if (error) toast.error('Erro ao carregar métricas: ' + error.message);
    setRows((data ?? []) as SaudeRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center h-40"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
        <p className="text-xs text-muted-foreground">Saúde do chip — quando ele já pode ir pra disparo real</p>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={load}><RefreshCw className="h-3 w-3" /> Atualizar</Button>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Chip</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Dia</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Taxa entrega</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Taxa leitura</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Desconexões (7d)</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Conexão agora</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Classificação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const cfg = CLASSIFICACAO_CFG[r.classificacao];
            return (
              <tr key={r.chip_id} className="border-b last:border-0 hover:bg-gray-50/60">
                <td className="px-3 py-2 font-medium">{r.instance_name} <span className="text-muted-foreground font-mono">({r.numero_whatsapp})</span></td>
                <td className="px-3 py-2 text-muted-foreground">{r.dia_aquecimento}</td>
                <td className="px-3 py-2">{fmtPct(r.taxa_entrega)}</td>
                <td className="px-3 py-2">{fmtPct(r.taxa_leitura)}</td>
                <td className="px-3 py-2">{r.desconexoes_7d}</td>
                <td className="px-3 py-2">{r.estado_atual ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border', cfg.badge)}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} /> {cfg.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="flex flex-col items-center justify-center h-32 text-center">
          <p className="text-sm text-muted-foreground">Nenhum chip com dados de métricas ainda</p>
        </div>
      )}
    </div>
  );
}

// ── Grupos Tab ────────────────────────────────────────────────────────────────

function GruposTab() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [chips, setChips] = useState<AquecimentoChip[]>([]);
  const [instances, setInstances] = useState<EvoInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [nome, setNome] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [criando, setCriando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [gRes, cRes, iRes] = await Promise.all([
      (supabase as any).from('aquecimento_grupos').select('*'),
      (supabase as any).from('aquecimento_chips').select('*').eq('ativo', true),
      supabase.from('evolution_config' as any).select('id, instance_name, ativo'),
    ]);
    setGrupos((gRes.data ?? []) as Grupo[]);
    setChips((cRes.data ?? []) as AquecimentoChip[]);
    setInstances((iRes.data ?? []) as EvoInstance[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggle(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function criarGrupo() {
    const ids = [...selecionados];
    if (!nome.trim()) { toast.error('Informe um nome para o grupo'); return; }
    if (ids.length < 2) { toast.error('Selecione pelo menos 2 chips'); return; }

    setCriando(true);
    const [criador, ...resto] = ids.map(id => chips.find(c => c.id === id)!).filter(Boolean);
    const criadorInst = instances.find(i => i.id === criador.evolution_config_id);
    const participants = resto.map(c => c.numero_whatsapp);

    const { data, error } = await supabase.functions.invoke('evo-criar-grupo', {
      body: { subject: nome.trim(), instance_name: criadorInst?.instance_name, participants },
    });
    setCriando(false);

    if (error || (data as any)?.error) {
      toast.error('Erro ao criar grupo: ' + (error?.message ?? (data as any)?.error));
      return;
    }

    const jid = (data as any)?.jid;
    await (supabase as any).from('aquecimento_grupos').insert({
      nome: nome.trim(), grupo_jid: jid, evolution_config_id: criador.evolution_config_id, membros: ids,
    });
    toast.success('Grupo criado!');
    setShowForm(false); setNome(''); setSelecionados(new Set());
    load();
  }

  async function toggleAtivo(grupo: Grupo) {
    await (supabase as any).from('aquecimento_grupos').update({ ativo: !grupo.ativo }).eq('id', grupo.id);
    load();
  }

  if (loading) return <div className="flex items-center justify-center h-40"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setShowForm(v => !v)}>
          <Plus className="h-3.5 w-3.5" /> Criar grupo
        </Button>
      </div>

      {showForm && (
        <div className="border rounded-lg bg-white p-4 space-y-3">
          <Input placeholder="Nome do grupo" value={nome} onChange={e => setNome(e.target.value)} className="h-9 text-sm" />
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Selecione os chips que vão participar (o primeiro selecionado cria o grupo)</p>
            <div className="flex flex-wrap gap-1.5">
              {chips.map(c => {
                const inst = instances.find(i => i.id === c.evolution_config_id);
                const sel = selecionados.has(c.id);
                return (
                  <button key={c.id} onClick={() => toggle(c.id)}
                    className={cn('px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                      sel ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40')}>
                    {inst?.instance_name ?? c.numero_whatsapp}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={criarGrupo} disabled={criando} className="gap-1.5">
              {criando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Criar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden bg-white">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nome</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Membros</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ativo</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map(g => (
              <tr key={g.id} className="border-b last:border-0 hover:bg-gray-50/60">
                <td className="px-3 py-2 font-medium">{g.nome}</td>
                <td className="px-3 py-2 text-muted-foreground">{g.membros?.length ?? 0}</td>
                <td className="px-3 py-2"><Switch checked={g.ativo} onCheckedChange={() => toggleAtivo(g)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {grupos.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-sm text-muted-foreground">Nenhum grupo de aquecimento criado ainda</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Mensagens Tab ─────────────────────────────────────────────────────────────

function MensagensTab() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState<Mensagem['tipo']>('ambos');
  const [salvando, setSalvando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any).from('aquecimento_mensagens').select('*').order('created_at', { ascending: false });
    setMensagens((data ?? []) as Mensagem[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function adicionar() {
    if (!texto.trim()) { toast.error('Escreva o texto da mensagem'); return; }
    setSalvando(true);
    const { error } = await (supabase as any).from('aquecimento_mensagens').insert({ texto: texto.trim(), tipo });
    setSalvando(false);
    if (error) { toast.error('Erro: ' + error.message); return; }
    setTexto('');
    load();
  }

  async function toggleAtivo(m: Mensagem) {
    await (supabase as any).from('aquecimento_mensagens').update({ ativo: !m.ativo }).eq('id', m.id);
    load();
  }

  async function remover(m: Mensagem) {
    await (supabase as any).from('aquecimento_mensagens').delete().eq('id', m.id);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-lg bg-white p-4 space-y-3">
        <Textarea placeholder="Ex: Bom dia! Tudo certo por aí?" value={texto} onChange={e => setTexto(e.target.value)} rows={2} className="text-sm" />
        <div className="flex items-center gap-2">
          <Select value={tipo} onValueChange={v => setTipo(v as Mensagem['tipo'])}>
            <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ambos">DM + Grupo</SelectItem>
              <SelectItem value="dm">Só DM</SelectItem>
              <SelectItem value="grupo">Só Grupo</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={adicionar} disabled={salvando} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Adicionar frase
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden bg-white">
        {loading ? (
          <div className="flex items-center justify-center h-24"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Frase</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ativa</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {mensagens.map(m => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50/60">
                  <td className="px-3 py-2 max-w-md truncate">{m.texto}</td>
                  <td className="px-3 py-2 text-muted-foreground">{m.tipo}</td>
                  <td className="px-3 py-2"><Switch checked={m.ativo} onCheckedChange={() => toggleAtivo(m)} /></td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => remover(m)} className="p-1 rounded hover:bg-gray-100 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && mensagens.length === 0 && (
          <div className="flex flex-col items-center justify-center h-24 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma frase cadastrada ainda</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Configurações Tab ─────────────────────────────────────────────────────────

function ConfigTab() {
  const [cfg, setCfg] = useState<AquecimentoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any).from('aquecimento_config').select('*').eq('id', 'default').maybeSingle();
    setCfg(data as AquecimentoConfig);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function set<K extends keyof AquecimentoConfig>(key: K, value: AquecimentoConfig[K]) {
    setCfg(prev => prev ? { ...prev, [key]: value } : prev);
  }

  function setEstagio(idx: number, key: keyof RampaEstagio, value: number | null) {
    if (!cfg) return;
    const rampa = [...cfg.rampa];
    rampa[idx] = { ...rampa[idx], [key]: value };
    set('rampa', rampa);
  }

  function addEstagio() {
    if (!cfg) return;
    const last = cfg.rampa[cfg.rampa.length - 1];
    set('rampa', [...cfg.rampa, { dia_inicio: (last?.dia_fim ?? 0) + 1, dia_fim: null, min: 5, max: 10 }]);
  }

  function removeEstagio(idx: number) {
    if (!cfg) return;
    set('rampa', cfg.rampa.filter((_, i) => i !== idx));
  }

  async function salvar() {
    if (!cfg) return;
    setSaving(true);
    const { error } = await (supabase as any).from('aquecimento_config').update(cfg).eq('id', 'default');
    setSaving(false);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Configurações salvas');
  }

  if (loading || !cfg) return <div className="flex items-center justify-center h-40"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="border rounded-lg bg-white p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Aquecimento ativo</p>
          <p className="text-xs text-muted-foreground">Liga/desliga o planejamento diário e os envios</p>
        </div>
        <Switch checked={cfg.ativo} onCheckedChange={v => set('ativo', v)} />
      </div>

      <div className="border rounded-lg bg-white p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Curva de rampa (sessões de conversa/dia por estágio)</p>
        <p className="text-xs text-muted-foreground mb-3">Cada sessão é uma troca de várias mensagens seguidas (não 1 mensagem isolada) — o total de mensagens do dia é sessões × mensagens por sessão, configurado abaixo.</p>
        <div className="space-y-2">
          {cfg.rampa.map((e, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-14">Dia</span>
              <Input type="number" className="h-8 w-16 text-xs" value={e.dia_inicio}
                onChange={ev => setEstagio(idx, 'dia_inicio', Number(ev.target.value))} />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="number" className="h-8 w-16 text-xs" placeholder="∞" value={e.dia_fim ?? ''}
                onChange={ev => setEstagio(idx, 'dia_fim', ev.target.value ? Number(ev.target.value) : null)} />
              <span className="text-xs text-muted-foreground w-8">min</span>
              <Input type="number" className="h-8 w-16 text-xs" value={e.min}
                onChange={ev => setEstagio(idx, 'min', Number(ev.target.value))} />
              <span className="text-xs text-muted-foreground w-8">max</span>
              <Input type="number" className="h-8 w-16 text-xs" value={e.max}
                onChange={ev => setEstagio(idx, 'max', Number(ev.target.value))} />
              <button onClick={() => removeEstagio(idx)} className="p-1 rounded hover:bg-gray-100 text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" className="mt-2 gap-1.5 h-7 text-xs" onClick={addEstagio}>
          <Plus className="h-3 w-3" /> Novo estágio
        </Button>
      </div>

      <div className="border rounded-lg bg-white p-4 grid grid-cols-2 gap-3">
        <ConfigNumberField label="% das sessões em DM (resto vai pra grupo)" value={cfg.pct_dm} onChange={v => set('pct_dm', v)} />
        <ConfigNumberField label="Erros seguidos até pausar chip" value={cfg.max_errors_seq} onChange={v => set('max_errors_seq', v)} />
        <ConfigNumberField label="Mensagens por sessão — mínimo" value={cfg.msgs_por_sessao_min} onChange={v => set('msgs_por_sessao_min', v)} />
        <ConfigNumberField label="Mensagens por sessão — máximo" value={cfg.msgs_por_sessao_max} onChange={v => set('msgs_por_sessao_max', v)} />
        <ConfigNumberField label="Intervalo entre mensagens da conversa — mín (s)" value={cfg.delay_min_s} onChange={v => set('delay_min_s', v)} />
        <ConfigNumberField label="Intervalo entre mensagens da conversa — máx (s)" value={cfg.delay_max_s} onChange={v => set('delay_max_s', v)} />
        <ConfigNumberField label="Horário seguro — início" value={cfg.safe_hour_start} onChange={v => set('safe_hour_start', v)} />
        <ConfigNumberField label="Horário seguro — fim" value={cfg.safe_hour_end} onChange={v => set('safe_hour_end', v)} />
      </div>

      <div className="border rounded-lg bg-white p-4 grid grid-cols-2 gap-3">
        <p className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Limiares de saúde</p>
        <ConfigNumberField label="Taxa de entrega mínima (0–1)" value={cfg.saude_taxa_entrega_min} step="0.01" onChange={v => set('saude_taxa_entrega_min', v)} />
        <ConfigNumberField label="Máx. desconexões em 7 dias" value={cfg.saude_max_desconexoes_7d} onChange={v => set('saude_max_desconexoes_7d', v)} />
        <ConfigNumberField label="Dias mínimos p/ considerar pronto" value={cfg.saude_dias_min_pronto} onChange={v => set('saude_dias_min_pronto', v)} />
      </div>

      <Button onClick={salvar} disabled={saving} className="gap-1.5">
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar configurações
      </Button>
    </div>
  );
}

function ConfigNumberField({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: string }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <Input type="number" step={step} className="h-8 text-sm" value={value} onChange={e => onChange(Number(e.target.value))} />
    </div>
  );
}

// ── Monitor Tab ───────────────────────────────────────────────────────────────

function MonitorTab() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [rodando, setRodando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any).from('aquecimento_jobs').select('*').order('scheduled_at', { ascending: false }).limit(100);
    setJobs((data ?? []) as Job[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function rodarAgora() {
    setRodando(true);
    try {
      // Sequencial de propósito: o worker precisa que o planejamento já tenha
      // criado os jobs do dia antes de tentar enviar algo.
      const planejar = await supabase.functions.invoke('aquecimento-planejar-dia', { body: {} });
      const erroPlanejar = planejar.error || (planejar.data as any)?.error;
      if (erroPlanejar) throw new Error(typeof erroPlanejar === 'string' ? erroPlanejar : erroPlanejar.message ?? JSON.stringify(erroPlanejar));

      const worker = await supabase.functions.invoke('aquecimento-worker', { body: {} });
      const erroWorker = worker.error || (worker.data as any)?.error;
      if (erroWorker) throw new Error(typeof erroWorker === 'string' ? erroWorker : erroWorker.message ?? JSON.stringify(erroWorker));

      toast.success('Planejamento e envio disparados manualmente');
    } catch (e) {
      toast.error('Erro ao rodar: ' + (e as Error).message);
    }
    setRodando(false);
    setTimeout(load, 2000);
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const doDia = jobs.filter(j => j.scheduled_at.slice(0, 10) === hoje);
  const enviados = doDia.filter(j => j.status === 'enviado').length;
  const erros = doDia.filter(j => j.status === 'erro').length;
  const pendentes = doDia.filter(j => j.status === 'pendente').length;
  const proximo = [...jobs].filter(j => j.status === 'pendente').sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          {[
            { label: 'Pendentes', count: pendentes, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Enviados',  count: enviados,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Erros',     count: erros,     color: 'text-red-600', bg: 'bg-red-50' },
          ].map(s => (
            <div key={s.label} className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium', s.bg, s.color)}>
              {s.count} {s.label}
            </div>
          ))}
          {proximo && (
            <span className="text-xs text-muted-foreground">Próximo: {proximo.tipo} às {fmtDatetime(proximo.scheduled_at)}</span>
          )}
        </div>
        <Button size="sm" onClick={rodarAgora} disabled={rodando} className="gap-1.5">
          {rodando ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Rodar agora
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden bg-white">
        {loading ? (
          <div className="flex items-center justify-center h-32"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Agendado</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">ACK</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Erro</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(j => (
                <tr key={j.id} className="border-b last:border-0 hover:bg-gray-50/60">
                  <td className="px-3 py-2">{j.tipo}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDatetime(j.scheduled_at)}</td>
                  <td className="px-3 py-2">
                    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border',
                      j.status === 'enviado' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : j.status === 'erro' ? 'bg-red-50 text-red-700 border-red-200'
                        : j.status === 'enviando' ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200')}>
                      {j.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{j.ack_status}</td>
                  <td className="px-3 py-2 text-red-600 max-w-xs truncate">{j.error_msg ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && jobs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-sm text-muted-foreground">Nenhum job de aquecimento ainda</p>
          </div>
        )}
      </div>
    </div>
  );
}
