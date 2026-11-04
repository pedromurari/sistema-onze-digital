import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { Plus } from 'lucide-react';

// Componentes extraídos
import { CalendarioGeralView } from './operacoes/CalendarioGeralView';
import { CalendarioConteudoView } from './operacoes/CalendarioConteudoView';
import { TarefaModal } from './operacoes/TarefaModal';

// Interfaces simplificadas
interface Tarefa {
  id: string;
  titulo: string;
  descricao?: string;
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  status: 'pendente' | 'em_andamento' | 'concluida' | 'cancelada';
  progresso: number;
  prazo?: string;
  responsavel_id?: string;
  created_at: string;
  updated_at: string;
}

interface Lancamento {
  id: string;
  nome: string;
  data_inicio?: string;
  data_fim?: string;
}

interface NPAEvento {
  id: string;
  nome: string;
  data_inicio?: string;
  data_fim?: string;
}

interface EventoCalendario {
  id: string;
  titulo: string;
  descricao?: string;
  data_inicio: string;
  data_fim?: string;
  cor: string;
}

interface Turma {
  id: string;
  nome: string;
  data_inicio?: string;
  produto?: string;
}

interface ConteudoCalendario {
  id: string;
  titulo: string;
  plataforma: string | null;
  formato?: string | null;
  data_publicacao: string | null;
  status: string | null;
  legenda?: string | null;
  observacoes?: string | null;
  link?: string | null;
}

interface Usuario {
  id: string;
  nome: string;
  email: string;
}

interface OperacoesProps {
  currentPage?: string;
}

type OperacoesTab = 'calendario_geral' | 'calendario_conteudo';

export function Operacoes({ currentPage }: OperacoesProps) {
  const { user } = useAuth();
  const activeTab: OperacoesTab = currentPage === 'operacoes_calendario_geral' ? 'calendario_geral' : 'calendario_conteudo';

  // Estados principais
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [npaEventos, setNpaEventos] = useState<NPAEvento[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [eventosCalendario, setEventosCalendario] = useState<EventoCalendario[]>([]);
  const [conteudoCalendario, setConteudoCalendario] = useState<ConteudoCalendario[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados dos modais
  const [showTarefaModal, setShowTarefaModal] = useState(false);
  const [selectedTarefa, setSelectedTarefa] = useState<Tarefa | null>(null);
  const [conteudoCreateRequest, setConteudoCreateRequest] = useState(0);

  // Carregar dados
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Carregar tarefas
      const tarefasRes = await supabase.from('tarefas').select('id, titulo, descricao, status, prioridade, responsavel_id, responsaveis, prazo, categoria, pagina, tipo, tags, created_at, updated_at').order('created_at', { ascending: false }).limit(200);
      if (tarefasRes.data) setTarefas(tarefasRes.data);

      // Carregar eventos do calendário
      const eventosRes = await supabase.from('eventos_calendario').select('id, titulo, descricao, data_inicio, data_fim, cor, tipo, created_by').limit(200);
      if (eventosRes.data) setEventosCalendario(eventosRes.data);

      // Carregar conteúdo do calendário
      const conteudoRes = await supabase.from('conteudo_calendario').select('id, titulo, plataforma, formato, responsavel, status, data_publicacao, legenda, texto_peca, link, observacoes, imagem_url, created_by').order('data_publicacao', { ascending: true }).limit(200);
      if (conteudoRes.data) setConteudoCalendario(conteudoRes.data);

      // Carregar usuários
      try {
        const usuariosRes = await supabase.from('profiles').select('id, nome, email');
        if (usuariosRes.data) {
          setUsuarios(usuariosRes.data);
        } else {
          // Tentar tabela 'equipe' se 'profiles' não funcionar
          const equipeRes = await supabase.from('equipe').select('id, nome, email');
          setUsuarios(equipeRes.data ?? []);
        }
      } catch (error) {
        try {
          // Tentar tabela 'equipe' como fallback
          const equipeRes = await supabase.from('equipe').select('id, nome, email');
          setUsuarios(equipeRes.data ?? []);
        } catch (equipeError) {
          console.warn('Não foi possível carregar usuários de profiles ou equipe:', equipeError);
          setUsuarios([]);
        }
      }

      // Carregar lançamentos e NPA (se existirem)
      // Bug real (2026-09-06): lancamentos.data_live e npa_eventos.data_evento
      // eram buscados mas NUNCA mapeados pra data_inicio, que é o campo que
      // CalendarioGeralView realmente lê -- essas duas categorias nunca
      // apareciam no calendário, mesmo com registros reais no banco.
      try {
        const lancamentosRes = await supabase.from('lancamentos').select('id, nome, status, ativo, data_live').limit(50);
        if (lancamentosRes.data) {
          setLancamentos(lancamentosRes.data.map(l => ({ id: l.id, nome: l.nome, data_inicio: l.data_live ?? undefined })));
        }
      } catch (error) {
        setLancamentos([]);
      }

      try {
        const npaRes = await supabase.from('npa_eventos').select('id, nome, status, ativo, data_evento').limit(50);
        if (npaRes.data) {
          setNpaEventos(npaRes.data.map(n => ({ id: n.id, nome: n.nome, data_inicio: n.data_evento ?? undefined })));
        }
      } catch (error) {
        setNpaEventos([]);
      }

      // Turmas reais (psicanálise/PNL/numerologia) -- antes não apareciam no
      // calendário de jeito nenhum, exigindo recriar cada turma manualmente
      // como "evento avulso" pra ela mostrar aqui.
      try {
        const turmasRes = await supabase.from('turmas').select('id, nome, data_inicio, produto').not('data_inicio', 'is', null).limit(200);
        if (turmasRes.data) setTurmas(turmasRes.data);
      } catch (error) {
        setTurmas([]);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao carregar dados' });
    } finally {
      setLoading(false);
    }
  };

  const getPriorityHexColor = (prioridade: string) => {
    switch (prioridade) {
      case 'baixa': return '#10b981';
      case 'media': return '#f59e0b';
      case 'alta': return '#f97316';
      case 'urgente': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const handleOpenTarefaDetail = (tarefa: Tarefa) => {
    setSelectedTarefa(tarefa);
    setShowTarefaModal(true);
  };

  const handleSaveTarefa = () => {
    loadData();
    setShowTarefaModal(false);
    setSelectedTarefa(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header: título + botão de ação */}
      <div className="flex justify-between items-center p-6 border-b">
        <div>
          <h1 className="text-2xl font-bold">{activeTab === 'calendario_geral' ? 'Calendário Geral' : 'Calendário de Conteúdo'}</h1>
          <p className="text-sm text-muted-foreground">{activeTab === 'calendario_geral' ? 'Eventos, lançamentos, NPA e turmas' : 'Planejamento e produção de conteúdo'}</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'calendario_geral' && (
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" />Novo Evento
            </Button>
          )}
          {activeTab === 'calendario_conteudo' && (
            <Button className="bg-primary hover:bg-primary/90" onClick={() => setConteudoCreateRequest(value => value + 1)}>
              <Plus className="h-4 w-4 mr-2" />Novo Conteúdo
            </Button>
          )}
        </div>
      </div>

      {/* Cada calendário tem seu próprio acesso no menu lateral. */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'calendario_geral' ? (
            <CalendarioGeralView
              tarefas={tarefas}
              lancamentos={lancamentos}
              npaEventos={npaEventos}
              turmas={turmas}
              eventosCalendario={eventosCalendario}
              user={user}
              getPriorityHexColor={getPriorityHexColor}
              onOpenTarefaDetail={handleOpenTarefaDetail}
              onLoadData={loadData}
            />
        ) : (
            <CalendarioConteudoView
              conteudos={conteudoCalendario}
              onLoadData={loadData}
              createRequest={conteudoCreateRequest}
            />
        )}
      </div>

      {/* Modais */}
      <TarefaModal
        tarefa={selectedTarefa}
        isOpen={showTarefaModal}
        onClose={() => {
          setShowTarefaModal(false);
          setSelectedTarefa(null);
        }}
        onSave={handleSaveTarefa}
        usuarios={usuarios}
        user={user}
      />

    </div>
  );
}
