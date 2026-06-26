import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Settings, RefreshCw, MapPin, Phone, Mail, Calendar, CheckCircle2, Clock, Send, User } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

type Lead = {
  id: string;
  nome: string | null;
  email: string | null;
  whatsapp: string | null;
  produto: string | null;
  data_nascimento: string | null;
  alma: number | null;
  imagem: number | null;
  expressao: number | null;
  talento: number | null;
  psiquico: number | null;
  destino: number | null;
  ano_pessoal: number | null;
  status: string | null;
  mapa_enviado: boolean | null;
  created_at: string | null;
  comprou_at: string | null;
  pago_at: string | null;
  utm_campaign: string | null;
};

type Config = {
  id: string;
  mensagem_pix_template: string;
  mensagem_compra_template: string;
  mensagem_envio_mapa: string;
};

// ── Column config ────────────────────────────────────────────────────────────

const COLUMNS: { key: string; label: string; color: string; bg: string }[] = [
  { key: 'lead',                  label: 'Leads',                  color: 'text-slate-600',   bg: 'bg-slate-50 border-slate-200' },
  { key: 'aguardando_pagamento',  label: 'Aguardando Pagamento',   color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200' },
  { key: 'pago',                  label: 'Pago — Mapa Pendente',   color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  { key: 'mapa_enviado',          label: 'Mapa Enviado',           color: 'text-violet-600',  bg: 'bg-violet-50 border-violet-200' },
];

function getColumn(lead: Lead): string {
  if (lead.mapa_enviado) return 'mapa_enviado';
  if (lead.pago_at) return 'pago';
  if (lead.status === 'aguardando_pagamento' || lead.comprou_at) return 'aguardando_pagamento';
  return 'lead';
}

// ── Number badge ─────────────────────────────────────────────────────────────

const NUM_COLORS: Record<string, string> = {
  alma:       'bg-rose-100 text-rose-700',
  imagem:     'bg-orange-100 text-orange-700',
  expressao:  'bg-amber-100 text-amber-700',
  talento:    'bg-lime-100 text-lime-700',
  psiquico:   'bg-cyan-100 text-cyan-700',
  destino:    'bg-blue-100 text-blue-700',
  ano_pessoal:'bg-violet-100 text-violet-700',
};

const NUM_LABELS: Record<string, string> = {
  alma: 'Alma', imagem: 'Imagem', expressao: 'Expressão',
  talento: 'Talento', psiquico: 'Psíquico', destino: 'Destino', ano_pessoal: 'Ano',
};

function NumBadge({ k, v }: { k: string; v: number | null }) {
  if (v == null) return null;
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold', NUM_COLORS[k])}>
      {NUM_LABELS[k]} {v}
    </span>
  );
}

// ── Lead card ────────────────────────────────────────────────────────────────

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const nums: (keyof Lead)[] = ['alma', 'imagem', 'expressao', 'talento', 'psiquico', 'destino', 'ano_pessoal'];
  const hasNumbers = nums.some(k => lead[k] != null);

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-border shadow-sm p-3 cursor-pointer hover:shadow-md hover:border-violet-300 transition-all space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
            <User className="w-3.5 h-3.5 text-violet-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{lead.nome || 'Sem nome'}</p>
            {lead.produto && (
              <p className="text-[10px] text-muted-foreground truncate">{lead.produto}</p>
            )}
          </div>
        </div>
        {lead.mapa_enviado && (
          <CheckCircle2 className="w-4 h-4 text-violet-500 shrink-0" />
        )}
      </div>

      {lead.data_nascimento && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Calendar className="w-3 h-3" />
          {lead.data_nascimento}
        </div>
      )}

      {hasNumbers && (
        <div className="flex flex-wrap gap-1">
          {nums.map(k => (
            <NumBadge key={k as string} k={k as string} v={lead[k] as number | null} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-0.5">
          <Clock className="w-2.5 h-2.5" />
          {lead.created_at ? new Date(lead.created_at).toLocaleDateString('pt-BR') : '—'}
        </span>
        {lead.pago_at && (
          <span className="text-emerald-600 font-medium flex items-center gap-0.5">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Pago {new Date(lead.pago_at).toLocaleDateString('pt-BR')}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Lead detail modal ─────────────────────────────────────────────────────────

function LeadModal({
  lead,
  onClose,
  onUpdate,
}: {
  lead: Lead | null;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Lead>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [obs, setObs] = useState('');

  if (!lead) return null;

  const nums: (keyof Lead)[] = ['alma', 'imagem', 'expressao', 'talento', 'psiquico', 'destino', 'ano_pessoal'];

  const handleMarkMapaEnviado = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('seu_numerologo_leads')
      .update({ mapa_enviado: true })
      .eq('id', lead.id);
    setSaving(false);
    if (error) { toast.error('Erro ao atualizar'); return; }
    toast.success('Mapa marcado como enviado!');
    onUpdate(lead.id, { mapa_enviado: true });
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-violet-500" />
            {lead.nome || 'Lead'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {lead.email && (
              <div className="flex items-center gap-1.5 col-span-2 text-muted-foreground">
                <Mail className="w-3.5 h-3.5" />
                {lead.email}
              </div>
            )}
            {lead.whatsapp && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Phone className="w-3.5 h-3.5" />
                {lead.whatsapp}
              </div>
            )}
            {lead.data_nascimento && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                {lead.data_nascimento}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">7 Números</p>
            <div className="flex flex-wrap gap-1.5">
              {nums.map(k => (
                <NumBadge key={k as string} k={k as string} v={lead[k] as number | null} />
              ))}
              {nums.every(k => lead[k] == null) && (
                <span className="text-muted-foreground text-xs">Não calculados ainda</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-muted/40 rounded p-2">
              <p className="text-muted-foreground mb-0.5">Criado em</p>
              <p className="font-medium">{lead.created_at ? new Date(lead.created_at).toLocaleDateString('pt-BR') : '—'}</p>
            </div>
            <div className="bg-muted/40 rounded p-2">
              <p className="text-muted-foreground mb-0.5">Comprou em</p>
              <p className="font-medium">{lead.comprou_at ? new Date(lead.comprou_at).toLocaleDateString('pt-BR') : '—'}</p>
            </div>
            <div className="bg-muted/40 rounded p-2">
              <p className="text-muted-foreground mb-0.5">Pago em</p>
              <p className="font-medium">{lead.pago_at ? new Date(lead.pago_at).toLocaleDateString('pt-BR') : '—'}</p>
            </div>
          </div>

          {(lead.utm_campaign || lead.produto) && (
            <div className="flex flex-wrap gap-2 text-xs">
              {lead.produto && <Badge variant="outline">{lead.produto}</Badge>}
              {lead.utm_campaign && <Badge variant="secondary">UTM: {lead.utm_campaign}</Badge>}
            </div>
          )}

          {!lead.mapa_enviado && lead.pago_at && (
            <Button onClick={handleMarkMapaEnviado} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Marcar Mapa como Enviado
            </Button>
          )}
          {lead.mapa_enviado && (
            <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Mapa já enviado
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Config modal ─────────────────────────────────────────────────────────────

function ConfigModal({
  config,
  onClose,
  onSaved,
}: {
  config: Config | null;
  onClose: () => void;
  onSaved: (c: Config) => void;
}) {
  const [form, setForm] = useState<Config>(
    config ?? { id: '', mensagem_pix_template: '', mensagem_compra_template: '', mensagem_envio_mapa: '' }
  );
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'pix' | 'compra' | 'mapa'>('compra');

  const handleSave = async () => {
    setSaving(true);
    let error;
    if (form.id) {
      ({ error } = await supabase
        .from('seu_numerologo_config')
        .update({
          mensagem_pix_template: form.mensagem_pix_template,
          mensagem_compra_template: form.mensagem_compra_template,
          mensagem_envio_mapa: form.mensagem_envio_mapa,
          updated_at: new Date().toISOString(),
        })
        .eq('id', form.id));
    } else {
      const { data, error: e } = await supabase
        .from('seu_numerologo_config')
        .insert({
          mensagem_pix_template: form.mensagem_pix_template,
          mensagem_compra_template: form.mensagem_compra_template,
          mensagem_envio_mapa: form.mensagem_envio_mapa,
        })
        .select()
        .single();
      error = e;
      if (data) setForm(data as Config);
    }
    setSaving(false);
    if (error) { toast.error('Erro ao salvar'); return; }
    toast.success('Configuração salva!');
    onSaved(form);
    onClose();
  };

  const tabs = [
    { key: 'pix' as const, label: 'PIX Gerado', field: 'mensagem_pix_template' as keyof Config,
      hint: 'Enviada quando o PIX é gerado. Variáveis: {{nome}}' },
    { key: 'compra' as const, label: 'Compra Confirmada', field: 'mensagem_compra_template' as keyof Config,
      hint: 'Enviada quando o pagamento é confirmado. Variáveis: {{nome}}' },
    { key: 'mapa' as const, label: 'Envio do Mapa', field: 'mensagem_envio_mapa' as keyof Config,
      hint: 'Template para envio do mapa. Variáveis: {{nome}}, {{alma}}, {{imagem}}, {{expressao}}, {{talento}}, {{psiquico}}, {{destino}}, {{ano_pessoal}}' },
  ];

  const activeTabData = tabs.find(t => t.key === activeTab)!;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-violet-500" />
            Configurar Mensagens — Mapa 7 Esperas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-1 border-b">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  'px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                  activeTab === t.key
                    ? 'border-violet-500 text-violet-600'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{activeTabData.hint}</p>
            <Textarea
              value={form[activeTabData.field] as string}
              onChange={e => setForm(f => ({ ...f, [activeTabData.field]: e.target.value }))}
              rows={10}
              className="font-mono text-sm resize-none"
              placeholder="Digite a mensagem..."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Kanban ───────────────────────────────────────────────────────────────

export function SeuNumerologoKanban() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: leadsData }, { data: configData }] = await Promise.all([
      supabase
        .from('seu_numerologo_leads')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('seu_numerologo_config')
        .select('*')
        .limit(1)
        .maybeSingle(),
    ]);
    setLeads((leadsData ?? []) as Lead[]);
    setConfig(configData as Config | null);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateLead = (id: string, patch: Partial<Lead>) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  };

  const filtered = leads.filter(l =>
    !search ||
    (l.nome ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (l.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (l.whatsapp ?? '').includes(search)
  );

  const byColumn = Object.fromEntries(
    COLUMNS.map(col => [col.key, filtered.filter(l => getColumn(l) === col.key)])
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <MapPin className="w-5 h-5 text-violet-500" />
            Mapa 7 Esperas
          </h1>
          <p className="text-xs text-muted-foreground">{leads.length} comprador{leads.length !== 1 ? 'es' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-48 h-8 text-sm"
          />
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)} className="gap-1.5">
            <Settings className="w-3.5 h-3.5" />
            Mensagens
          </Button>
        </div>
      </div>

      {/* Board */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-3 p-4 h-full min-w-max">
            {COLUMNS.map(col => {
              const items = byColumn[col.key] ?? [];
              return (
                <div key={col.key} className="flex flex-col w-72 shrink-0">
                  {/* Column header */}
                  <div className={cn('flex items-center justify-between px-3 py-2 rounded-t-lg border border-b-0', col.bg)}>
                    <span className={cn('text-sm font-semibold', col.color)}>{col.label}</span>
                    <span className={cn('text-xs font-bold rounded-full px-2 py-0.5', col.bg, col.color, 'border', col.bg.replace('bg-', 'border-'))}>
                      {items.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className={cn('flex-1 overflow-y-auto rounded-b-lg border p-2 space-y-2 min-h-[300px]', col.bg)}>
                    {items.length === 0 ? (
                      <div className="flex items-center justify-center h-24 text-muted-foreground/50 text-xs">
                        Nenhum comprador
                      </div>
                    ) : (
                      items.map(lead => (
                        <LeadCard key={lead.id} lead={lead} onClick={() => setSelectedLead(lead)} />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modals */}
      <LeadModal
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onUpdate={updateLead}
      />

      {configOpen && (
        <ConfigModal
          config={config}
          onClose={() => setConfigOpen(false)}
          onSaved={setConfig}
        />
      )}
    </div>
  );
}

export default SeuNumerologoKanban;
