import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Calendar, ChevronRight, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type NPAStatus = 'em_andamento' | 'finalizado';

interface NPAEvento {
  id: string;
  nome: string;
  data_evento?: string;
  status: NPAStatus;
  ativo: boolean;
  created_at: string;
}

interface ResumoLead {
  npa_evento_id: string;
  ingresso_pago: boolean;
  esteve_no_evento: boolean;
  comprou_material: boolean;
  matriculado: boolean;
}

interface EventoCalendario {
  id: string;
  titulo: string;
  descricao?: string;
  data_inicio: string;
  data_fim?: string;
  cor: string;
}

// ─── FunilConsolidadoNPA ────────────────────────────────────────────────────
// "IDM Pelo Brasil" — soma o funil de compras de todos os eventos NPA juntos.

function FunilConsolidadoNPA({ eventos, resumoLeads, loading }: {
  eventos: NPAEvento[];
  resumoLeads: ResumoLead[];
  loading: boolean;
}) {
  const nomePorEvento = new Map(eventos.map((e) => [e.id, e.nome]));

  const porEvento = new Map<string, { ingresso: number; foi: number; material: number; mentoria: number }>();
  for (const l of resumoLeads) {
    const acc = porEvento.get(l.npa_evento_id) ?? { ingresso: 0, foi: 0, material: 0, mentoria: 0 };
    if (l.ingresso_pago) acc.ingresso++;
    if (l.esteve_no_evento) acc.foi++;
    if (l.esteve_no_evento && l.comprou_material && !l.matriculado) acc.material++;
    if (l.esteve_no_evento && l.matriculado) acc.mentoria++;
    porEvento.set(l.npa_evento_id, acc);
  }

  const totais = [...porEvento.values()].reduce(
    (acc, v) => ({
      ingresso: acc.ingresso + v.ingresso,
      foi: acc.foi + v.foi,
      material: acc.material + v.material,
      mentoria: acc.mentoria + v.mentoria,
    }),
    { ingresso: 0, foi: 0, material: 0, mentoria: 0 },
  );

  return (
    <div className="rounded-2xl border border-gray-100 p-5 shadow-sm bg-white">
      <div className="mb-4">
        <h1 className="text-xl font-black text-gray-900">IDM Pelo Brasil</h1>
        <p className="text-xs text-gray-400 mt-0.5">Visão consolidada de todos os eventos, Brasil todo</p>
      </div>

      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-300" /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl p-3 text-center bg-gray-50 border border-gray-100">
            <p className="text-[11px] font-medium text-gray-500">Ingressos vendidos</p>
            <p className="text-2xl font-black mt-1 text-gray-700">{totais.ingresso}</p>
          </div>
          <div className="rounded-xl p-3 text-center bg-gray-50 border border-gray-100">
            <p className="text-[11px] font-medium text-gray-500">Foram ao evento</p>
            <p className="text-2xl font-black mt-1 text-gray-700">{totais.foi}</p>
          </div>
          <div className="rounded-xl p-3 text-center bg-pink-50 border border-pink-100">
            <p className="text-[11px] font-medium text-pink-700">Compraram material</p>
            <p className="text-2xl font-black mt-1 text-pink-700">{totais.material}</p>
          </div>
          <div className="rounded-xl p-3 text-center bg-amber-50 border border-amber-100">
            <p className="text-[11px] font-medium text-amber-700">Compraram mentoria</p>
            <p className="text-2xl font-black mt-1 text-amber-700">{totais.mentoria}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── EventoCard ─────────────────────────────────────────────────────────────

function EventoCard({ evento, onOpen }: { evento: NPAEvento; onOpen: () => void }) {
  const dataLabel = evento.data_evento
    ? format(new Date(evento.data_evento), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    : null;

  return (
    <button
      onClick={onOpen}
      className="group w-full text-left rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md hover:border-gray-200 transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-sm text-gray-900 truncate">{evento.nome}</p>
          {dataLabel && <p className="text-xs text-gray-400 mt-0.5">{dataLabel}</p>}
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
            evento.ativo
              ? 'bg-green-50 text-green-700'
              : evento.status === 'finalizado'
              ? 'bg-gray-100 text-gray-500'
              : 'bg-amber-50 text-amber-700'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${evento.ativo ? 'bg-green-500' : 'bg-gray-300'}`} />
          {evento.ativo ? 'Ativo' : evento.status === 'finalizado' ? 'Finalizado' : 'Inativo'}
        </span>
      </div>
      <div className="flex items-center justify-end mt-3 text-xs font-medium text-gray-400 group-hover:text-gray-700 transition-colors">
        Ver evento
        <ArrowRight className="h-3.5 w-3.5 ml-1 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </button>
  );
}

// ─── NPAEventos (Visão Geral) ───────────────────────────────────────────────

export function NPAEventos({ onOpenEvento }: { onOpenEvento?: (id: string) => void }) {
  const { users } = useAuth();
  const [eventos, setEventos] = useState<NPAEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [resumoLeads, setResumoLeads] = useState<ResumoLead[]>([]);
  const [loadingResumo, setLoadingResumo] = useState(true);

  const [isCreatingEvento, setIsCreatingEvento] = useState(false);
  const [salvandoEvento, setSalvandoEvento] = useState(false);
  const [newEventoForm, setNewEventoForm] = useState({ nome: '', data_evento: '' });

  const [eventosCalendario, setEventosCalendario] = useState<EventoCalendario[]>([]);
  const [loadingCalendario, setLoadingCalendario] = useState(false);
  const [calendarioSearch, setCalendarioSearch] = useState('');
  const [eventoCalSelecionado, setEventoCalSelecionado] = useState<EventoCalendario | null>(null);
  const [modoCreate, setModoCreate] = useState<'vincular' | 'novo'>('vincular');

  void users;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('npa_eventos')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setEventos(data as NPAEvento[]);
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoadingResumo(true);
      const { data } = await supabase
        .from('npa_evento_leads')
        .select('npa_evento_id, ingresso_pago, esteve_no_evento, comprou_material, matriculado');
      if (data) setResumoLeads(data as ResumoLead[]);
      setLoadingResumo(false);
    };
    load();
  }, []);

  const abrirDialogCriar = async () => {
    setModoCreate('vincular');
    setEventoCalSelecionado(null);
    setCalendarioSearch('');
    setNewEventoForm({ nome: '', data_evento: '' });
    setIsCreatingEvento(true);
    setLoadingCalendario(true);
    const { data } = await supabase
      .from('eventos_calendario')
      .select('id, titulo, descricao, data_inicio, data_fim, cor')
      .order('data_inicio', { ascending: false })
      .limit(100);
    setEventosCalendario((data || []) as EventoCalendario[]);
    setLoadingCalendario(false);
  };

  const selecionarEventoCalendario = (ev: EventoCalendario) => {
    setEventoCalSelecionado(ev);
    setNewEventoForm({
      nome: ev.titulo,
      data_evento: ev.data_inicio ? ev.data_inicio.slice(0, 10) : '',
    });
  };

  const handleCreateEvento = async () => {
    if (!newEventoForm.nome) return;
    setSalvandoEvento(true);
    const { data } = await supabase.from('npa_eventos').insert({
      nome: newEventoForm.nome,
      data_evento: newEventoForm.data_evento || null,
      status: 'em_andamento',
      ativo: false,
      created_at: new Date().toISOString(),
    }).select().single();

    if (data) {
      setEventos(prev => [data as NPAEvento, ...prev]);
      setNewEventoForm({ nome: '', data_evento: '' });
      setIsCreatingEvento(false);
      onOpenEvento?.(data.id);
    }
    setSalvandoEvento(false);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 pb-20 lg:pb-6 overflow-y-auto h-full bg-gray-50/40">
      <FunilConsolidadoNPA eventos={eventos} resumoLeads={resumoLeads} loading={loadingResumo} />

      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-gray-800">Eventos</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {eventos.length} evento{eventos.length !== 1 ? 's' : ''} · {eventos.filter(e => e.ativo).length} ativo{eventos.filter(e => e.ativo).length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button size="sm" className="gap-1.5 bg-gray-900 hover:bg-gray-700" onClick={abrirDialogCriar}>
            <Plus className="h-4 w-4" />
            Novo Evento
          </Button>
        </div>

        {eventos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center bg-white">
            <p className="text-sm text-gray-400">Nenhum evento NPA ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {eventos.map(evento => (
              <EventoCard key={evento.id} evento={evento} onOpen={() => onOpenEvento?.(evento.id)} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={isCreatingEvento} onOpenChange={setIsCreatingEvento}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Evento NPA</DialogTitle>
            <DialogDescription>Vincule a um evento do calendário ou crie do zero</DialogDescription>
          </DialogHeader>

          <div className="flex gap-1 p-1 rounded-lg border border-border bg-muted/30">
            <button
              onClick={() => setModoCreate('vincular')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded text-sm font-medium transition-all ${modoCreate === 'vincular' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Calendar className="h-3.5 w-3.5" />
              Selecionar do Calendário
            </button>
            <button
              onClick={() => { setModoCreate('novo'); setEventoCalSelecionado(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded text-sm font-medium transition-all ${modoCreate === 'novo' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Plus className="h-3.5 w-3.5" />
              Criar Novo
            </button>
          </div>

          {modoCreate === 'vincular' && (
            <div className="space-y-3">
              <Input
                placeholder="Buscar evento do calendário..."
                value={calendarioSearch}
                onChange={e => setCalendarioSearch(e.target.value)}
                className="h-9"
              />
              {loadingCalendario ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {eventosCalendario
                    .filter(ev => !calendarioSearch || ev.titulo.toLowerCase().includes(calendarioSearch.toLowerCase()))
                    .map(ev => {
                      const sel = eventoCalSelecionado?.id === ev.id;
                      const dataLabel = ev.data_inicio
                        ? format(new Date(ev.data_inicio), "dd/MM/yyyy", { locale: ptBR })
                        : '';
                      return (
                        <button
                          key={ev.id}
                          onClick={() => selecionarEventoCalendario(ev)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                            sel ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/40 hover:bg-muted/30'
                          }`}
                        >
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ background: ev.cor || '#6b7280' }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{ev.titulo}</p>
                            {dataLabel && <p className="text-xs text-muted-foreground">{dataLabel}</p>}
                          </div>
                          {sel && <ChevronRight className="h-4 w-4 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  {!loadingCalendario && eventosCalendario.filter(ev => !calendarioSearch || ev.titulo.toLowerCase().includes(calendarioSearch.toLowerCase())).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum evento encontrado no calendário</p>
                  )}
                </div>
              )}

              {eventoCalSelecionado && (
                <div className="border border-primary/30 rounded-lg p-3 space-y-2 bg-primary/5">
                  <p className="text-xs font-semibold text-primary">Evento selecionado — confirme ou ajuste</p>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Nome do evento NPA</label>
                    <Input
                      value={newEventoForm.nome}
                      onChange={e => setNewEventoForm(f => ({ ...f, nome: e.target.value }))}
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Data do evento</label>
                    <Input
                      type="date"
                      value={newEventoForm.data_evento}
                      onChange={e => setNewEventoForm(f => ({ ...f, data_evento: e.target.value }))}
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <Button onClick={handleCreateEvento} disabled={salvandoEvento || !newEventoForm.nome} className="w-full h-9">
                    {salvandoEvento ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar Evento NPA'}
                  </Button>
                </div>
              )}

              {!eventoCalSelecionado && !loadingCalendario && (
                <p className="text-xs text-muted-foreground text-center">← Selecione um evento acima para pré-preencher os dados</p>
              )}
            </div>
          )}

          {modoCreate === 'novo' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground font-medium">Nome do evento</label>
                <Input
                  placeholder="Ex: Semana do Despertar #04"
                  value={newEventoForm.nome}
                  onChange={e => setNewEventoForm(f => ({ ...f, nome: e.target.value }))}
                  className="mt-1 h-9"
                  onKeyDown={e => e.key === 'Enter' && handleCreateEvento()}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Data do evento</label>
                <Input
                  type="date"
                  value={newEventoForm.data_evento}
                  onChange={e => setNewEventoForm(f => ({ ...f, data_evento: e.target.value }))}
                  className="mt-1 h-9"
                />
              </div>
              <Button onClick={handleCreateEvento} disabled={salvandoEvento || !newEventoForm.nome} className="w-full h-9">
                {salvandoEvento ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar Evento'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
