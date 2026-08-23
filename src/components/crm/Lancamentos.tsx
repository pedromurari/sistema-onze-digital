import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ensureDefaultLancamentoKanbanColumns } from '@/components/crm/kanban/useKanbanColunas';
import { SaudeLancamentos } from '@/components/crm/lancamento/SaudeLancamentos';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import { Plus, Search, AlertCircle, Users, Target, CheckCircle, DollarSign, Loader2, Power } from 'lucide-react';
import { format } from 'date-fns';
import { isPagamentoRealizado } from '@/lib/financial-utils';
import { fetchAll } from '@/lib/db';

type LaunchStatus = 'planejamento' | 'em_andamento' | 'finalizado';
type LaunchPhase = 'planilha' | 'grupo_lancamento' | 'grupo_oferta' | 'follow_up_01' | 'follow_up_02' | 'follow_up_03' | 'matricula';

interface Launch {
  id: string;
  nome: string;
  data_live?: string;
  meta_matriculas: number;
  descricao?: string;
  status: LaunchStatus;
  ativo: boolean;
  created_at: string;
}

interface LaunchLead {
  id: string;
  lancamento_id: string;
  nome: string;
  whatsapp: string;
  email?: string;
  fase: LaunchPhase;
  no_grupo: boolean;
  grupo_oferta: boolean;
  follow_up_01?: string;
  follow_up_02?: string;
  follow_up_03?: string;
  matriculado: boolean;
  erro?: string;
  observacoes?: string;
  sheets_row_index?: number;
  responsavel_id?: string;
  created_at: string;
}

export function Lancamentos() {
  const { user, users } = useAuth();
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [currentLaunchId, setCurrentLaunchId] = useState<string | null>(null);
  const [launchLeads, setLaunchLeads] = useState<LaunchLead[]>([]);
  const [searchWhatsapp, setSearchWhatsapp] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [isCreatingLaunch, setIsCreatingLaunch] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({ nome: '', whatsapp: '', email: '' });
  const [newLaunchForm, setNewLaunchForm] = useState({
    nome: '',
    data_live: '',
    meta_matriculas: 0,
    descricao: '',
  });
  const [receitaRecebidaReal, setReceitaRecebidaReal] = useState(0);

  const vinicius = users.find(u => u.nome?.toLowerCase().includes('vinicius'));

  // Fetch launches
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('lancamentos')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (data) {
        setLaunches(data as Launch[]);
        if (data.length > 0 && !currentLaunchId) {
          setCurrentLaunchId(data[0].id);
        }
      }
      setLoading(false);
    };
    load();
  }, []);

  // Fetch launch leads when current launch changes
  useEffect(() => {
    if (!currentLaunchId) return;
    
    const load = async () => {
      // Pagina sempre: o maior lancamento tem 2.223 leads e o PostgREST corta em 1.000,
      // entao esta tela vinha mostrando pouco mais da metade sem avisar ninguem.
      const data = await fetchAll<LaunchLead>((de, ate) => supabase
        .from('lancamento_leads')
        .select('*')
        .eq('lancamento_id', currentLaunchId)
        .order('created_at', { ascending: false })
        .order('id')
        .range(de, ate) as never);

      setLaunchLeads(data);
    };
    load();

    // Real-time subscription
    const channel = supabase.channel(`launch-leads-${currentLaunchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamento_leads' }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentLaunchId]);

  // Receita real recebida: soma de pagamentos.valor (status='pago') dos alunos
  // matriculados a partir deste lançamento — diferente da estimativa por
  // preço-padrão × contagem (que é "contratado", não necessariamente recebido).
  useEffect(() => {
    if (!currentLaunchId) { setReceitaRecebidaReal(0); return; }
    const load = async () => {
      const { data: alunosDoLanc } = await supabase
        .from('alunos').select('id').eq('lancamento_id', currentLaunchId);
      const alunoIds = (alunosDoLanc || []).map(a => a.id);
      if (!alunoIds.length) { setReceitaRecebidaReal(0); return; }
      const { data: pags } = await supabase
        .from('pagamentos').select('valor, status, data_pagamento').in('aluno_id', alunoIds);
      const total = (pags || [])
        .filter(isPagamentoRealizado)
        .reduce((s, p) => s + (p.valor || 0), 0);
      setReceitaRecebidaReal(total);
    };
    load();
  }, [currentLaunchId]);

  const currentLaunch = launches.find(l => l.id === currentLaunchId);
  const filteredLeads = useMemo(() => {
    return launchLeads.filter(l => 
      searchWhatsapp === '' || l.whatsapp.includes(searchWhatsapp)
    );
  }, [launchLeads, searchWhatsapp]);

  const getLeadsByPhase = (phase: LaunchPhase) => {
    return filteredLeads.filter(l => l.fase === phase);
  };

  const phases: { id: LaunchPhase; label: string }[] = [
    { id: 'planilha', label: 'Planilha' },
    { id: 'grupo_lancamento', label: 'Grupo Lançamento' },
    { id: 'grupo_oferta', label: 'Grupo Oferta' },
    { id: 'follow_up_01', label: 'Follow Up 01' },
    { id: 'follow_up_02', label: 'Follow Up 02' },
    { id: 'follow_up_03', label: 'Follow Up 03' },
    { id: 'matricula', label: 'Matrícula' },
  ];

  const handleAddLead = async () => {
    if (!currentLaunchId || !newLeadForm.nome || !newLeadForm.whatsapp) return;
    
    setIsAddingLead(true);
    const { error } = await supabase.from('lancamento_leads').insert({
      lancamento_id: currentLaunchId,
      nome: newLeadForm.nome,
      whatsapp: newLeadForm.whatsapp,
      email: newLeadForm.email || null,
      fase: 'planilha',
      no_grupo: false,
      grupo_oferta: false,
      matriculado: false,
      responsavel_id: vinicius?.id,
      created_at: new Date().toISOString(),
    });

    if (!error) {
      setNewLeadForm({ nome: '', whatsapp: '', email: '' });
      const data = await fetchAll<LaunchLead>((de, ate) => supabase
        .from('lancamento_leads')
        .select('*')
        .eq('lancamento_id', currentLaunchId)
        .order('created_at', { ascending: false })
        .order('id')
        .range(de, ate) as never);
      setLaunchLeads(data);
    }
    setIsAddingLead(false);
  };

  const handleMoveLead = async (leadId: string, novaFase: LaunchPhase) => {
    const { error } = await supabase
      .from('lancamento_leads')
      .update({ fase: novaFase })
      .eq('id', leadId);

    if (!error) {
      setLaunchLeads(prev => prev.map(l => 
        l.id === leadId ? { ...l, fase: novaFase } : l
      ));
    }
  };

  const handleCreateLaunch = async () => {
    if (!newLaunchForm.nome) return;
    
    setIsCreatingLaunch(true);
    const { data, error } = await supabase.from('lancamentos').insert({
      nome: newLaunchForm.nome,
      data_live: newLaunchForm.data_live || null,
      meta_matriculas: newLaunchForm.meta_matriculas,
      descricao: newLaunchForm.descricao || null,
      status: 'planejamento',
      created_at: new Date().toISOString(),
    }).select().single();

    if (!error && data) {
      try {
        await ensureDefaultLancamentoKanbanColumns(data.id);
      } catch {
        // Mantemos a criação do lançamento mesmo se a semente falhar.
      }
      setLaunches([data as Launch, ...launches]);
      setCurrentLaunchId(data.id);
      setNewLaunchForm({ nome: '', data_live: '', meta_matriculas: 0, descricao: '' });
    }
    setIsCreatingLaunch(false);
  };

  const handleChangeLaunchStatus = async (novoStatus: LaunchStatus) => {
    if (!currentLaunchId) return;
    
    const { error } = await supabase
      .from('lancamentos')
      .update({ status: novoStatus })
      .eq('id', currentLaunchId);

    if (!error) {
      setLaunches(launches.map(l => 
        l.id === currentLaunchId ? { ...l, status: novoStatus } : l
      ));
    }
  };

  const handleToggleActive = async (launchId: string) => {
    const launch = launches.find(l => l.id === launchId);
    if (!launch) return;

    const { error } = await supabase
      .from('lancamentos')
      .update({ ativo: !launch.ativo })
      .eq('id', launchId);

    if (!error) {
      setLaunches(launches.map(l => 
        l.id === launchId ? { ...l, ativo: !l.ativo } : l
      ));
    }
  };

  // Metrics
  const totalLeads = launchLeads.length;
  const grupoLancamento = launchLeads.filter(l => l.no_grupo).length;
  const grupoOferta = launchLeads.filter(l => l.grupo_oferta).length;
  const matriculas = launchLeads.filter(l => l.matriculado).length;
  // Estimativa por preço-padrão × contagem de matriculados — NÃO é a soma real
  // de pagamentos.valor (ver receitaRecebidaReal, calculada à parte).
  const receitaEstimada = matriculas * 109.90;

  if (loading || !currentLaunch) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 pb-20 lg:pb-6 overflow-y-auto h-full bg-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Lançamentos</h1>
          <p className="text-sm text-muted-foreground">{currentLaunch.nome}</p>
        </div>
        <div className="flex gap-2">
          <Select value={currentLaunch.status} onValueChange={h => handleChangeLaunchStatus(h as LaunchStatus)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="planejamento">Planejamento</SelectItem>
              <SelectItem value="em_andamento">Em Andamento</SelectItem>
              <SelectItem value="finalizado">Finalizado</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant={currentLaunch.status === 'finalizado' ? 'destructive' : 'default'}>
            {currentLaunch.status === 'planejamento' && '📋 Planejamento'}
            {currentLaunch.status === 'em_andamento' && '🚀 Em Andamento'}
            {currentLaunch.status === 'finalizado' && '✅ Finalizado'}
          </Badge>
        </div>
      </div>

      {/* Fica invisível quando não há nada faltando nos lançamentos. */}
      <SaudeLancamentos />

      {/* Launches Selector Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-600 text-foreground">Lançamentos Disponíveis</h2>
            <p className="text-xs text-muted-foreground mt-1">Total: {launches.length} | Ativos: {launches.filter(l => l.ativo).length}</p>
          </div>
          <Dialog open={isCreatingLaunch} onOpenChange={setIsCreatingLaunch}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-green-600 hover:bg-green-700">
                <Plus className="h-4 w-4" />
                Novo Lançamento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Lançamento</DialogTitle>
                <DialogDescription>Crie um novo lançamento</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <input
                  placeholder="Nome (ex: #34 Lançamento)"
                  value={newLaunchForm.nome}
                  onChange={e => setNewLaunchForm({ ...newLaunchForm, nome: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <input
                  type="date"
                  value={newLaunchForm.data_live}
                  onChange={e => setNewLaunchForm({ ...newLaunchForm, data_live: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <input
                  type="number"
                  placeholder="Meta de matrículas"
                  value={newLaunchForm.meta_matriculas}
                  onChange={e => setNewLaunchForm({ ...newLaunchForm, meta_matriculas: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <textarea
                  placeholder="Descrição"
                  value={newLaunchForm.descricao}
                  onChange={e => setNewLaunchForm({ ...newLaunchForm, descricao: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <Button onClick={handleCreateLaunch} className="w-full">
                  Criar Lançamento
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Launches Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {launches.map(launch => {
            const statusColor = launch.status === 'finalizado' ? 'border-red-300 bg-red-50' :
                               launch.status === 'em_andamento' ? 'border-blue-300 bg-blue-50' :
                               'border-amber-300 bg-amber-50';
            
            const statusIcon = launch.status === 'finalizado' ? '✅' :
                              launch.status === 'em_andamento' ? '🚀' :
                              '📋';

            return (
              <div key={launch.id} className="relative group">
                <button
                  onClick={() => setCurrentLaunchId(launch.id)}
                  className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                    currentLaunchId === launch.id
                      ? 'border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-200'
                      : statusColor + ' hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-600 text-sm truncate">{launch.nome}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {launch.status === 'planejamento' && '📋 Planejamento'}
                        {launch.status === 'em_andamento' && '🚀 Em Andamento'}
                        {launch.status === 'finalizado' && '✅ Finalizado'}
                      </p>
                    </div>
                  </div>
                  
                  {/* Ativo/Inativo Badge */}
                  <div className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${launch.ativo ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <span className="text-xs font-500">
                      {launch.ativo ? '🟢 Ativo' : '⚫ Inativo'}
                    </span>
                  </div>
                </button>

                {/* Toggle Button */}
                <button
                  onClick={() => handleToggleActive(launch.id)}
                  className={`absolute -top-2 -right-2 p-2 rounded-full transition-all shadow-md opacity-0 group-hover:opacity-100 ${
                    launch.ativo
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : 'bg-gray-400 hover:bg-gray-500 text-white'
                  }`}
                  title={launch.ativo ? 'Desativar' : 'Ativar'}
                >
                  <Power className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-500 text-muted-foreground">Total de Leads</p>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{totalLeads}</p>
        </Card>
        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-500 text-muted-foreground">Grupo Lançamento</p>
            <Target className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold">{grupoLancamento}</p>
        </Card>
        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-500 text-muted-foreground">Grupo Oferta</p>
            <Target className="h-4 w-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold">{grupoOferta}</p>
        </Card>
        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-500 text-muted-foreground">Matrículas</p>
            <DollarSign className="h-4 w-4 text-green-500" />
          </div>
          <p className="text-2xl font-bold">{matriculas}</p>
          <p className="text-xs text-muted-foreground mt-1" title="Estimativa: matrículas × preço-padrão, não é soma de pagamentos reais">
            ~R$ {receitaEstimada.toLocaleString('pt-BR')} (estimado)
          </p>
        </Card>
        <Card className="p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-500 text-muted-foreground">Recebido (real)</p>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold">R$ {receitaRecebidaReal.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-muted-foreground mt-1">Soma de pagamentos pagos</p>
        </Card>
      </div>

      {/* Overlay when finalized */}
      {currentLaunch.status === 'finalizado' && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40 pointer-events-none">
          <div className="bg-white p-6 rounded-lg shadow-lg border-2 border-yellow-500 pointer-events-auto">
            <p className="font-600 text-lg">🔒 Lançamento Finalizado</p>
            <p className="text-sm text-muted-foreground mt-1">Este lançamento está em modo somente leitura</p>
          </div>
        </div>
      )}

      {/* Search and Add Lead */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por WhatsApp..."
            value={searchWhatsapp}
            onChange={e => setSearchWhatsapp(e.target.value)}
            className="pl-10"
          />
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="default" className="gap-2">
              <Plus className="h-4 w-4" />
              Adicionar Lead
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Lead</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <input
                placeholder="Nome"
                value={newLeadForm.nome}
                onChange={e => setNewLeadForm({ ...newLeadForm, nome: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
              <input
                placeholder="WhatsApp"
                value={newLeadForm.whatsapp}
                onChange={e => setNewLeadForm({ ...newLeadForm, whatsapp: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
              <input
                placeholder="Email (opcional)"
                value={newLeadForm.email}
                onChange={e => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
              <Button onClick={handleAddLead} disabled={isAddingLead} className="w-full">
                {isAddingLead ? 'Adicionando...' : 'Adicionar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Kanban Board */}
      <div className="overflow-x-auto">
        <div className="flex gap-4 min-w-full pb-4">
          {phases.map(phase => (
            <div key={phase.id} className="flex-shrink-0 w-80">
              <div className="bg-muted rounded-lg p-4 h-full">
                <div className="sticky top-0 bg-muted pb-3 mb-3 border-b">
                  <h3 className="font-600">{phase.label}</h3>
                  <Badge variant="secondary" className="text-xs mt-1">
                    {getLeadsByPhase(phase.id).length} leads
                  </Badge>
                </div>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {getLeadsByPhase(phase.id).map(lead => (
                    <div
                      key={lead.id}
                      className={`p-3 rounded-lg border ${
                        lead.erro
                          ? 'bg-red-50 border-red-200'
                          : lead.matriculado
                          ? 'bg-green-50 border-green-200'
                          : 'bg-white border-border'
                      } cursor-pointer hover:shadow-md transition-all`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="font-500 text-sm flex-1">{lead.nome}</span>
                        {lead.erro && (
                          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{lead.whatsapp}</p>
                      {lead.email && (
                        <p className="text-xs text-muted-foreground truncate">{lead.email}</p>
                      )}
                      
                      {/* Badges */}
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {lead.no_grupo && (
                          <Badge className="text-xs bg-amber-100 text-amber-700">Grupo</Badge>
                        )}
                        {lead.grupo_oferta && (
                          <Badge className="text-xs bg-purple-100 text-purple-700">Oferta</Badge>
                        )}
                        {lead.matriculado && (
                          <Badge className="text-xs bg-green-100 text-green-700">Matr.</Badge>
                        )}
                      </div>

                      {/* Move Select */}
                      <Select
                        value={lead.fase}
                        onValueChange={value => handleMoveLead(lead.id, value as LaunchPhase)}
                        disabled={currentLaunch.status === 'finalizado'}
                      >
                        <SelectTrigger className="mt-2 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {phases.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
