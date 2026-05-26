import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Lead, PipelineStage, Curso, Fonte, CRMConfig, CURSOS_PADRAO, FONTES_PADRAO, HistoricoItem } from '@/types/crm';
import { useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { validateWebhookUrl } from '@/lib/webhook';

interface LeadsContextType {
  leads: Lead[];
  cursos: Curso[];
  fontes: Fonte[];
  config: CRMConfig;
  loading: boolean;
  addLead: (lead: Omit<Lead, 'id' | 'criadoEm' | 'atualizadoEm' | 'historico' | 'criadoPorId'>) => Promise<Lead | null>;
  updateLead: (id: string, data: Partial<Lead>, acao?: string) => Promise<void>;
  deleteLead: (id: string) => Promise<void>;
  changeStage: (id: string, newStage: PipelineStage) => Promise<void>;
  getLeadsByStage: (stage: PipelineStage) => Lead[];
  getVisibleLeads: () => Lead[];
  addCurso: (nome: string, valorPadrao?: number) => Promise<void>;
  deleteCurso: (id: string) => Promise<void>;
  addFonte: (nome: string) => Promise<void>;
  deleteFonte: (id: string) => Promise<void>;
  updateConfig: (config: Partial<CRMConfig>) => Promise<void>;
  sendWebhook: (action: string, lead: Lead) => Promise<void>;
}

const LeadsContext = createContext<LeadsContextType | undefined>(undefined);

// Helper to convert database row to Lead object
function dbRowToLead(row: any): Lead {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email || '',
    telefone: row.telefone,
    dataNascimento: row.data_nascimento || undefined,
    cpf: row.cpf || undefined,
    cidade: row.cidade || undefined,
    estado: row.estado || undefined,
    formacaoAcademica: row.formacao_academica || undefined,
    areaAtuacao: row.area_atuacao || undefined,
    jaFezPsicanalise: row.ja_fez_psicanalise || false,
    cursoInteresse: row.curso_interesse,
    comoConheceu: row.como_conheceu,
    valorInvestimento: row.valor_investimento || undefined,
    formaPagamento: row.forma_pagamento || undefined,
    etapa: row.etapa as PipelineStage,
    responsavelId: row.responsavel_id || '',
    proximaAcao: row.proxima_acao || undefined,
    dataProximaAcao: row.data_proxima_acao || undefined,
    observacoes: row.observacoes || undefined,
    criadoPorId: row.criado_por_id || '',
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    convertidoEm: row.convertido_em || undefined,
    historico: Array.isArray(row.historico) ? row.historico : [],
    boasVindas: row.boas_vindas || undefined,
    tempoInteresse: row.tempo_interesse || undefined,
    objetivoPrincipal: row.objetivo_principal || undefined,
    engajamento: row.engajamento || undefined,
    followup01: row.followup_01 || undefined,
    followup02: row.followup_02 || undefined,
    followup03: row.followup_03 || undefined,
    closser: row.closser || undefined,
    ultimaMensagem: row.ultima_mensagem || undefined,
    linkDePagamentoEnviado: row.link_de_pagamento_enviado || undefined,
    mensagemLead: row.mensagem_lead || undefined,
    mensagemIa: row.mensagem_ia || undefined,
  };
}

// Determine which pipeline stage a lead should be in based on its data
function computeAutoStage(row: any): PipelineStage {
  if (row.followup_03 || row.followup03) return 'follow_up_03';
  if (row.followup_02 || row.followup02) return 'follow_up_02';
  if (row.followup_01 || row.followup01) return 'follow_up_01';
  if ((row.closser || '').toUpperCase() === 'SIM') return 'closer';
  if ((row.boas_vindas || row.boasVindas || '').toUpperCase() === 'SIM') return 'sdr';
  return row.etapa as PipelineStage;
}

// Helper to convert Lead to database insert/update object
function leadToDbRow(lead: Partial<Lead>): Record<string, any> {
  const row: Record<string, any> = {};
  
  if (lead.nome !== undefined) row.nome = lead.nome;
  if (lead.email !== undefined) row.email = lead.email || null;
  if (lead.telefone !== undefined) row.telefone = lead.telefone;
  if (lead.dataNascimento !== undefined) row.data_nascimento = lead.dataNascimento || null;
  if (lead.cpf !== undefined) row.cpf = lead.cpf || null;
  if (lead.cidade !== undefined) row.cidade = lead.cidade || null;
  if (lead.estado !== undefined) row.estado = lead.estado || null;
  if (lead.formacaoAcademica !== undefined) row.formacao_academica = lead.formacaoAcademica || null;
  if (lead.areaAtuacao !== undefined) row.area_atuacao = lead.areaAtuacao || null;
  if (lead.jaFezPsicanalise !== undefined) row.ja_fez_psicanalise = lead.jaFezPsicanalise;
  if (lead.cursoInteresse !== undefined) row.curso_interesse = lead.cursoInteresse;
  if (lead.comoConheceu !== undefined) row.como_conheceu = lead.comoConheceu;
  if (lead.valorInvestimento !== undefined) row.valor_investimento = lead.valorInvestimento ?? null;
  if (lead.formaPagamento !== undefined) row.forma_pagamento = lead.formaPagamento || null;
  if (lead.etapa !== undefined) row.etapa = lead.etapa;
  if (lead.responsavelId !== undefined) row.responsavel_id = lead.responsavelId || null;
  if (lead.proximaAcao !== undefined) row.proxima_acao = lead.proximaAcao || null;
  if (lead.dataProximaAcao !== undefined) row.data_proxima_acao = lead.dataProximaAcao || null;
  if (lead.observacoes !== undefined) row.observacoes = lead.observacoes || null;
  if (lead.criadoPorId !== undefined) row.criado_por_id = lead.criadoPorId || null;
  if (lead.convertidoEm !== undefined) row.convertido_em = lead.convertidoEm || null;
  if (lead.historico !== undefined) row.historico = lead.historico;
  if (lead.boasVindas !== undefined) row.boas_vindas = lead.boasVindas || null;
  if (lead.tempoInteresse !== undefined) row.tempo_interesse = lead.tempoInteresse || null;
  if (lead.objetivoPrincipal !== undefined) row.objetivo_principal = lead.objetivoPrincipal || null;
  if (lead.engajamento !== undefined) row.engajamento = lead.engajamento || null;
  if (lead.followup01 !== undefined) row.followup_01 = lead.followup01 || null;
  if (lead.followup02 !== undefined) row.followup_02 = lead.followup02 || null;
  if (lead.followup03 !== undefined) row.followup_03 = lead.followup03 || null;
  if (lead.closser !== undefined) row.closser = lead.closser || null;
  if (lead.ultimaMensagem !== undefined) row.ultima_mensagem = lead.ultimaMensagem || null;
  if (lead.linkDePagamentoEnviado !== undefined) row.link_de_pagamento_enviado = lead.linkDePagamentoEnviado || null;
  if (lead.mensagemLead !== undefined) row.mensagem_lead = lead.mensagemLead || null;
  if (lead.mensagemIa !== undefined) row.mensagem_ia = lead.mensagemIa || null;
  
  return row;
}

export function LeadsProvider({ children }: { children: ReactNode }) {
  const { user, getUserById } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [fontes, setFontes] = useState<Fonte[]>([]);
  const [config, setConfig] = useState<CRMConfig>({});
  const [loading, setLoading] = useState(true);

  // Load data from Supabase — 4 queries em paralelo
  const loadData = useCallback(async () => {
    if (!user) {
      setLeads([]);
      setCursos([]);
      setFontes([]);
      setConfig({});
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [
        { data: leadsData,  error: leadsError  },
        { data: cursosData, error: cursosError },
        { data: fontesData, error: fontesError },
        { data: configData, error: configError },
      ] = await Promise.all([
        supabase.from('leads').select('*').order('criado_em', { ascending: false }),
        supabase.from('cursos').select('*').order('nome'),
        supabase.from('fontes').select('*').order('nome'),
        supabase.from('crm_config').select('*').limit(1).maybeSingle(),
      ]);

      // Leads
      if (leadsError) {
        console.error('Error loading leads:', leadsError);
      } else {
        setLeads((leadsData || []).map(row => {
          const lead = dbRowToLead(row);
          lead.etapa = computeAutoStage(row);
          return lead;
        }));
      }

      // Cursos
      if (cursosError) {
        console.error('Error loading cursos:', cursosError);
      } else if (cursosData && cursosData.length > 0) {
        setCursos(cursosData.map(c => ({ id: c.id, nome: c.nome, valorPadrao: c.valor_padrao || undefined })));
      } else {
        await Promise.all(CURSOS_PADRAO.map(nome => supabase.from('cursos').insert({ nome })));
        const { data: newCursosData } = await supabase.from('cursos').select('*').order('nome');
        if (newCursosData) {
          setCursos(newCursosData.map(c => ({ id: c.id, nome: c.nome, valorPadrao: c.valor_padrao || undefined })));
        }
      }

      // Fontes
      if (fontesError) {
        console.error('Error loading fontes:', fontesError);
      } else if (fontesData && fontesData.length > 0) {
        setFontes(fontesData.map(f => ({ id: f.id, nome: f.nome })));
      } else {
        await Promise.all(FONTES_PADRAO.map(nome => supabase.from('fontes').insert({ nome })));
        const { data: newFontesData } = await supabase.from('fontes').select('*').order('nome');
        if (newFontesData) {
          setFontes(newFontesData.map(f => ({ id: f.id, nome: f.nome })));
        }
      }

      // Config
      if (configError) {
        console.error('Error loading config:', configError);
      } else if (configData) {
        setConfig({
          webhookOut: configData.webhook_out || undefined,
          webhookIn: configData.webhook_in || undefined,
        });
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime subscription for leads table
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('leads-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newLead = dbRowToLead(payload.new);
            newLead.etapa = computeAutoStage(payload.new);
            setLeads((prev) => {
              if (prev.some((l) => l.id === newLead.id)) return prev;
              return [newLead, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = dbRowToLead(payload.new);
            updated.etapa = computeAutoStage(payload.new);
            setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as any)?.id;
            if (oldId) setLeads((prev) => prev.filter((l) => l.id !== oldId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Clear localStorage data on load to migrate away from insecure storage
  useEffect(() => {
    // Remove old localStorage data for security
    localStorage.removeItem('onze-leads');
    localStorage.removeItem('onze-courses');
    localStorage.removeItem('onze-sources');
    localStorage.removeItem('onze-config');
  }, []);

  const createHistoricoItem = (acao: string, detalhes?: string): HistoricoItem => ({
    id: `hist-${Date.now()}`,
    acao,
    usuarioId: user?.id || '',
    usuarioNome: user?.nome || 'Sistema',
    data: new Date().toISOString(),
    detalhes,
  });

  const addLead = async (leadData: Omit<Lead, 'id' | 'criadoEm' | 'atualizadoEm' | 'historico' | 'criadoPorId'>): Promise<Lead | null> => {
    const historico = [createHistoricoItem('Lead criado')];
    
    const dbRow = leadToDbRow({
      ...leadData,
      criadoPorId: user?.id || '',
      historico,
    });

    const { data, error } = await supabase
      .from('leads')
      // @ts-ignore - historico is JSONB in DB, types may not match perfectly
      .insert(dbRow)
      .select()
      .single();

    if (error) {
      console.error('Error adding lead:', error);
      return null;
    }

    const newLead = dbRowToLead(data);
    setLeads((prev) => [newLead, ...prev]);
    sendWebhook('lead_created', newLead);
    return newLead;
  };

  const updateLead = async (id: string, data: Partial<Lead>, acao?: string): Promise<void> => {
    const existingLead = leads.find((l) => l.id === id);
    if (!existingLead) return;

    const now = new Date().toISOString();

    const historico = acao ? [...existingLead.historico, createHistoricoItem(acao)] : existingLead.historico;

    const dbRow = leadToDbRow({
      ...data,
      historico,
    });

    // keep DB "atualizado_em" in sync
    dbRow.atualizado_em = now;

    const { error } = await supabase
      .from('leads')
      // @ts-ignore - historico is JSONB in DB, types may not match perfectly
      .update(dbRow)
      .eq('id', id);

    if (error) {
      console.error('Error updating lead:', error);
      throw error;
    }

    const updatedLead: Lead = {
      ...existingLead,
      ...data,
      atualizadoEm: now,
      historico,
    };

    setLeads((prev) => prev.map((lead) => (lead.id === id ? updatedLead : lead)));

    if (acao) {
      sendWebhook('lead_updated', updatedLead);
    }
  };

  const deleteLead = async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting lead:', error);
      return;
    }

    setLeads((prev) => prev.filter((lead) => lead.id !== id));
  };

  const changeStage = async (id: string, newStage: PipelineStage): Promise<void> => {
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;
    if (lead.etapa === newStage) return;

    const now = new Date().toISOString();
    const isConversion = newStage === 'matricula' && lead.etapa !== 'matricula';

    const historicoItem = createHistoricoItem(`Etapa alterada para "${newStage}"`);
    const optimistic: Lead = {
      ...lead,
      etapa: newStage,
      ...(isConversion ? { convertidoEm: now } : {}),
      atualizadoEm: now,
      historico: [...lead.historico, historicoItem],
    };

    // Optimistic UI so the card moves immediately.
    setLeads((prev) => prev.map((l) => (l.id === id ? optimistic : l)));

    const dbRow = leadToDbRow({
      etapa: newStage,
      ...(isConversion ? { convertidoEm: now } : {}),
      historico: optimistic.historico,
    });
    dbRow.atualizado_em = now;

    const { error } = await supabase
      .from('leads')
      // @ts-ignore - historico is JSONB in DB, types may not match perfectly
      .update(dbRow)
      .eq('id', id);

    if (error) {
      console.error('Error changing stage:', error);
      // revert optimistic change
      setLeads((prev) => prev.map((l) => (l.id === id ? lead : l)));
      throw error;
    }

    // Webhooks
    sendWebhook('lead_updated', optimistic);
    if (isConversion) {
      sendWebhook('lead_converted', optimistic);
    }
  };

  const getLeadsByStage = (stage: PipelineStage): Lead[] => {
    return getVisibleLeads().filter((lead) => lead.etapa === stage);
  };

  const getVisibleLeads = (): Lead[] => {
    // RLS handles visibility at the database level
    // This is now just for local state filtering
    return leads;
  };

  const addCurso = async (nome: string, valorPadrao?: number): Promise<void> => {
    const { data, error } = await supabase
      .from('cursos')
      .insert({ nome, valor_padrao: valorPadrao })
      .select()
      .single();

    if (error) {
      console.error('Error adding curso:', error);
      return;
    }

    setCursos((prev) => [...prev, {
      id: data.id,
      nome: data.nome,
      valorPadrao: data.valor_padrao || undefined,
    }]);
  };

  const deleteCurso = async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('cursos')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting curso:', error);
      return;
    }

    setCursos((prev) => prev.filter((c) => c.id !== id));
  };

  const addFonte = async (nome: string): Promise<void> => {
    const { data, error } = await supabase
      .from('fontes')
      .insert({ nome })
      .select()
      .single();

    if (error) {
      console.error('Error adding fonte:', error);
      return;
    }

    setFontes((prev) => [...prev, {
      id: data.id,
      nome: data.nome,
    }]);
  };

  const deleteFonte = async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('fontes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting fonte:', error);
      return;
    }

    setFontes((prev) => prev.filter((f) => f.id !== id));
  };

  const updateConfig = async (newConfig: Partial<CRMConfig>): Promise<void> => {
    // Normalize + validate webhook URLs before persisting
    const normalizedWebhookOut = newConfig.webhookOut !== undefined ? validateWebhookUrl(newConfig.webhookOut) : undefined;
    const normalizedWebhookIn = newConfig.webhookIn !== undefined ? validateWebhookUrl(newConfig.webhookIn) : undefined;

    const updatedConfig: CRMConfig = {
      ...config,
      ...newConfig,
      ...(normalizedWebhookOut !== undefined ? { webhookOut: normalizedWebhookOut || undefined } : {}),
      ...(normalizedWebhookIn !== undefined ? { webhookIn: normalizedWebhookIn || undefined } : {}),
    };

    // Check if config exists
    const { data: existingConfig } = await supabase
      .from('crm_config')
      .select('id')
      .limit(1)
      .single();

    const dbConfig = {
      webhook_out: updatedConfig.webhookOut || null,
      webhook_in: updatedConfig.webhookIn || null,
    };

    if (existingConfig) {
      const { error } = await supabase
        .from('crm_config')
        .update(dbConfig)
        .eq('id', existingConfig.id);

      if (error) {
        console.error('Error updating config:', error);
        throw error;
      }
    } else {
      const { error } = await supabase
        .from('crm_config')
        .insert(dbConfig);

      if (error) {
        console.error('Error inserting config:', error);
        throw error;
      }
    }

    setConfig(updatedConfig);
  };

  const sendWebhook = async (action: string, lead: Lead) => {
    const url = config.webhookOut ? validateWebhookUrl(config.webhookOut) : '';
    if (!url) return;

    const responsavel = getUserById(lead.responsavelId);

    const payload = {
      action,
      lead: {
        id: lead.id,
        nome: lead.nome,
        email: lead.email,
        telefone: lead.telefone,
        curso_interesse: lead.cursoInteresse,
        etapa: lead.etapa,
        responsavel: responsavel?.nome || '',
        valor: lead.valorInvestimento,
        fonte: lead.comoConheceu,
      },
      timestamp: new Date().toISOString(),
      usuario: user?.email || '',
    };

    try {
      // Keep no-cors so common automation tools work without CORS configuration.
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        mode: 'no-cors',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Webhook error:', error);
    }
  };

  return (
    <LeadsContext.Provider
      value={{
        leads,
        cursos,
        fontes,
        config,
        loading,
        addLead,
        updateLead,
        deleteLead,
        changeStage,
        getLeadsByStage,
        getVisibleLeads,
        addCurso,
        deleteCurso,
        addFonte,
        deleteFonte,
        updateConfig,
        sendWebhook,
      }}
    >
      {children}
    </LeadsContext.Provider>
  );
}

export function useLeads() {
  const context = useContext(LeadsContext);
  if (!context) {
    throw new Error('useLeads must be used within LeadsProvider');
  }
  return context;
}
