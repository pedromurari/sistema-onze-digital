import { useState, useEffect, lazy, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessView, firstAllowedView, getDefaultPermissions } from '@/lib/access-control';
import { Lead } from '@/types/crm';
import { Header } from './Header';
import { Sidebar, MobileNav, type View } from './Sidebar';
import { LeadModal } from './LeadModal';
import { FlashLeadModal } from './FlashLeadModal';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Lock } from 'lucide-react';

// Code splitting: cada módulo carrega só quando o usuário navega até ele
const Dashboard        = lazy(() => import('./Dashboard').then(m => ({ default: m.Dashboard })));
const Pipeline         = lazy(() => import('./Pipeline').then(m => ({ default: m.Pipeline })));
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
const Rodrygo          = lazy(() => import('./Rodrygo').then(m => ({ default: m.Rodrygo })));
const LancamentoKanban = lazy(() => import('./LancamentoKanban').then(m => ({ default: m.LancamentoKanban })));
const NPAKanban        = lazy(() => import('./NPAKanban'));
const AulaSecretaKanban = lazy(() => import('./AulaSecretaKanban').then(m => ({ default: m.AulaSecretaKanban })));
const Produtos          = lazy(() => import('./Produtos').then(m => ({ default: m.Produtos })));
const IDMPsiFranquias   = lazy(() => import('./IDMPsiFranquias').then(m => ({ default: m.IDMPsiFranquias })));
const Posts             = lazy(() => import('./Posts').then(m => ({ default: m.Posts })));
const Parceiros         = lazy(() => import('./Parceiros').then(m => ({ default: m.Parceiros })));
const Equipe11ds        = lazy(() => import('./Equipe11ds').then(m => ({ default: m.Equipe11ds })));
const ReelsIDM           = lazy(() => import('./ReelsIDM').then(m => ({ default: m.ReelsIDM })));

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
  const permissions = user?.permissions ?? getDefaultPermissions(user?.tipo);
  const isAdmin = user?.tipo === 'admin';
  const [currentView, setCurrentView] = useState<View>(() => {
    try { return (localStorage.getItem('crm_last_view') as View) || 'dashboard'; }
    catch { return 'dashboard'; }
  });
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [isFlashLeadModalOpen, setIsFlashLeadModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [lancamentoId, setLancamentoId] = useState<string | null>(null);
  const [loadingLancamento, setLoadingLancamento] = useState(false);
  const [npaEventoId, setNpaEventoId] = useState<string | null>(null);
  const [loadingNpaEvento, setLoadingNpaEvento] = useState(false);
  const [aulaSecretaId, setAulaSecretaId] = useState<string | null>(null);
  const [loadingAulaSecreta, setLoadingAulaSecreta] = useState(false);

  const handleAddLead = () => { setEditingLead(null); setIsLeadModalOpen(true); };
  const handleAddFlashLead = () => { setIsFlashLeadModalOpen(true); };
  const handleEditLead = (lead: Lead) => { setEditingLead(lead); setIsLeadModalOpen(true); };

  useEffect(() => {
    try { localStorage.setItem('crm_last_view', currentView); } catch {}
  }, [currentView]);

  useEffect(() => {
    if (!canAccessView(currentView, permissions, Boolean(isAdmin))) {
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
      if (typeof currentView === 'string' && currentView.startsWith('npa_')) {
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

  useEffect(() => {
    const loadAulaSecretaId = async () => {
      if (typeof currentView === 'string' && currentView.startsWith('aula_secreta_')) {
        setLoadingAulaSecreta(true);
        const possibleId = currentView.replace('aula_secreta_', '');
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(possibleId)) {
          setAulaSecretaId(possibleId);
        } else {
          const { data } = await supabase
            .from('aula_secreta_eventos')
            .select('id')
            .ilike('nome', `%${possibleId}%`)
            .single();
          if (data) setAulaSecretaId(data.id);
        }
        setLoadingAulaSecreta(false);
      }
    };
    loadAulaSecretaId();
  }, [currentView]);

  const renderView = () => {
    if (!canAccessView(currentView, permissions, Boolean(isAdmin))) {
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

    if (typeof currentView === 'string' && currentView.startsWith('npa_')) {
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

    if (typeof currentView === 'string' && currentView.startsWith('aula_secreta_')) {
      if (loadingAulaSecreta) {
        return (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        );
      }
      if (!aulaSecretaId) {
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-muted-foreground">Aula Secreta não encontrada</p>
            </div>
          </div>
        );
      }
      return <AulaSecretaKanban aulaSecretaId={aulaSecretaId} />;
    }

    if (typeof currentView === 'string' && currentView.startsWith('financeiro_aluno_')) {
      return <Financeiro initialAlunoId={currentView.replace('financeiro_aluno_', '')} />;
    }

    switch (currentView) {
      case 'dashboard': return <Dashboard />;
      case 'pipeline': return <Pipeline onEditLead={handleEditLead} />;
      case 'npa_overview': return <NPAEventos />;
      case 'financeiro': return <Financeiro />;
      case 'financeiro_cfo': return <FinanceiroCFO />;
      case 'balanco': return <Balanco />;
      case 'cobranca':         return permissions.canViewCobranca || isAdmin ? <Cobranca /> : <RestrictedView />;
      case 'funil_lancamento':  return permissions.canViewCobranca || isAdmin ? <FunilLancamento /> : <RestrictedView />;
      case 'disparos_monitor':  return permissions.canViewCobranca || isAdmin
        ? <DisparosMonitor onCreateFunnel={() => setCurrentView('funil_lancamento')} />
        : <RestrictedView />;
      case 'aquecimento_chips': return isAdmin ? <AquecimentoChips /> : <RestrictedView />;
      case 'rodrygo': return <Rodrygo />;
      case 'team': return user?.tipo === 'admin' || permissions.canViewTeam ? <TeamManagement /> : <RestrictedView />;
      case 'settings': return permissions.canViewSettings || isAdmin ? <Settings /> : <RestrictedView />;
      case 'operacoes_tarefas': return <Operacoes currentPage={currentView} />;
      case 'operacoes_calendario_geral': return <Operacoes currentPage={currentView} />;
      case 'operacoes_calendario_conteudo': return <Operacoes currentPage={currentView} />;
      case 'mapa_mental': return <MapaMental />;
      case 'produtos': return isAdmin ? <Produtos /> : <RestrictedView />;
      case 'posts': return isAdmin ? <Posts /> : <RestrictedView />;
      case 'parceiros': return isAdmin ? <Parceiros /> : <RestrictedView />;
      case 'equipe_11ds': return isAdmin
        ? <Equipe11ds onNavigateToPosts={() => setCurrentView('posts')} onNavigateToAluno={(alunoId) => setCurrentView(`financeiro_aluno_${alunoId}` as View)} />
        : <RestrictedView />;
      case 'franquia_psi': return <IDMPsiFranquias />;
      case 'reels_idm': return isAdmin ? <ReelsIDM /> : <RestrictedView />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Header onAddLead={handleAddLead} onAddFlashLead={handleAddFlashLead} />
      <div className="flex h-[calc(100vh-4rem)]">
        <Sidebar currentView={currentView} onViewChange={setCurrentView} />
        <main className="flex-1 overflow-auto pb-16 lg:pb-0">
          <Suspense fallback={<ModuleLoader />}>{renderView()}</Suspense>
        </main>
      </div>
      <MobileNav currentView={currentView} onViewChange={setCurrentView} />
      <LeadModal isOpen={isLeadModalOpen} onClose={() => setIsLeadModalOpen(false)} editingLead={editingLead} />
      <FlashLeadModal isOpen={isFlashLeadModalOpen} onClose={() => setIsFlashLeadModalOpen(false)} />
    </div>
  );
}
