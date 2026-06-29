import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format, parseISO, isSameDay, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Calendar, Rocket, BarChart3, Zap, Trash2, Pencil, X, Check, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { useCalendario } from './useCalendario';

interface Tarefa {
  id: string;
  titulo: string;
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  prazo?: string;
}
interface Lancamento { id: string; nome: string; data_inicio?: string; data_fim?: string; }
interface NPAEvento { id: string; nome: string; data_inicio?: string; data_fim?: string; }
interface EventoCalendario { id: string; titulo: string; descricao?: string; data_inicio: string; data_fim?: string; cor: string; }
interface CalendarioGeralViewProps {
  tarefas: Tarefa[];
  lancamentos: Lancamento[];
  npaEventos: NPAEvento[];
  eventosCalendario: EventoCalendario[];
  user: any;
  getPriorityHexColor: (prioridade: string) => string;
  onOpenTarefaDetail: (tarefa: Tarefa) => void;
  onLoadData: () => void;
}
interface EventoDia { id: string; titulo: string; tipo: 'tarefa' | 'lancamento' | 'npa' | 'evento'; cor: string; data: Date; dados: any; }

const CORES_PRESET = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1','#14b8a6','#e11d48'];
const TIPO_LABEL: Record<string, string> = { tarefa: 'Tarefa', lancamento: 'Lançamento', npa: 'NPA', evento: 'Evento' };

export function CalendarioGeralView({ tarefas, lancamentos, npaEventos, eventosCalendario, user, getPriorityHexColor, onOpenTarefaDetail, onLoadData }: CalendarioGeralViewProps) {
  const { currentDate, currentMonth, currentYear, getWeeksInMonth, mesAnterior, mesProximo, irParaHoje } = useCalendario();

  const [showCreateEvento, setShowCreateEvento] = useState(false);
  const [criando, setCriando] = useState(false);
  const [eventoForm, setEventoForm] = useState({ titulo: '', descricao: '', data_inicio: '', data_fim: '', cor: '#3b82f6' });
  const [diaClickadoKey, setDiaClickadoKey] = useState<string | null>(null);

  const [selectedEvento, setSelectedEvento] = useState<EventoDia | null>(null);
  const [showEventoModal, setShowEventoModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [salvando, setSalvando] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [deletando, setDeletando] = useState(false);

  const weeks = getWeeksInMonth(currentYear, currentMonth);

  const getEventosPorDia = useMemo(() => {
    const distribuirEventosDias = (eventos: any[]) => {
      const map: Record<string, any[]> = {};
      eventos.forEach(ev => {
        const inicio = new Date(ev.start || ev.data_inicio);
        const fim = new Date(ev.end || ev.data_fim || ev.data_inicio);
        const cur = new Date(inicio); cur.setHours(0,0,0,0);
        const end = new Date(fim); end.setHours(0,0,0,0);
        while (cur <= end) {
          const k = format(cur, 'yyyy-MM-dd');
          if (!map[k]) map[k] = [];
          map[k].push(ev);
          cur.setDate(cur.getDate() + 1);
        }
      });
      return map;
    };

    const epd: { [key: string]: EventoDia[] } = {};

    (tarefas ?? []).forEach(t => {
      if (!t.prazo) return;
      const data = parseISO(t.prazo);
      const key = format(data, 'yyyy-MM-dd');
      if (!epd[key]) epd[key] = [];
      epd[key].push({ id: `tarefa-${t.id}`, titulo: t.titulo, tipo: 'tarefa', cor: getPriorityHexColor(t.prioridade), data, dados: t });
    });

    (lancamentos ?? []).forEach(l => {
      if (!l.data_inicio) return;
      const data = parseISO(l.data_inicio);
      const key = format(data, 'yyyy-MM-dd');
      if (!epd[key]) epd[key] = [];
      epd[key].push({ id: `lancamento-${l.id}`, titulo: l.nome, tipo: 'lancamento', cor: '#EA580C', data, dados: l });
    });

    (npaEventos ?? []).forEach(n => {
      if (!n.data_inicio) return;
      const data = parseISO(n.data_inicio);
      const key = format(data, 'yyyy-MM-dd');
      if (!epd[key]) epd[key] = [];
      epd[key].push({ id: `npa-${n.id}`, titulo: n.nome, tipo: 'npa', cor: '#7C3AED', data, dados: n });
    });

    const dist = distribuirEventosDias(eventosCalendario ?? []);
    Object.entries(dist).forEach(([key, evs]) => {
      if (!epd[key]) epd[key] = [];
      evs.forEach(ev => epd[key].push({ id: `evento-${ev.id}`, titulo: ev.titulo, tipo: 'evento', cor: ev.cor, data: parseISO(ev.data_inicio), dados: ev }));
    });

    return epd;
  }, [tarefas, lancamentos, npaEventos, eventosCalendario, getPriorityHexColor]);

  const getTipoIcon = (tipo: string, cls = 'h-3 w-3') => {
    const icons: Record<string, any> = { tarefa: Calendar, lancamento: Rocket, npa: BarChart3, evento: Zap };
    const Icon = icons[tipo] || Calendar;
    return <Icon className={cls} />;
  };

  const handleEventoClick = (ev: EventoDia) => {
    if (ev.tipo === 'tarefa') { onOpenTarefaDetail(ev.dados); return; }
    setSelectedEvento(ev);
    setEditMode(false);
    setShowConfirmDelete(false);
    setEditForm({
      titulo: ev.dados.titulo || ev.titulo,
      descricao: ev.dados.descricao || '',
      data_inicio: ev.dados.data_inicio ? format(new Date(ev.dados.data_inicio), "yyyy-MM-dd'T'HH:mm") : '',
      data_fim: ev.dados.data_fim ? format(new Date(ev.dados.data_fim), "yyyy-MM-dd'T'HH:mm") : '',
      cor: ev.dados.cor || ev.cor,
    });
    setShowEventoModal(true);
  };

  const handleDiaClick = (dia: Date) => {
    const key = format(dia, 'yyyy-MM-dd');
    setDiaClickadoKey(key);
    setEventoForm({ titulo: '', descricao: '', data_inicio: format(dia, "yyyy-MM-dd'T'HH:mm"), data_fim: format(dia, "yyyy-MM-dd'T'HH:mm"), cor: '#3b82f6' });
    setShowCreateEvento(true);
  };

  const handleCreateEvento = async () => {
    if (!eventoForm.titulo || !eventoForm.data_inicio) {
      toast({ variant: 'destructive', title: 'Título e data são obrigatórios' }); return;
    }
    setCriando(true);
    try {
      const { error } = await supabase.from('eventos_calendario').insert({
        titulo: eventoForm.titulo, descricao: eventoForm.descricao || null,
        data_inicio: new Date(eventoForm.data_inicio).toISOString(),
        data_fim: eventoForm.data_fim ? new Date(eventoForm.data_fim).toISOString() : new Date(eventoForm.data_inicio).toISOString(),
        cor: eventoForm.cor, created_by: user?.id
      });
      if (error) throw error;
      toast({ title: 'Evento criado!' });
      setShowCreateEvento(false);
      setEventoForm({ titulo: '', descricao: '', data_inicio: '', data_fim: '', cor: '#3b82f6' });
      onLoadData();
    } catch { toast({ variant: 'destructive', title: 'Erro ao criar evento' }); }
    finally { setCriando(false); }
  };

  const handleSaveEdit = async () => {
    if (!selectedEvento || selectedEvento.tipo !== 'evento') return;
    if (!editForm.titulo || !editForm.data_inicio) {
      toast({ variant: 'destructive', title: 'Título e data são obrigatórios' }); return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.from('eventos_calendario').update({
        titulo: editForm.titulo, descricao: editForm.descricao || null,
        data_inicio: new Date(editForm.data_inicio).toISOString(),
        data_fim: editForm.data_fim ? new Date(editForm.data_fim).toISOString() : new Date(editForm.data_inicio).toISOString(),
        cor: editForm.cor,
      }).eq('id', selectedEvento.dados.id);
      if (error) throw error;
      toast({ title: 'Evento atualizado!' });
      setEditMode(false); setShowEventoModal(false); onLoadData();
    } catch { toast({ variant: 'destructive', title: 'Erro ao salvar' }); }
    finally { setSalvando(false); }
  };

  const handleDelete = async () => {
    if (!selectedEvento) return;
    setDeletando(true);
    try {
      const { error } = await supabase.from('eventos_calendario').delete().eq('id', selectedEvento.dados.id);
      if (error) throw error;
      toast({ title: 'Evento excluído' });
      setShowEventoModal(false); setSelectedEvento(null); setShowConfirmDelete(false); onLoadData();
    } catch { toast({ variant: 'destructive', title: 'Erro ao excluir' }); }
    finally { setDeletando(false); }
  };

  const corPicker = (cor: string, onChange: (c: string) => void) => (
    <div className="flex flex-wrap gap-2">
      {CORES_PRESET.map(c => (
        <button key={c} onClick={() => onChange(c)}
          className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${cor === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
          style={{ backgroundColor: c }} />
      ))}
      <input type="color" value={cor} onChange={e => onChange(e.target.value)}
        className="w-7 h-7 rounded-full cursor-pointer border-0 p-0" title="Cor personalizada" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Legenda */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="flex flex-wrap gap-4 text-sm">
          {[['bg-red-500','Tarefas'],['bg-orange-500','Lançamentos'],['bg-purple-500','NPA'],['bg-blue-500','Eventos']].map(([cor, label]) => (
            <div key={label} className="flex items-center gap-2"><div className={`w-3 h-3 ${cor} rounded`}/><span>{label}</span></div>
          ))}
        </div>
        <Button onClick={() => setShowCreateEvento(true)} className="bg-[#be123c] hover:bg-[#9f1239] text-white rounded-xl">
          <Plus className="h-4 w-4 mr-2"/>Evento
        </Button>
      </div>

      {/* Nav */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 border border-gray-200 rounded-xl bg-white shadow-sm">
        <h2 className="text-lg sm:text-xl font-bold capitalize">{format(currentDate, 'MMMM yyyy', { locale: ptBR })}</h2>
        <div className="flex items-center gap-2">
          <button onClick={mesAnterior} className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-100 text-lg transition-colors">‹</button>
          <button onClick={irParaHoje} className="px-3 h-8 text-sm rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">Hoje</button>
          <button onClick={mesProximo} className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-100 text-lg transition-colors">›</button>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
          {['Mês','Semana','Dia'].map((v,i) => (
            <button key={v} className={`h-7 px-3 text-xs rounded-md font-medium transition-all ${i===0?'bg-white shadow-sm text-gray-800':'text-gray-500 hover:text-gray-700'}`}>{v}</button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
            <div key={d} className="p-2 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {weeks.map((week, wi) => week.map((dia, di) => {
            const key = format(dia, 'yyyy-MM-dd');
            const evs = getEventosPorDia[key] || [];
            const isHoje = isSameDay(dia, new Date());
            const isMes = isSameMonth(dia, currentDate);
            return (
              <div key={`${wi}-${di}`}
                className={`min-h-[120px] border-b border-r border-gray-100 p-1.5 cursor-pointer transition-colors ${isHoje?'bg-red-50':'hover:bg-gray-50'}`}
                onClick={() => handleDiaClick(dia)}>
                <div className={`flex items-center justify-center w-7 h-7 text-xs font-semibold rounded-full mb-1 ${isHoje?'bg-[#9B1D42] text-white':isMes?'text-gray-800':'text-gray-300'}`}>
                  {dia.getDate()}
                </div>
                <div className="space-y-0.5">
                  {evs.slice(0,3).map(ev => (
                    <div key={ev.id}
                      className="rounded-md px-1.5 py-0.5 text-xs text-white font-medium truncate cursor-pointer flex items-center gap-1 hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: ev.cor }}
                      onClick={e => { e.stopPropagation(); handleEventoClick(ev); }}>
                      {getTipoIcon(ev.tipo)}<span className="truncate">{ev.titulo}</span>
                    </div>
                  ))}
                  {evs.length > 3 && <div className="text-gray-400 text-xs pl-1">+{evs.length-3} mais</div>}
                </div>
              </div>
            );
          }))}
        </div>
      </div>

      {/* Modal Detalhes/Edição */}
      <Dialog open={showEventoModal} onOpenChange={o => { setShowEventoModal(o); if(!o){setEditMode(false);setShowConfirmDelete(false);} }}>
        <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden">
          <div className="h-1.5 w-full" style={{ backgroundColor: editMode ? editForm.cor : (selectedEvento?.cor || '#3b82f6') }} />
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: `${selectedEvento?.cor}25` }}>
                  {selectedEvento && getTipoIcon(selectedEvento.tipo, 'h-4 w-4')}
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide block">{selectedEvento && TIPO_LABEL[selectedEvento.tipo]}</span>
                  {!editMode && <h2 className="text-lg font-bold text-gray-900 leading-tight">{selectedEvento?.titulo}</h2>}
                </div>
              </div>
              {selectedEvento?.tipo === 'evento' && !editMode && (
                <button onClick={() => setEditMode(true)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors" title="Editar">
                  <Pencil className="h-4 w-4"/>
                </button>
              )}
            </div>

            {editMode && selectedEvento?.tipo === 'evento' ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Título</label>
                  <Input value={editForm.titulo} onChange={e => setEditForm({...editForm, titulo: e.target.value})} className="rounded-xl"/>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Descrição</label>
                  <Textarea value={editForm.descricao} onChange={e => setEditForm({...editForm, descricao: e.target.value})} rows={3} placeholder="Adicionar descrição..." className="rounded-xl resize-none"/>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Data Início</label>
                    <Input type="datetime-local" value={editForm.data_inicio} onChange={e => setEditForm({...editForm, data_inicio: e.target.value})} className="rounded-xl text-sm"/>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Data Fim</label>
                    <Input type="datetime-local" value={editForm.data_fim} onChange={e => setEditForm({...editForm, data_fim: e.target.value})} className="rounded-xl text-sm"/>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">Cor</label>
                  {corPicker(editForm.cor, c => setEditForm({...editForm, cor: c}))}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSaveEdit} disabled={salvando} className="flex-1 bg-[#be123c] hover:bg-[#9f1239] text-white rounded-xl">
                    {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Check className="h-4 w-4 mr-2"/>}Salvar
                  </Button>
                  <Button variant="outline" onClick={() => setEditMode(false)} className="rounded-xl"><X className="h-4 w-4"/></Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0"/>
                  <span>
                    {selectedEvento && format(new Date(selectedEvento.dados.data_inicio || selectedEvento.dados.prazo || selectedEvento.data), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
                {selectedEvento?.dados?.data_fim && selectedEvento?.dados?.data_fim !== selectedEvento?.dados?.data_inicio && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Calendar className="h-4 w-4 text-gray-300 flex-shrink-0"/>
                    <span>até {format(new Date(selectedEvento.dados.data_fim), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  </div>
                )}
                {selectedEvento?.dados?.descricao ? (
                  <div className="p-3 bg-gray-50 rounded-xl text-sm text-gray-700 leading-relaxed">{selectedEvento.dados.descricao}</div>
                ) : selectedEvento?.tipo === 'evento' && (
                  <p className="text-sm text-gray-400 italic">Sem descrição — clique em editar para adicionar.</p>
                )}

                {showConfirmDelete ? (
                  <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-red-500"/>
                      <p className="text-sm font-semibold text-red-700">Excluir este evento?</p>
                    </div>
                    <p className="text-xs text-red-500 mb-3">Esta ação não pode ser desfeita.</p>
                    <div className="flex gap-2">
                      <Button onClick={handleDelete} disabled={deletando} variant="destructive" className="flex-1 rounded-xl text-sm h-8">
                        {deletando && <Loader2 className="h-3 w-3 animate-spin mr-1"/>}Confirmar
                      </Button>
                      <Button variant="outline" onClick={() => setShowConfirmDelete(false)} className="rounded-xl text-sm h-8">Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" onClick={() => setShowEventoModal(false)} className="flex-1 rounded-xl">Fechar</Button>
                    {selectedEvento?.tipo === 'evento' && (
                      <Button variant="outline" onClick={() => setShowConfirmDelete(true)} className="rounded-xl border-red-200 text-red-500 hover:bg-red-50">
                        <Trash2 className="h-4 w-4"/>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Criar */}
      <Dialog open={showCreateEvento} onOpenChange={setShowCreateEvento}>
        <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden">
          <div className="h-1.5 w-full" style={{ backgroundColor: eventoForm.cor }}/>
          <div className="p-6">
            <DialogHeader className="mb-4">
              <DialogTitle className="text-lg font-bold">Novo Evento</DialogTitle>
            </DialogHeader>

            {/* Eventos já existentes neste dia */}
            {diaClickadoKey && (() => {
              const existentes = (getEventosPorDia[diaClickadoKey] ?? []).filter(e => e.tipo !== 'tarefa');
              if (!existentes.length) return null;
              return (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs font-semibold text-amber-700 mb-2">Já existe neste dia — selecione para abrir:</p>
                  <div className="space-y-1.5">
                    {existentes.map(ev => (
                      <button key={ev.id}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-left hover:bg-amber-100 transition-colors"
                        onClick={() => { setShowCreateEvento(false); handleEventoClick(ev); }}>
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ev.cor }}/>
                        <span className="font-medium truncate">{ev.titulo}</span>
                        <span className="ml-auto text-[10px] text-amber-500 uppercase font-medium flex-shrink-0">{TIPO_LABEL[ev.tipo]}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-amber-500 mt-2">Ou crie um novo evento abaixo ↓</p>
                </div>
              );
            })()}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Título *</label>
                <Input value={eventoForm.titulo} onChange={e => setEventoForm({...eventoForm, titulo: e.target.value})}
                  placeholder="Nome do evento" className="rounded-xl" onKeyDown={e => e.key==='Enter' && handleCreateEvento()}/>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Descrição</label>
                <Textarea value={eventoForm.descricao} onChange={e => setEventoForm({...eventoForm, descricao: e.target.value})}
                  placeholder="Descrição opcional..." rows={3} className="rounded-xl resize-none"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Data Início *</label>
                  <Input type="datetime-local" value={eventoForm.data_inicio} onChange={e => setEventoForm({...eventoForm, data_inicio: e.target.value})} className="rounded-xl text-sm"/>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Data Fim</label>
                  <Input type="datetime-local" value={eventoForm.data_fim} onChange={e => setEventoForm({...eventoForm, data_fim: e.target.value})} className="rounded-xl text-sm"/>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">Cor do evento</label>
                {corPicker(eventoForm.cor, c => setEventoForm({...eventoForm, cor: c}))}
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" onClick={() => setShowCreateEvento(false)} className="rounded-xl">Cancelar</Button>
              <Button onClick={handleCreateEvento} disabled={criando} className="flex-1 bg-[#be123c] hover:bg-[#9f1239] text-white rounded-xl">
                {criando ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Plus className="h-4 w-4 mr-2"/>}Criar Evento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
