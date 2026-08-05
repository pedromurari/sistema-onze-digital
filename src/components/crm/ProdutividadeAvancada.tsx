import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { 
  Plus, Search, Filter, ChevronDown, Check, AlertCircle, CheckCircle2, Clock, FileText, 
  Kanban as KanbanIcon, Calendar, Table2, List, X, MessageCircle, Eye, EyeOff, ChevronRight,
  GripVertical, Trash2, Copy, Share2, Settings
} from 'lucide-react';
import type { Task } from '@/types/crm';
import { format, isToday, isPast, differenceInDays, startOfToday, endOfToday, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';

type ViewType = 'list' | 'kanban' | 'calendar' | 'table';
type GroupBy = 'responsavel' | 'prioridade' | 'status' | 'none';

interface TaskWithExtended extends Task {
  subtasks?: { id: string; titulo: string; concluido: boolean }[];
  co_responsaveis?: string[];
  tags?: { nome: string; cor: string }[];
  comentarios_count?: number;
}

interface FilterState {
  searchText: string;
  status: string;
  prioridade: string;
  responsavel: string;
  prazo: string;
  tags: string[];
}

export function ProdutividadeAvancada() {
  const { user, users } = useAuth();
  const [tasks, setTasks] = useState<TaskWithExtended[]>([]);
  const [view, setView] = useState<ViewType>('list');
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [selectedTask, setSelectedTask] = useState<TaskWithExtended | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    searchText: '',
    status: 'todos',
    prioridade: 'todos',
    responsavel: 'todos',
    prazo: 'todos',
    tags: [],
  });

  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    responsavel_id: '',
    co_responsaveis: [] as string[],
    prazo: '',
    prioridade: 'media' as const,
    categoria: 'tarefa' as const,
    tags: [] as { nome: string; cor: string }[],
  });

  // Fetch tasks
  const fetchTasks = async () => {
    const { data } = await supabase
      .from('tarefas')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) {
      setTasks(data as unknown as TaskWithExtended[]);
    }
  };

  useEffect(() => {
    fetchTasks();
    const ch = supabase
      .channel('tarefas-advanced')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas' }, () => fetchTasks())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Filtrar tarefas
  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.titulo.toLowerCase().includes(filters.searchText.toLowerCase()) || 
                         (t.descricao && t.descricao.toLowerCase().includes(filters.searchText.toLowerCase()));
    const matchesStatus = filters.status === 'todos' || t.status === filters.status;
    const matchesPrioridade = filters.prioridade === 'todos' || t.prioridade === filters.prioridade;
    const matchesResponsavel = filters.responsavel === 'todos' || t.responsavel_id === filters.responsavel;
    
    let matchesPrazo = true;
    if (filters.prazo === 'hoje' && t.prazo) {
      matchesPrazo = isSameDay(new Date(t.prazo), new Date());
    } else if (filters.prazo === 'semana' && t.prazo) {
      matchesPrazo = differenceInDays(new Date(t.prazo), new Date()) <= 7 && differenceInDays(new Date(t.prazo), new Date()) >= 0;
    } else if (filters.prazo === 'atrasadas' && t.prazo) {
      matchesPrazo = isPast(new Date(t.prazo)) && !isSameDay(new Date(t.prazo), new Date());
    }
    
    return matchesSearch && matchesStatus && matchesPrioridade && matchesResponsavel && matchesPrazo;
  });

  // Agrupar tarefas
  const getGroupedTasks = () => {
    if (groupBy === 'none') return { 'Todas': filteredTasks };
    
    const grouped: Record<string, TaskWithExtended[]> = {};
    
    filteredTasks.forEach(task => {
      let groupKey = 'Sem definição';
      
      if (groupBy === 'status') {
        groupKey = task.status === 'a_fazer' ? 'A Fazer' :
                   task.status === 'em_andamento' ? 'Em Andamento' :
                   task.status === 'revisao' ? 'Revisão' :
                   'Concluído';
      } else if (groupBy === 'prioridade') {
        groupKey = task.prioridade === 'alta' ? '🔴 Alta' :
                   task.prioridade === 'media' ? '🟡 Média' :
                   '🟢 Baixa';
      } else if (groupBy === 'responsavel') {
        groupKey = users.find(u => u.id === task.responsavel_id)?.nome || 'Sem responsável';
      }
      
      if (!grouped[groupKey]) grouped[groupKey] = [];
      grouped[groupKey].push(task);
    });
    
    return grouped;
  };

  const createTask = async () => {
    if (!form.titulo.trim()) return;
    
    const { error } = await supabase.from('tarefas').insert({
      titulo: form.titulo,
      descricao: form.descricao || null,
      responsavel_id: form.responsavel_id || null,
      co_responsaveis: form.co_responsaveis.length > 0 ? form.co_responsaveis : null,
      prazo: form.prazo || null,
      prioridade: form.prioridade,
      categoria: form.categoria,
      tags: form.tags.length > 0 ? form.tags : null,
      pagina: 'produtividade',
      criado_por_id: user?.id,
      status: 'a_fazer',
    } as any);
    
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
      return;
    }
    
    toast({ title: 'Tarefa criada!' });
    setShowCreateDialog(false);
    setForm({
      titulo: '',
      descricao: '',
      responsavel_id: '',
      co_responsaveis: [],
      prazo: '',
      prioridade: 'media',
      categoria: 'tarefa',
      tags: [],
    });
    fetchTasks();
  };

  const updateTaskStatus = async (id: string, newStatus: string) => {
    await supabase.from('tasks').update({ status: newStatus }).eq('id', id);
    fetchTasks();
  };

  const deleteTask = async (id: string) => {
    await supabase.from('tasks').delete().eq('id', id);
    setSelectedTask(null);
    fetchTasks();
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'alta':
        return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'media':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'baixa':
        return 'bg-success/10 text-success border-success/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'a_fazer':
        return 'bg-slate-100 text-slate-700';
      case 'em_andamento':
        return 'bg-blue-100 text-blue-700';
      case 'revisao':
        return 'bg-amber-100 text-amber-700';
      case 'concluido':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'a_fazer':
        return 'A Fazer';
      case 'em_andamento':
        return 'Em Andamento';
      case 'revisao':
        return 'Revisão';
      case 'concluido':
        return 'Concluído';
      default:
        return status;
    }
  };

  const completionRate = filteredTasks.length > 0 
    ? Math.round((filteredTasks.filter(t => t.status === 'concluido').length / filteredTasks.length) * 100)
    : 0;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-border">
        <div className="p-4 lg:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Produtividade</h1>
              <p className="text-sm text-muted-foreground mt-1">{filteredTasks.length} tarefas • {completionRate}% completo</p>
            </div>
            <Button onClick={() => setShowCreateDialog(true)} className="bg-primary hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" />Nova Tarefa
            </Button>
          </div>

          {/* Progress Bar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${completionRate}%` }}
              />
            </div>
            <span className="text-xs font-600 text-muted-foreground w-10 text-right">{completionRate}%</span>
          </div>

          {/* View Modes */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1 bg-muted p-1 rounded-lg">
              <Button
                variant={view === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView('list')}
                className="h-8"
              >
                <List className="h-4 w-4 mr-1" />
                Lista
              </Button>
              <Button
                variant={view === 'kanban' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView('kanban')}
                className="h-8"
              >
                <KanbanIcon className="h-4 w-4 mr-1" />
                Kanban
              </Button>
              <Button
                variant={view === 'calendar' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView('calendar')}
                className="h-8"
              >
                <Calendar className="h-4 w-4 mr-1" />
                Calendário
              </Button>
              <Button
                variant={view === 'table' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView('table')}
                className="h-8"
              >
                <Table2 className="h-4 w-4 mr-1" />
                Tabela
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFiltersPanel(!showFiltersPanel)}
            >
              <Filter className="h-4 w-4 mr-2" />
              {showFiltersPanel ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Filters Panel */}
        {showFiltersPanel && (
          <div className="px-4 lg:px-6 pb-4 border-t border-border/50">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Search */}
              <div className="flex items-center gap-2 px-3 py-2.5 border border-border rounded-lg bg-muted/30">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={filters.searchText}
                  onChange={(e) => setFilters({ ...filters, searchText: e.target.value })}
                  className="flex-1 bg-transparent text-sm placeholder-muted-foreground focus:outline-none"
                />
              </div>

              {/* Status Filter */}
              <Select
                value={filters.status}
                onValueChange={(val) => setFilters({ ...filters, status: val })}
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="a_fazer">A Fazer</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="revisao">Revisão</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                </SelectContent>
              </Select>

              {/* Priority Filter */}
              <Select
                value={filters.prioridade}
                onValueChange={(val) => setFilters({ ...filters, prioridade: val })}
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  <SelectItem value="alta">🔴 Alta</SelectItem>
                  <SelectItem value="media">🟡 Média</SelectItem>
                  <SelectItem value="baixa">🟢 Baixa</SelectItem>
                </SelectContent>
              </Select>

              {/* Responsável Filter */}
              <Select
                value={filters.responsavel}
                onValueChange={(val) => setFilters({ ...filters, responsavel: val })}
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {users.filter(u => u.ativo).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Prazo Filter */}
              <Select
                value={filters.prazo}
                onValueChange={(val) => setFilters({ ...filters, prazo: val })}
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Prazo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="hoje">Hoje</SelectItem>
                  <SelectItem value="semana">Esta Semana</SelectItem>
                  <SelectItem value="atrasadas">Atrasadas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Grouping Options */}
            <div className="mt-3 flex gap-2 items-center">
              <span className="text-xs font-500 text-muted-foreground">Agrupar por:</span>
              <div className="flex gap-1">
                {(['status', 'prioridade', 'responsavel', 'none'] as const).map((g) => (
                  <Button
                    key={g}
                    variant={groupBy === g ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setGroupBy(g)}
                    className="h-8 text-xs"
                  >
                    {g === 'status'
                      ? 'Status'
                      : g === 'prioridade'
                      ? 'Prioridade'
                      : g === 'responsavel'
                      ? 'Responsável'
                      : 'Nenhum'}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        {view === 'list' && <ListViewContent tasks={filteredTasks} groupBy={groupBy} getGroupedTasks={getGroupedTasks} onSelectTask={setSelectedTask} updateTaskStatus={updateTaskStatus} users={users} getPriorityColor={getPriorityColor} getStatusLabel={getStatusLabel} getStatusColor={getStatusColor} />}
        {view === 'kanban' && <KanbanViewContent tasks={filteredTasks} onSelectTask={setSelectedTask} updateTaskStatus={updateTaskStatus} users={users} getPriorityColor={getPriorityColor} />}
        {view === 'calendar' && <CalendarViewContent tasks={filteredTasks} onSelectTask={setSelectedTask} />}
        {view === 'table' && <TableViewContent tasks={filteredTasks} onSelectTask={setSelectedTask} users={users} getPriorityColor={getPriorityColor} getStatusColor={getStatusColor} />}
      </div>

      {/* Side Panel for Task Details */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={fetchTasks}
          onDelete={deleteTask}
          users={users}
          getPriorityColor={getPriorityColor}
          getStatusColor={getStatusColor}
          getStatusLabel={getStatusLabel}
        />
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova Tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-500">Título *</label>
              <Input
                placeholder="O que precisa fazer?"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-500">Descrição</label>
              <Textarea
                placeholder="Detalhes opcionais..."
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                className="mt-1 resize-none"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-500">Responsável</label>
                <Select value={form.responsavel_id} onValueChange={(val) => setForm({ ...form, responsavel_id: val })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.filter(u => u.ativo).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-500">Prioridade</label>
                <Select value={form.prioridade} onValueChange={(val) => setForm({ ...form, prioridade: val as any })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">🟢 Baixa</SelectItem>
                    <SelectItem value="media">🟡 Média</SelectItem>
                    <SelectItem value="alta">🔴 Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-500">Prazo</label>
              <Input
                type="date"
                value={form.prazo}
                onChange={(e) => setForm({ ...form, prazo: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={createTask} className="bg-primary hover:bg-primary/90">
              Criar Tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ========== View Components ==========

function ListViewContent({ tasks, groupBy, getGroupedTasks, onSelectTask, updateTaskStatus, users, getPriorityColor, getStatusLabel, getStatusColor }: any) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const grouped = getGroupedTasks();

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {Object.entries(grouped).map(([groupName, groupTasks]: [string, any]) => (
        <div key={groupName}>
          <button
            onClick={() => setExpandedGroups((p) => ({ ...p, [groupName]: !p[groupName] }))}
            className="flex items-center gap-2 py-2 px-3 hover:bg-muted rounded mb-2 w-full"
          >
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform',
                expandedGroups[groupName] && 'rotate-180'
              )}
            />
            <span className="font-600 text-sm flex-1 text-left">{groupName}</span>
            <Badge variant="secondary" className="text-xs">
              {groupTasks.length}
            </Badge>
          </button>

          {expandedGroups[groupName] && (
            <div className="space-y-2 ml-2 border-l-2 border-border pl-3">
              {groupTasks.map((task: any) => (
                <Card
                  key={task.id}
                  onClick={() => onSelectTask(task)}
                  className="p-3 cursor-pointer hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={task.status === 'concluido'}
                      onCheckedChange={(checked) => updateTaskStatus(task.id, checked ? 'concluido' : 'a_fazer')}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={cn('font-500 text-sm', task.status === 'concluido' && 'line-through text-muted-foreground')}>
                        {task.titulo}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge className={cn('text-xs', getPriorityColor(task.prioridade))}>
                          {task.prioridade === 'alta' ? '🔴' : task.prioridade === 'media' ? '🟡' : '🟢'} {task.prioridade}
                        </Badge>
                        <Badge className={cn('text-xs', getStatusColor(task.status))}>
                          {getStatusLabel(task.status)}
                        </Badge>
                        {task.prazo && (
                          <span className="text-xs text-muted-foreground">
                            📅 {format(new Date(task.prazo), 'dd MMM', { locale: { weekStartsOn: 1 } as any })}
                          </span>
                        )}
                        {task.responsavel_id && (
                          <span className="text-xs text-muted-foreground">
                            👤 {users.find((u: any) => u.id === task.responsavel_id)?.nome?.split(' ')[0]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function KanbanViewContent({ tasks, onSelectTask, updateTaskStatus, users, getPriorityColor }: any) {
  const statuses = ['a_fazer', 'em_andamento', 'revisao', 'concluido'];
  const statusLabels: Record<string, string> = {
    a_fazer: 'A Fazer',
    em_andamento: 'Em Andamento',
    revisao: 'Revisão',
    concluido: 'Concluído',
  };

  return (
    <div className="p-4 lg:p-6 flex gap-4 overflow-x-auto">
      {statuses.map((status) => {
        const statusTasks = tasks.filter((t: any) => t.status === status);
        return (
          <div key={status} className="flex-shrink-0 w-80 bg-muted/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-600 text-sm">{statusLabels[status]}</h3>
              <Badge variant="secondary" className="text-xs">
                {statusTasks.length}
              </Badge>
            </div>
            <div className="space-y-3">
              {statusTasks.map((task: any) => (
                <Card
                  key={task.id}
                  onClick={() => onSelectTask(task)}
                  className="p-3 cursor-pointer hover:shadow-md transition-all"
                >
                  <p className="font-500 text-sm mb-2">{task.titulo}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge className={cn('text-xs', getPriorityColor(task.prioridade))} variant="outline">
                      {task.prioridade === 'alta' ? '🔴' : task.prioridade === 'media' ? '🟡' : '🟢'}
                    </Badge>
                    {task.prazo && (
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(task.prazo), 'dd MMM')}
                      </span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarViewContent({ tasks, onSelectTask }: any) {
  return (
    <div className="p-6">
      <p className="text-muted-foreground text-sm">📅 Visualização de calendário em desenvolvimento...</p>
    </div>
  );
}

function TableViewContent({ tasks, onSelectTask, users, getPriorityColor, getStatusColor }: any) {
  return (
    <div className="p-4 lg:p-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left font-600 p-2">Tarefa</th>
            <th className="text-left font-600 p-2">Responsável</th>
            <th className="text-left font-600 p-2">Prioridade</th>
            <th className="text-left font-600 p-2">Status</th>
            <th className="text-left font-600 p-2">Prazo</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task: any) => (
            <tr
              key={task.id}
              onClick={() => onSelectTask(task)}
              className="border-b border-border/30 hover:bg-muted/30 cursor-pointer transition-colors"
            >
              <td className="p-2">{task.titulo}</td>
              <td className="p-2">{users.find((u: any) => u.id === task.responsavel_id)?.nome || '—'}</td>
              <td className="p-2">
                <Badge className={cn('text-xs', getPriorityColor(task.prioridade))} variant="outline">
                  {task.prioridade}
                </Badge>
              </td>
              <td className="p-2">
                <Badge className={cn('text-xs', getStatusColor(task.status))}>{task.status}</Badge>
              </td>
              <td className="p-2">{task.prazo ? format(new Date(task.prazo), 'dd MMM yyyy') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TaskDetailPanel({ task, onClose, onUpdate, onDelete, users, getPriorityColor, getStatusColor, getStatusLabel }: any) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(task.titulo);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTitle && titleRef.current) {
      titleRef.current.focus();
    }
  }, [editingTitle]);

  const handleTitleSave = async () => {
    if (title.trim() !== task.titulo) {
      await supabase.from('tasks').update({ titulo: title }).eq('id', task.id);
      onUpdate();
    }
    setEditingTitle(false);
  };

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white border-l border-border shadow-lg flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="font-600">Detalhes da Tarefa</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Title */}
        <div>
          {editingTitle ? (
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyPress={(e) => e.key === 'Enter' && handleTitleSave()}
              className="w-full font-700 text-lg border-b-2 border-primary bg-transparent focus:outline-none"
            />
          ) : (
            <h3
              onClick={() => setEditingTitle(true)}
              className="font-700 text-lg cursor-pointer hover:text-primary transition-colors"
            >
              {task.titulo}
            </h3>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-600 text-muted-foreground">Descrição</label>
          <p className="text-sm mt-2 text-foreground/80">{task.descricao || 'Sem descrição'}</p>
        </div>

        {/* Info Badges */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-600 text-muted-foreground">Prioridade</label>
            <div className="mt-2">
              <Badge className={cn('text-xs', getPriorityColor(task.prioridade))}>
                {task.prioridade === 'alta' ? '🔴' : task.prioridade === 'media' ? '🟡' : '🟢'} {task.prioridade}
              </Badge>
            </div>
          </div>
          <div>
            <label className="text-xs font-600 text-muted-foreground">Status</label>
            <div className="mt-2">
              <Badge className={cn('text-xs', getStatusColor(task.status))}>
                {getStatusLabel(task.status)}
              </Badge>
            </div>
          </div>
          <div>
            <label className="text-xs font-600 text-muted-foreground">Responsável</label>
            <p className="text-sm mt-2">{users.find((u: any) => u.id === task.responsavel_id)?.nome || '—'}</p>
          </div>
          {task.prazo && (
            <div>
              <label className="text-xs font-600 text-muted-foreground">Prazo</label>
              <p className="text-sm mt-2">📅 {format(new Date(task.prazo), 'dd MMM yyyy')}</p>
            </div>
          )}
        </div>

        {/* Subtasks */}
        {task.subtasks && task.subtasks.length > 0 && (
          <div>
            <label className="text-xs font-600 text-muted-foreground">Subtarefas</label>
            <div className="mt-2 space-y-2">
              {task.subtasks.map((sub: any) => (
                <div key={sub.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={sub.concluido} disabled />
                  <span className={sub.concluido ? 'line-through text-muted-foreground' : ''}>{sub.titulo}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDelete(task.id)}
          className="flex-1 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Deletar
        </Button>
        <Button size="sm" onClick={onClose} className="flex-1 bg-primary hover:bg-primary/90">
          Fechar
        </Button>
      </div>
    </div>
  );
}
