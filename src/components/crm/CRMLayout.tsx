import { useState, useEffect, lazy, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessView, firstAllowedView, getDefaultPermissions } from '@/lib/access-control';
import { Lead } from '@/types/crm';
import { Header } from './Header';
import { Sidebar, MobileNav, type View } from './Sidebar';
import { LeadModal } from './LeadModal';
import { ChatWidget } from './chat/ChatWidget';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Lock } from 'lucide-react';
import { useRealtimeInvalidation } from '@/lib/db';
import { FichaPessoaProvider } from './pessoa/FichaPessoaProvider';

// Code splitting: cada módulo carrega só quando o usuário navega até ele
const Dashboard        = lazy(() => import('./Dashboard').then(m => ({ default: m.Dashboard })));
const TeamManagement   = lazy(() => import('./TeamManagement').then(m => ({ default: m.TeamManagement })));
const Settings         = lazy(() => import('./Settings').then(m => ({ default: m.Settings })));
const NPAEventos       = lazy(() => import('./NPAEventos').then(m => ({ default: m.NPAEventos })));
const Operacoes        = lazy(() => import('./Operacoes').then(m => ({ default: m.Operacoes })));
const MapaMental       = lazy(() => import('./MapaMental').then(m => ({ default: m.MapaMental })));
const Financeiro       = lazy(() => import('./Financeiro').then(m => ({ default: m.Financeiro })));
const Balanco          = lazy(() => import('./Balanco').then(m => ({ default: m.Balanco })));
const FinanceiroCFO    = lazy(() => import('./FinanceiroCFO').then(m => ({ default: m.FinanceiroCFO })));
const Cobranca         = lazy(() => import('./Cobranca').then(m => ({ default: m.Cobranca })));
const FunilLancamento  = lazy(() => import('./FunilLancamento').then(m => ({ default: m.FunilLancamento })));
const DisparosMonitor  = lazy(() => import('./DisparosMonitor').then(m => ({ default: m.DisparosMonitor })));
const AquecimentoChips = lazy(() => import('./AquecimentoChips').then(m => ({ default: m.AquecimentoChips })));
const Pessoas = lazy(() => import('./Pessoas').then(m => ({ default: m.Pessoas })));
const LancamentoKanban = lazy(() => import('./LancamentoKanban').then(m => ({ default: m.LancamentoKanban })));
const NPAKanban        = lazy(() => import('./NPAKanban'));
const IDMPsiFranquias   = lazy(() => import('./IDMPsiFranquias').then(m => ({ default: m.IDMPsiFranquias })));
const Posts             = lazy(() => import('./Posts').then(m => ({ default: m.Posts })));
const Parceiros         = lazy(() => import('./Parceiros').then(m => ({ default: m.Parceiros })));
const Equipe11ds        = lazy(() => import('./Equipe11ds').then(m => ({ default: m.Equipe11ds })));
const TimeComercial      = lazy(() => import('./TimeComercial').then(m => ({ default: m.TimeComercial })));

function ModuleLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function RestrictedView() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-3">
        <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground">
            Este colaborador não tem permissão para visualizar esta área.
          </p>
        </div>
      </div>
    </div>
  );
}

export function CRMLayout() {
  const { user } = useAuth();

  // Um canal de realtime para o sistema inteiro: traduz mudanca no banco em invalidacao
  // de cache. Antes cada tela abria o seu, e o do Dashboard escutava tres tabelas que nem
  // estavam publicadas no realtime — nunca disparou.
  useRealtimeInvalidation();

  const permissions = user?.permissions ?? getDefaultPermissions(user?.tipo);
  // A matriz do banco e a autoridade; `permissions` e so a projecao dela (sprint 1.2).
  const matrix = user?.permissionMatrix;
  const isAdmin = user?.tipo === 'admin';
  const [currentView, setCurrentView] = useState<View>(() => {
    try { return (localStorage.getItem('crm_last_view') as View) || 'dashboard'; }
    catch { return 'dashboard'; }
  });
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lancamentoId, setLancamentoId] = useState<string | null>(null);
  const [loadingLancamento, setLoadingLancamento] = useState(false);
  const [npaEventoId, setNpaEventoId] = useState<string | null>(null);
  const [loadingNpaEvento, setLoadingNpaEvento] = useState(false);

  const handleEditLead = (lead: Lead) => { setEditingLead(lead); setIsLeadModalOpen(true); };

  useEffect(() => {
    try { localStorage.setItem('crm_last_view', currentView); } catch {}
  }, [currentView]);

  useEffect(() => {
    if (!canAccessView(currentView, permissions, Boolean(isAdmin), matrix)) {
      setCurrentView(firstAllowedView(permissions, Boolean(isAdmin), permissions.allowedLancamentoIds));
    }
  }, [currentView, permissions, isAdmin]);

  useEffect(() => {
    const loadLancamentoId = async () => {
      if (typeof currentView === 'string' && currentView.startsWith('lancamentos_')) {
        setLoadingLancamento(true);
        const possibleId = currentView.replace('lancamentos_', '');
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(possibleId)) {
          setLancamentoId(possibleId);
        } else {
          const { data } = await supabase
            .from('lancamentos')
            .select('id')
            .ilike('nome', `%${possibleId}%`)
            .single();
          if (data) setLancamentoId(data.id);
        }
        setLoadingLancamento(false);
      }
    };
    loadLancamentoId();
  }, [currentView]);

  useEffect(() => {
    const loadNpaEventoId = async () => {
      if (typeof currentView === 'string' && currentView.startsWith('npa_') && currentView !== 'npa_overview') {
        setLoadingNpaEvento(true);
        const possibleId = currentView.replace('npa_', '');
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(possibleId)) {
          setNpaEventoId(possibleId);
        } else {
          const { data } = await supabase
            .from('npa_eventos')
            .select('id')
            .ilike('nome', `%${possibleId}%`)
            .single();
          if (data) setNpaEventoId(data.id);
        }
        setLoadingNpaEvento(false);
      }
    };
    loadNpaEventoId();
  }, [currentView]);

  const renderView = () => {
    if (!canAccessView(currentView, permissions, Boolean(isAdmin), matrix)) {
      return <RestrictedView />;
    }

    if (typeof currentView === 'string' && currentView.startsWith('lancamentos_')) {
      if (loadingLancamento) {
        return (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        );
      }
      if (!lancamentoId) {
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-muted-foreground">Lançamento não encontrado</p>
            </div>
          </div>
        );
      }
      return <LancamentoKanban lancamentoId={lancamentoId} />;
    }

    if (typeof currentView === 'string' && currentView.startsWith('npa_') && currentView !== 'npa_overview') {
      if (loadingNpaEvento) {
        return (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        );
      }
      if (!npaEventoId) {
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-muted-foreground">Evento NPA não encontrado</p>
            </div>
          </div>
        );
      }
      return <NPAKanban npaEventoId={npaEventoId} />;
    }

    if (typeof currentView === 'string' && currentView.startsWith('financeiro_aluno_')) {
      return <Financeiro initialAlunoId={currentView.replace('financeiro_aluno_', '')} />;
    }

    switch (currentView) {
      case 'dashboard': return <Dashboard />;
      case 'pessoas':  return <Pessoas />;
      case 'time_comercial': return <TimeComercial />;
      case 'npa_overview': return <NPAEventos onOpenEvento={(id) => setCurrentView(`npa_${id}` as View)} />;
      case 'financeiro': return <Financeiro />;
      case 'financeiro_cfo': return <FinanceiroCFO />;
      case 'balanco': return <Balanco />;
      case 'cobranca':         return permissions.canViewCobranca || isAdmin ? <Cobranca /> : <RestrictedView />;
      case 'funil_lancamento':  return permissions.canViewCobranca || isAdmin ? <FunilLancamento /> : <RestrictedView />;
      case 'disparos_monitor':  return permissions.canViewCobranca || isAdmin
        ? <DisparosMonitor
            onCreateFunnel={() => setCurrentView('funil_lancamento')}
            onNavigateToAluno={(alunoId) => setCurrentView(`financeiro_aluno_${alunoId}` as View)}
          />
        : <RestrictedView />;
      case 'chat_conversas':  return permissions.canViewCobranca || isAdmin
        ? <DisparosMonitor
            initialMainTab="chat"
            onCreateFunnel={() => setCurrentView('funil_lancamento')}
            onNavigateToAluno={(alunoId) => setCurrentView(`financeiro_aluno_${alunoId}` as View)}
          />
        : <RestrictedView />;
      case 'aquecimento_chips': return isAdmin ? <AquecimentoChips /> : <RestrictedView />;
      case 'team': return user?.tipo === 'admin' || permissions.canViewTeam ? <TeamManagement /> : <RestrictedView />;
      case 'settings': return permissions.canViewSettings || isAdmin ? <Settings /> : <RestrictedView />;
      case 'operacoes_tarefas': return <Operacoes currentPage={currentView} />;
      case 'operacoes_calendario_geral': return <Operacoes currentPage={currentView} />;
      case 'operacoes_calendario_conteudo': return <Operacoes currentPage={currentView} />;
      case 'mapa_mental': return <MapaMental />;
      case 'posts': return isAdmin ? <Posts /> : <RestrictedView />;
      case 'parceiros': return isAdmin ? <Parceiros /> : <RestrictedView />;
      case 'equipe_11ds': return isAdmin
        ? <Equipe11ds onNavigateToPosts={() => setCurrentView('posts')} onNavigateToAluno={(alunoId) => setCurrentView(`financeiro_aluno_${alunoId}` as View)} />
        : <RestrictedView />;
      case 'franquia_psi': return <IDMPsiFranquias />;
      default: return <Dashboard />;
    }
  };

  // A ficha da pessoa fica montada aqui, uma vez, para qualquer tela poder abrir pelo
  // hook `useFichaPessoa()`. Antes ela existia e so a tela Pessoas conseguia abrir — na
  // pratica o pulo entre modulos que ela deveria acabar continuava acontecendo.
  return (
    <FichaPessoaProvider>
    <div className="min-h-screen bg-white">
      <Header onOpenMobileMenu={() => setMobileMenuOpen(true)} />
      <div className="flex h-[calc(100vh-4rem)]">
        <Sidebar
          currentView={currentView}
          onViewChange={setCurrentView}
          mobileMenuOpen={mobileMenuOpen}
          onMobileMenuOpenChange={setMobileMenuOpen}
        />
        <main className="flex-1 overflow-auto pb-16 lg:pb-0">
          <Suspense fallback={<ModuleLoader />}>{renderView()}</Suspense>
        </main>
      </div>
      <MobileNav currentView={currentView} onViewChange={setCurrentView} onOpenMore={() => setMobileMenuOpen(true)} />
      <LeadModal isOpen={isLeadModalOpen} onClose={() => setIsLeadModalOpen(false)} editingLead={editingLead} />
      {(permissions.canViewCobranca || isAdmin) && <ChatWidget />}
    </div>
    </FichaPessoaProvider>
  );
}
