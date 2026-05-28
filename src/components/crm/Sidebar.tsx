import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ensureDefaultLancamentoKanbanColumns } from '@/components/crm/kanban/useKanbanColunas';
import { AppView, canAccessLancamento, canAccessView, getDefaultPermissions } from '@/lib/access-control';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  LayoutDashboard, Kanban, Settings, UserCog, FileSpreadsheet,
  MessageCircle, Rocket, BarChart3, CheckSquare, ChevronDown,
  ChevronLeft, ChevronRight, Plus, Brain, ListTodo, Scale,
  GraduationCap, GripVertical, Pencil, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

export type View = AppView;

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

type MenuItem =
  | { key: View; label: string; icon: React.ElementType; adminOnly?: boolean }
  | { group: string; label: string; icon: React.ElementType; adminOnly?: boolean; children: { key: View; label: string }[] };

const BASE_MENU: MenuItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'pipeline', label: 'Leads Diretos', icon: Kanban },
  { group: 'lancamentos_legado', label: 'Lancamentos', icon: Rocket, children: [] },
  { group: 'npa_dinamico', label: 'NPA', icon: BarChart3, children: [] },
  { group: 'aula_secreta', label: 'Aula Secreta', icon: Rocket, children: [] },
  { key: 'chat', label: 'Chat', icon: MessageCircle },
  { key: 'sheets', label: 'Leads Sheets', icon: FileSpreadsheet },
  { key: 'financeiro', label: 'Financeiro', icon: BarChart3 },
  { key: 'balanco', label: 'Balanco', icon: Scale },
  { key: 'team', label: 'Equipe', icon: UserCog, adminOnly: true },
  {
    group: 'operacoes',
    label: 'Operacoes',
    icon: ListTodo,
    children: [
      { key: 'operacoes_tarefas', label: 'Tarefas' },
      { key: 'operacoes_calendario_geral', label: 'Calendario Geral' },
      { key: 'operacoes_calendario_conteudo', label: 'Calendario de Conteudo' },
    ],
  },
  { key: 'mapa_mental', label: 'Mapa Mental', icon: Brain },
  { key: 'rodrygo', label: 'Tarefas Rodrygo', icon: CheckSquare },
  { key: 'pedagogico', label: 'Pedagogico', icon: GraduationCap },
  { key: 'settings', label: 'Configuracoes', icon: Settings },
];

function getItemId(item: MenuItem) {
  return 'key' in item ? item.key : item.group;
}

function loadOrder(): string[] {
  try { return JSON.parse(localStorage.getItem('sidebar-order') || '[]'); } catch { return []; }
}

function saveOrder(order: string[]) {
  try { localStorage.setItem('sidebar-order', JSON.stringify(order)); } catch {}
}

function applyOrder(menu: MenuItem[], order: string[]): MenuItem[] {
  if (!order.length) return menu;
  const map = new Map(menu.map(item => [getItemId(item), item]));
  const sorted = order.map(id => map.get(id)).filter(Boolean) as MenuItem[];
  const rest = menu.filter(item => !order.includes(getItemId(item)));
  return [...sorted, ...rest];
}

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  const { user } = useAuth();
  const isAdmin = user?.tipo === 'admin';
  const permissions = user?.permissions ?? getDefaultPermissions(user?.tipo);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    lancamentos_legado: true,
    npa_dinamico: true,
    aula_secreta: true,
    operacoes: false,
  });
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [editMode, setEditMode] = useState(false);
  const [menuOrder, setMenuOrder] = useState<string[]>(loadOrder);
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const [lancamentos, setLancamentos] = useState<{ id: string; nome: string }[]>([]);
  const [newLancamentoName, setNewLancamentoName] = useState('');
  const [isLancamentoDialogOpen, setIsLancamentoDialogOpen] = useState(false);

  const [npaEventos, setNpaEventos] = useState<{ id: string; nome: string }[]>([]);
  const [newNpaName, setNewNpaName] = useState('');
  const [isNpaDialogOpen, setIsNpaDialogOpen] = useState(false);

  const [aulaSecretaEventos, setAulaSecretaEventos] = useState<{ id: string; nome: string }[]>([]);
  const [newAulaSecretaName, setNewAulaSecretaName] = useState('');
  const [isAulaSecretaDialogOpen, setIsAulaSecretaDialogOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase.from('lancamentos').select('id, nome').order('created_at', { ascending: false });
        if (error) {
          console.error('Erro ao carregar lancamentos:', error);
          return;
        }
        const launchData = data || [];
        setLancamentos(launchData);
        await Promise.allSettled(launchData.map((lancamento) => ensureDefaultLancamentoKanbanColumns(lancamento.id)));
      } catch (error) {
        console.error('Erro ao carregar lancamentos:', error);
      }
    };
    load();
    const ch = supabase.channel('lancamentos-sidebar').on('postgres_changes', { event: '*', schema: 'public', table: 'lancamentos' }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase.from('npa_eventos').select('id, nome').order('created_at', { ascending: false });
        if (error) {
          console.error('Erro ao carregar eventos NPA:', error);
          return;
        }
        setNpaEventos(data || []);
      } catch (error) {
        console.error('Erro ao carregar eventos NPA:', error);
      }
    };
    load();
    const ch = supabase.channel('npa-eventos-sidebar').on('postgres_changes', { event: '*', schema: 'public', table: 'npa_eventos' }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase.from('aula_secreta_eventos').select('id, nome').order('created_at', { ascending: false });
        if (error) {
          console.error('Erro ao carregar eventos Aula Secreta:', error);
          return;
        }
        setAulaSecretaEventos(data || []);
      } catch (error) {
        console.error('Erro ao carregar eventos Aula Secreta:', error);
      }
    };
    load();
    const ch = supabase.channel('aula-secreta-sidebar').on('postgres_changes', { event: '*', schema: 'public', table: 'aula_secreta_eventos' }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const toggleSidebar = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebar-collapsed', String(next)); } catch {}
      if (next) setEditMode(false);
      return next;
    });
  };

  const toggle = (g: string) => setExpanded(p => ({ ...p, [g]: !p[g] }));
  const isGroupActive = (children: { key: View }[]) => children.some(c => c.key === currentView);
  const MENU = applyOrder(BASE_MENU, menuOrder);
  const accessibleLancamentos = lancamentos.filter((item) => canAccessLancamento(permissions, item.id));

  const handleDragStart = (idx: number) => { dragIdx.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number, id: string) => {
    e.preventDefault();
    dragOverIdx.current = idx;
    setDragOverId(id);
  };
  const handleDrop = () => {
    if (dragIdx.current === null || dragOverIdx.current === null || dragIdx.current === dragOverIdx.current) {
      dragIdx.current = null;
      dragOverIdx.current = null;
      setDragOverId(null);
      return;
    }
    const ids = MENU.map(getItemId);
    const [moved] = ids.splice(dragIdx.current, 1);
    ids.splice(dragOverIdx.current, 0, moved);
    setMenuOrder(ids);
    saveOrder(ids);
    dragIdx.current = null;
    dragOverIdx.current = null;
    setDragOverId(null);
  };

  const handleAddLancamento = async () => {
    if (!newLancamentoName.trim()) return;
    try {
      const { data, error } = await supabase
        .from('lancamentos')
        .insert({ nome: newLancamentoName, status: 'planejamento', ativo: false, meta_matriculas: 0, created_at: new Date().toISOString() })
        .select('id')
        .single();
      if (error) { toast.error(`Erro ao criar lancamento: ${error.message}`); return; }
      if (data) {
        try {
          await ensureDefaultLancamentoKanbanColumns(data.id);
        } catch {
          toast.warning('Lancamento criado, mas nao foi possivel criar as colunas padrao agora.');
        }
        toast.success(`Lancamento "${newLancamentoName}" criado!`);
        setNewLancamentoName('');
        setIsLancamentoDialogOpen(false);
        onViewChange(`lancamentos_${data.id}` as View);
      }
    } catch {
      toast.error('Erro inesperado.');
    }
  };

  const handleAddNpa = async () => {
    if (!newNpaName.trim()) return;
    try {
      const { data, error } = await supabase
        .from('npa_eventos')
        .insert({ nome: newNpaName, status: 'em_andamento', ativo: false, created_at: new Date().toISOString() })
        .select('id')
        .single();
      if (error) { toast.error(`Erro ao criar evento NPA: ${error.message}`); return; }
      if (data) {
        toast.success(`Evento NPA "${newNpaName}" criado!`);
        setNewNpaName('');
        setIsNpaDialogOpen(false);
        onViewChange(`npa_${data.id}` as View);
      }
    } catch {
      toast.error('Erro inesperado.');
    }
  };

  const handleAddAulaSecreta = async () => {
    if (!newAulaSecretaName.trim()) return;
    try {
      const { data, error } = await supabase
        .from('aula_secreta_eventos')
        .insert({ nome: newAulaSecretaName, status: 'em_andamento', ativo: false, created_at: new Date().toISOString() })
        .select('id')
        .single();
      if (error) { toast.error(`Erro ao criar Aula Secreta: ${error.message}`); return; }
      if (data) {
        toast.success(`Aula Secreta "${newAulaSecretaName}" criada!`);
        setNewAulaSecretaName('');
        setIsAulaSecretaDialogOpen(false);
        onViewChange(`aula_secreta_${data.id}` as View);
      }
    } catch {
      toast.error('Erro inesperado.');
    }
  };

  return (
    <aside
      className={cn(
        'bg-white border-r border-border min-h-[calc(100vh-4rem)] hidden lg:flex flex-col overflow-y-auto transition-all duration-300 relative flex-shrink-0',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-4 z-10 bg-white border border-border rounded-full p-0.5 shadow-sm hover:bg-primary/5 hover:border-primary transition-colors"
        title={collapsed ? 'Expandir menu' : 'Minimizar menu'}
      >
        {collapsed
          ? <ChevronRight className="h-3.5 w-3.5 text-foreground/60" />
          : <ChevronLeft className="h-3.5 w-3.5 text-foreground/60" />}
      </button>

      <nav className={cn('space-y-0.5 flex-1 pt-2', collapsed ? 'px-2' : 'px-3')}>
        {!collapsed && (
          <div className="flex justify-end mb-1">
            <button
              onClick={() => setEditMode(e => !e)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                editMode ? 'bg-primary text-white' : 'text-muted-foreground hover:text-primary hover:bg-primary/5',
              )}
              title={editMode ? 'Salvar ordem' : 'Editar ordem do menu'}
            >
              {editMode ? <><Check className="h-3 w-3" /> Salvar</> : <><Pencil className="h-3 w-3" /> Organizar</>}
            </button>
          </div>
        )}

        {MENU.map((item, idx) => {
          if ('adminOnly' in item && item.adminOnly && !isAdmin) return null;
          if ('key' in item && !canAccessView(item.key, permissions, Boolean(isAdmin))) return null;

          const itemId = getItemId(item);
          const isDragOver = dragOverId === itemId;

          if ('group' in item) {
            let renderedChildren = item.children;
            if (item.group === 'lancamentos_legado') renderedChildren = accessibleLancamentos.map(l => ({ key: `lancamentos_${l.id}` as View, label: l.nome }));
            else if (item.group === 'npa_dinamico') renderedChildren = npaEventos.map(e => ({ key: `npa_${e.id}` as View, label: e.nome }));
            else if (item.group === 'aula_secreta') renderedChildren = aulaSecretaEventos.map(e => ({ key: `aula_secreta_${e.id}` as View, label: e.nome }));

            if (item.group === 'lancamentos_legado' && !permissions.canViewLancamentos && !isAdmin) return null;
            if (item.group === 'npa_dinamico' && !permissions.canViewNpa && !isAdmin) return null;
            if (item.group === 'aula_secreta' && !permissions.canViewAulaSecreta && !isAdmin) return null;
            if (item.group === 'operacoes' && !permissions.canViewOperacoes && !isAdmin) return null;
            if (renderedChildren.length === 0 && item.group !== 'operacoes' && !isAdmin) return null;

            const isOpen = !editMode && !collapsed && expanded[item.group];

            return (
              <div
                key={item.group}
                draggable={editMode}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx, itemId)}
                onDrop={handleDrop}
                onDragEnd={() => setDragOverId(null)}
                className={cn('rounded transition-colors', isDragOver && editMode && 'bg-primary/10 ring-1 ring-primary')}
              >
                <button
                  onClick={() => { if (editMode) return; collapsed ? toggleSidebar() : toggle(item.group); }}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'w-full flex items-center rounded transition-all duration-300 text-left text-sm font-600',
                    collapsed ? 'justify-center px-2 py-2.5' : 'gap-2.5 px-3 py-2.5',
                    editMode ? 'cursor-grab active:cursor-grabbing' : '',
                    isGroupActive(renderedChildren) ? 'text-primary bg-primary/8' : 'text-foreground hover:bg-primary/5 hover:text-primary',
                  )}
                >
                  {editMode && !collapsed && <GripVertical className="h-3.5 w-3.5 text-foreground/30 flex-shrink-0" />}
                  <item.icon className={cn('h-4.5 w-4.5 transition-colors duration-300 flex-shrink-0', isGroupActive(renderedChildren) ? 'text-primary' : 'text-foreground/60')} />
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {!editMode && <ChevronDown className={cn('h-3.5 w-3.5 transition-all duration-300 flex-shrink-0', isOpen ? 'rotate-180 text-primary' : 'text-foreground/40')} />}
                    </>
                  )}
                </button>

                {isOpen && !collapsed && (
                  <div className="ml-0 mt-1 space-y-0.5 pl-3 border-l-2 border-primary/15">
                    {renderedChildren.map((child) => (
                      <button
                        key={child.key}
                        onClick={() => onViewChange(child.key)}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 rounded text-left text-xs transition-all duration-300',
                          currentView === child.key ? 'bg-primary/12 text-primary font-600' : 'text-foreground/70 hover:text-primary hover:bg-primary/5',
                        )}
                      >
                        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', currentView === child.key ? 'bg-primary' : 'bg-foreground/30')} />
                        <span className="truncate">{child.label}</span>
                      </button>
                    ))}

                    {item.group === 'lancamentos_legado' && isAdmin && (
                      <Dialog open={isLancamentoDialogOpen} onOpenChange={setIsLancamentoDialogOpen}>
                        <DialogTrigger asChild>
                          <button className="w-full flex items-center gap-2 px-3 py-2 rounded text-left text-xs text-primary hover:bg-primary/10 mt-1 font-600">
                            <Plus className="h-4 w-4" /> Novo Lancamento
                          </button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Criar novo lancamento</DialogTitle>
                            <DialogDescription>Digite o nome do novo lancamento</DialogDescription>
                          </DialogHeader>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Nome do lancamento"
                              value={newLancamentoName}
                              onChange={(e) => setNewLancamentoName(e.target.value)}
                              onKeyPress={(e) => e.key === 'Enter' && handleAddLancamento()}
                              className="border border-border focus:border-primary"
                            />
                            <Button onClick={handleAddLancamento} className="bg-primary hover:bg-primary/90">Criar</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}

                    {item.group === 'npa_dinamico' && isAdmin && (
                      <Dialog open={isNpaDialogOpen} onOpenChange={setIsNpaDialogOpen}>
                        <DialogTrigger asChild>
                          <button className="w-full flex items-center gap-2 px-3 py-2 rounded text-left text-xs text-primary hover:bg-primary/10 mt-1 font-600">
                            <Plus className="h-4 w-4" /> Novo NPA
                          </button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Criar novo evento NPA</DialogTitle>
                            <DialogDescription>Digite o nome do novo evento NPA</DialogDescription>
                          </DialogHeader>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Nome do evento NPA"
                              value={newNpaName}
                              onChange={(e) => setNewNpaName(e.target.value)}
                              onKeyPress={(e) => e.key === 'Enter' && handleAddNpa()}
                              className="border border-border focus:border-primary"
                            />
                            <Button onClick={handleAddNpa} className="bg-primary hover:bg-primary/90">Criar</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}

                    {item.group === 'aula_secreta' && isAdmin && (
                      <Dialog open={isAulaSecretaDialogOpen} onOpenChange={setIsAulaSecretaDialogOpen}>
                        <DialogTrigger asChild>
                          <button className="w-full flex items-center gap-2 px-3 py-2 rounded text-left text-xs text-primary hover:bg-primary/10 mt-1 font-600">
                            <Plus className="h-4 w-4" /> Nova Aula Secreta
                          </button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Criar nova Aula Secreta</DialogTitle>
                            <DialogDescription>Digite o nome da nova Aula Secreta</DialogDescription>
                          </DialogHeader>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Nome da Aula Secreta"
                              value={newAulaSecretaName}
                              onChange={(e) => setNewAulaSecretaName(e.target.value)}
                              onKeyPress={(e) => e.key === 'Enter' && handleAddAulaSecreta()}
                              className="border border-border focus:border-primary"
                            />
                            <Button onClick={handleAddAulaSecreta} className="bg-primary hover:bg-primary/90">Criar</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                )}
              </div>
            );
          }

          const mi = item as { key: View; label: string; icon: React.ElementType };
          return (
            <div
              key={mi.key}
              draggable={editMode}
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx, itemId)}
              onDrop={handleDrop}
              onDragEnd={() => setDragOverId(null)}
              className={cn('rounded transition-colors', isDragOver && editMode && 'bg-primary/10 ring-1 ring-primary')}
            >
              <button
                onClick={() => { if (!editMode) onViewChange(mi.key); }}
                title={collapsed ? mi.label : undefined}
                className={cn(
                  'w-full flex items-center rounded transition-all duration-300 text-left text-sm font-600',
                  collapsed ? 'justify-center px-2 py-2.5' : 'gap-2.5 px-3 py-2.5',
                  editMode ? 'cursor-grab active:cursor-grabbing' : '',
                  currentView === mi.key ? 'bg-primary/8 text-primary' : 'text-foreground hover:bg-primary/5 hover:text-primary',
                )}
              >
                {editMode && !collapsed && <GripVertical className="h-3.5 w-3.5 text-foreground/30 flex-shrink-0" />}
                <mi.icon className={cn('h-4.5 w-4.5 transition-colors duration-300 flex-shrink-0', currentView === mi.key ? 'text-primary' : 'text-foreground/60')} />
                {!collapsed && <span>{mi.label}</span>}
              </button>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

interface MobileNavProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

export function MobileNav({ currentView, onViewChange }: MobileNavProps) {
  const { user } = useAuth();
  const isAdmin = user?.tipo === 'admin';
  const permissions = user?.permissions ?? getDefaultPermissions(user?.tipo);
  const mobileItems: { key: View; label: string; icon: React.ElementType }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'pipeline', label: 'Leads', icon: Kanban },
    { key: 'chat', label: 'Chat', icon: MessageCircle },
    { key: 'lancamentos_30', label: 'Lan.', icon: Rocket },
    { key: 'operacoes_tarefas', label: 'Tarefas', icon: CheckSquare },
    { key: 'settings', label: 'Config', icon: Settings },
  ];

  const visibleItems = mobileItems.filter((item) => canAccessView(item.key, permissions, Boolean(isAdmin)));

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
      <div className="flex justify-around py-2">
        {visibleItems.map((item) => (
          <button
            key={item.key}
            onClick={() => onViewChange(item.key)}
            className={cn('flex flex-col items-center gap-1 px-2 py-2 rounded-lg transition-colors', currentView === item.key ? 'text-primary' : 'text-muted-foreground')}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
