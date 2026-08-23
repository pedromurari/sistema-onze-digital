import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ensureDefaultLancamentoKanbanColumns } from '@/components/crm/kanban/useKanbanColunas';
import { AppView, canAccessLancamento, canAccessView, getDefaultPermissions } from '@/lib/access-control';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  LayoutDashboard, Kanban, Settings, UserCog,
  Rocket, BarChart3, ChevronDown,
  ChevronLeft, ChevronRight, Plus, Brain, Scale, Menu,
  GripVertical, Pencil, Check, MessageSquare, MessageCircle, TrendingUp, GitBranch, CalendarDays, Radio, Image, Handshake, Bot, Flame, Users, Contact,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { LancamentoWizard } from '@/components/crm/LancamentoWizard';

export type View = AppView;

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  mobileMenuOpen: boolean;
  onMobileMenuOpenChange: (open: boolean) => void;
}

type MenuItem =
  | { key: View; label: string; icon: React.ElementType; adminOnly?: boolean }
  | { group: string; label: string; icon: React.ElementType; adminOnly?: boolean; children: { key: View; label: string }[] };

const BASE_MENU: MenuItem[] = [
  // Início
  { key: 'dashboard',                  label: 'Dashboard',           icon: LayoutDashboard },
  { key: 'operacoes_calendario_geral', label: 'Calendário',          icon: CalendarDays },
  // CRM
  { key: 'pessoas',                    label: 'Pessoas',             icon: Contact },
  // CRM Time Comercial
  { key: 'time_comercial',             label: 'Time Comercial',      icon: Users },
  // Vendas & Parcerias
  { key: 'parceiros',                  label: 'Parceiros',           icon: Handshake,   adminOnly: true },
  { key: 'franquia_psi',              label: 'IDM PSI Franquias',    icon: TrendingUp },
  // Conteúdo
  { key: 'posts',                      label: 'Post',                 icon: Image,       adminOnly: true },
  // Eventos
  { group: 'lancamentos_legado',       label: 'Semana do Despertar', icon: Rocket,       children: [] },
  { group: 'npa_dinamico',            label: 'IDM Pelo Brasil',       icon: BarChart3,    children: [] },
  // Funil & Automação
  { key: 'funil_lancamento',          label: 'Funil de Lançamento',  icon: GitBranch },
  { key: 'disparos_monitor',          label: 'Central de Disparos',  icon: Radio },
  { key: 'chat_conversas',            label: 'Chat',                 icon: MessageCircle },
  { key: 'aquecimento_chips',         label: 'Aquecimento de Chips', icon: Flame,       adminOnly: true },
  // Financeiro
  { key: 'financeiro',                label: 'Financeiro',           icon: BarChart3 },
  { key: 'financeiro_cfo',           label: 'Análise CFO',           icon: TrendingUp },
  { key: 'balanco',                  label: 'Balanço',               icon: Scale },
  { key: 'cobranca',                 label: 'Cobrança',              icon: MessageSquare },
  // Gestão
  { key: 'mapa_mental',              label: 'Mapa Mental',           icon: Brain },
  { key: 'equipe_11ds',              label: 'Equipe 11DS',           icon: Bot,        adminOnly: true },
  // Admin
  { key: 'team',                    label: 'Equipe',                  icon: UserCog, adminOnly: true },
  { key: 'settings',                label: 'Configurações',           icon: Settings },
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

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="px-3 pt-5 pb-1.5">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 select-none">{label}</p>
    </div>
  );
}

export function Sidebar({ currentView, onViewChange, mobileMenuOpen, onMobileMenuOpenChange }: SidebarProps) {
  const { user } = useAuth();
  const isAdmin = user?.tipo === 'admin';
  const permissions = user?.permissions ?? getDefaultPermissions(user?.tipo);
  // A matriz do banco e a autoridade; `permissions` e so a projecao dela (sprint 1.2).
  const matrix = user?.permissionMatrix;

  const SECTION_BEFORE: Record<string, string> = {
    dashboard:          'Início',
    time_comercial:     'CRM Time Comercial',
    parceiros:          'Vendas & Parcerias',
    posts:              'Conteúdo',
    lancamentos_legado: 'Canais de Aquisição',
    funil_lancamento:   'Funil & Automação',
    financeiro:         'Financeiro',
    mapa_mental:        'Gestão',
    ...(isAdmin ? { team: 'Admin' } : { settings: 'Admin' }),
  };
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [editMode, setEditMode] = useState(false);
  const [menuOrder, setMenuOrder] = useState<string[]>(loadOrder);
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const [lancamentos, setLancamentos] = useState<{ id: string; nome: string }[]>([]);
  const [npaEventos, setNpaEventos] = useState<{ id: string; nome: string }[]>([]);

  // Wizard de lançamento/NPA
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardExistingId, setWizardExistingId] = useState<string | undefined>();
  const [wizardExistingTipo, setWizardExistingTipo] = useState<'lancamento' | 'npa' | undefined>();

  const [vencimentosHoje, setVencimentosHoje] = useState(0);

  useEffect(() => {
    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    supabase.from('pagamentos').select('id', { count: 'exact', head: true }).eq('data_vencimento', hojeStr).neq('status', 'pago')
      .then(({ count }) => setVencimentosHoje(count || 0));
  }, []);

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

  const handleWizardSuccess = (id: string, tipo: 'lancamento' | 'npa') => {
    setWizardOpen(false);
    setWizardExistingId(undefined);
    setWizardExistingTipo(undefined);
    onViewChange((tipo === 'lancamento' ? `lancamentos_${id}` : `npa_${id}`) as View);
  };

  const openWizardNew = (tipo: 'lancamento' | 'npa') => {
    setWizardExistingId(undefined);
    setWizardExistingTipo(tipo);
    setWizardOpen(true);
  };

  const openWizardEdit = (id: string, tipo: 'lancamento' | 'npa') => {
    setWizardExistingId(id);
    setWizardExistingTipo(tipo);
    setWizardOpen(true);
  };

  const closeMobileMenu = () => onMobileMenuOpenChange(false);

  const navigateMobile = (view: View) => {
    onViewChange(view);
    closeMobileMenu();
  };

  const renderMobileMenuItems = () => MENU.map((item) => {
    if ('adminOnly' in item && item.adminOnly && !isAdmin) return null;
    if ('key' in item && !canAccessView(item.key, permissions, Boolean(isAdmin), matrix)) return null;

    if ('group' in item) {
      let renderedChildren = item.children;
      if (item.group === 'lancamentos_legado') renderedChildren = accessibleLancamentos.map(l => ({ key: `lancamentos_${l.id}` as View, label: l.nome }));
      else if (item.group === 'npa_dinamico') renderedChildren = npaEventos.map(e => ({ key: `npa_${e.id}` as View, label: e.nome }));

      if (item.group === 'lancamentos_legado' && !permissions.canViewLancamentos && !isAdmin) return null;
      if (item.group === 'npa_dinamico' && !permissions.canViewNpa && !isAdmin) return null;
      if (renderedChildren.length === 0 && !isAdmin) return null;

      const isOpen = Boolean(expanded[item.group]);
      const groupActive = renderedChildren.some(c => c.key === currentView);
      const groupSection = SECTION_BEFORE[item.group];

      return (
        <React.Fragment key={`mobile-${item.group}`}>
          {groupSection && <SectionDivider label={groupSection} />}
          <button
            onClick={() => toggle(item.group)}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2.5 rounded text-left text-sm font-600 transition-colors',
              groupActive ? 'text-primary bg-primary/8' : 'text-foreground hover:bg-primary/5',
            )}
          >
            <item.icon className={cn('h-4.5 w-4.5 flex-shrink-0', groupActive ? 'text-primary' : 'text-foreground/60')} />
            <span className="flex-1">{item.label}</span>
            <ChevronDown className={cn('h-3.5 w-3.5 flex-shrink-0 transition-transform duration-300', isOpen ? 'rotate-180 text-primary' : 'text-foreground/40')} />
          </button>
          {isOpen && (
            <div className="ml-0 mt-1 mb-1 space-y-0.5 pl-3 border-l-2 border-primary/15">
              {renderedChildren.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum item ainda</p>
              )}
              {renderedChildren.map((child) => (
                <button
                  key={child.key}
                  onClick={() => navigateMobile(child.key)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded text-left text-xs transition-colors',
                    currentView === child.key ? 'bg-primary/12 text-primary font-600' : 'text-foreground/70 hover:bg-primary/5',
                  )}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', currentView === child.key ? 'bg-primary' : 'bg-foreground/30')} />
                  <span className="truncate">{child.label}</span>
                </button>
              ))}
            </div>
          )}
        </React.Fragment>
      );
    }

    const mi = item as { key: View; label: string; icon: React.ElementType };
    const keySection = SECTION_BEFORE[mi.key];
    return (
      <React.Fragment key={`mobile-${mi.key}`}>
        {keySection && <SectionDivider label={keySection} />}
        <button
          onClick={() => navigateMobile(mi.key)}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2.5 rounded text-left text-sm font-600 transition-colors',
            currentView === mi.key ? 'bg-primary/8 text-primary' : 'text-foreground hover:bg-primary/5',
          )}
        >
          <mi.icon className={cn('h-4.5 w-4.5 flex-shrink-0', currentView === mi.key ? 'text-primary' : 'text-foreground/60')} />
          <span className="flex-1">{mi.label}</span>
          {mi.key === 'financeiro' && vencimentosHoje > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
              {vencimentosHoje}
            </span>
          )}
        </button>
      </React.Fragment>
    );
  });

  return (
    <>
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
          if ('key' in item && !canAccessView(item.key, permissions, Boolean(isAdmin), matrix)) return null;

          const itemId = getItemId(item);
          const isDragOver = dragOverId === itemId;

          if ('group' in item) {
            let renderedChildren = item.children;
            if (item.group === 'lancamentos_legado') renderedChildren = accessibleLancamentos.map(l => ({ key: `lancamentos_${l.id}` as View, label: l.nome }));
            else if (item.group === 'npa_dinamico') renderedChildren = npaEventos.map(e => ({ key: `npa_${e.id}` as View, label: e.nome }));

            if (item.group === 'lancamentos_legado' && !permissions.canViewLancamentos && !isAdmin) return null;
            if (item.group === 'npa_dinamico' && !permissions.canViewNpa && !isAdmin) return null;
            if (item.group === 'operacoes' && !permissions.canViewOperacoes && !isAdmin) return null;
            if (renderedChildren.length === 0 && item.group !== 'operacoes' && !isAdmin) return null;

            const isOpen = !editMode && !collapsed && expanded[item.group];
            const groupActive = isGroupActive(renderedChildren);

            const groupSection = SECTION_BEFORE[item.group];
            return (
              <React.Fragment key={item.group}>
                {groupSection && !collapsed && !editMode && <SectionDivider label={groupSection} />}
              <div
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
                    groupActive ? 'text-primary bg-primary/8' : 'text-foreground hover:bg-primary/5 hover:text-primary',
                  )}
                >
                  {editMode && !collapsed && <GripVertical className="h-3.5 w-3.5 text-foreground/30 flex-shrink-0" />}
                  <item.icon className={cn('h-4.5 w-4.5 transition-colors duration-300 flex-shrink-0', groupActive ? 'text-primary' : 'text-foreground/60')} />
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {!editMode && <ChevronDown className={cn('h-3.5 w-3.5 transition-all duration-300 flex-shrink-0', isOpen ? 'rotate-180 text-primary' : 'text-foreground/40')} />}
                    </>
                  )}
                </button>

                {isOpen && !collapsed && (
                  <div className="ml-0 mt-1 space-y-0.5 pl-3 border-l-2 border-primary/15">
                    {renderedChildren.map((child) => {
                      const isLancOrNpa = item.group === 'lancamentos_legado' || item.group === 'npa_dinamico';
                      const childId = child.key.replace(/^(lancamentos|npa)_/, '');
                      const childTipo = item.group === 'lancamentos_legado' ? 'lancamento' : 'npa';
                      return (
                        <div key={child.key} className="flex items-center group">
                          <button
                            onClick={() => onViewChange(child.key)}
                            className={cn(
                              'flex-1 flex items-center gap-2 px-3 py-2 rounded text-left text-xs transition-all duration-300',
                              currentView === child.key ? 'bg-primary/12 text-primary font-600' : 'text-foreground/70 hover:text-primary hover:bg-primary/5',
                            )}
                          >
                            <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', currentView === child.key ? 'bg-primary' : 'bg-foreground/30')} />
                            <span className="truncate">{child.label}</span>
                          </button>
                          {isAdmin && isLancOrNpa && (
                            <button
                              onClick={() => openWizardEdit(childId, childTipo as 'lancamento' | 'npa')}
                              className="opacity-0 group-hover:opacity-100 p-1 mr-1 rounded hover:bg-primary/10 transition-all flex-shrink-0"
                              title="Configurar"
                            >
                              <Settings className="h-3 w-3 text-primary/70" />
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {item.group === 'lancamentos_legado' && isAdmin && (
                      <button
                        onClick={() => openWizardNew('lancamento')}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded text-left text-xs text-primary hover:bg-primary/10 mt-1 font-600"
                      >
                        <Plus className="h-4 w-4" /> Nova Semana do Despertar
                      </button>
                    )}

                    {item.group === 'npa_dinamico' && isAdmin && (
                      <button
                        onClick={() => openWizardNew('npa')}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded text-left text-xs text-primary hover:bg-primary/10 mt-1 font-600"
                      >
                        <Plus className="h-4 w-4" /> Novo IDM
                      </button>
                    )}
                  </div>
                )}
              </div>
              </React.Fragment>
            );
          }

          const mi = item as { key: View; label: string; icon: React.ElementType };
          const keySection = SECTION_BEFORE[mi.key];
          const isActive = currentView === mi.key;
          return (
            <React.Fragment key={mi.key}>
              {keySection && !collapsed && !editMode && <SectionDivider label={keySection} />}
            <div
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
                <div className="relative flex-shrink-0">
                  <mi.icon className={cn('h-4.5 w-4.5 transition-colors duration-300', currentView === mi.key ? 'text-primary' : 'text-foreground/60')} />
                  {collapsed && mi.key === 'financeiro' && vencimentosHoje > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 rounded-full w-2 h-2" />
                  )}
                </div>
                {!collapsed && <span className="flex-1">{mi.label}</span>}
                {!collapsed && mi.key === 'financeiro' && vencimentosHoje > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                    {vencimentosHoje}
                  </span>
                )}
              </button>
            </div>
            </React.Fragment>
          );
        })}
      </nav>

      <LancamentoWizard
        open={wizardOpen}
        onClose={() => { setWizardOpen(false); setWizardExistingId(undefined); setWizardExistingTipo(undefined); }}
        onSuccess={handleWizardSuccess}
        existingId={wizardExistingId}
        existingTipo={wizardExistingTipo}
      />
    </aside>

    <Sheet open={mobileMenuOpen} onOpenChange={onMobileMenuOpenChange}>
      <SheetContent side="left" className="w-72 max-w-[85vw] p-0 flex flex-col gap-0 lg:hidden">
        <SheetHeader className="p-4 border-b border-border text-left">
          <SheetTitle className="text-base">Menu</SheetTitle>
        </SheetHeader>
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {renderMobileMenuItems()}
        </nav>
      </SheetContent>
    </Sheet>
    </>
  );
}

interface MobileNavProps {
  currentView: View;
  onViewChange: (view: View) => void;
  onOpenMore: () => void;
}

export function MobileNav({ currentView, onViewChange, onOpenMore }: MobileNavProps) {
  const { user } = useAuth();
  const isAdmin = user?.tipo === 'admin';
  const permissions = user?.permissions ?? getDefaultPermissions(user?.tipo);
  // A matriz do banco e a autoridade; `permissions` e so a projecao dela (sprint 1.2).
  const matrix = user?.permissionMatrix;

  // Atalhos rápidos — o restante das páginas fica disponível no menu "Mais" (todas as categorias do sidebar).
  const quickItems: { key: View; label: string; icon: React.ElementType }[] = [
    { key: 'dashboard',                  label: 'Início',     icon: LayoutDashboard },
    { key: 'financeiro',                 label: 'Financeiro', icon: BarChart3 },
    { key: 'operacoes_calendario_geral', label: 'Calendário', icon: CalendarDays },
  ];

  const visibleItems = quickItems.filter(item => canAccessView(item.key, permissions, Boolean(isAdmin), matrix));

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 safe-area-pb">
      <div className="flex justify-around py-1">
        {visibleItems.map((item) => (
          <button
            key={item.key}
            onClick={() => onViewChange(item.key)}
            className={cn(
              'flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg transition-colors flex-1',
              currentView === item.key ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
        <button
          onClick={onOpenMore}
          className="flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg transition-colors flex-1 text-muted-foreground"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-medium">Mais</span>
        </button>
      </div>
    </nav>
  );
}
