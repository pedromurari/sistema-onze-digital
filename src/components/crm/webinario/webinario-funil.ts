export const STAGES = ['registered', 'entered', 'watched_25', 'watched_50', 'watched_75', 'completed', 'cta_seen', 'offer_clicked'] as const;
export type WatchStage = typeof STAGES[number];
export const STAGE_LABEL: Record<WatchStage, string> = {
  registered: 'Cadastro', entered: 'Entrou na aula', watched_25: 'Assistiu 25%',
  watched_50: 'Assistiu 50%', watched_75: 'Assistiu 75%', completed: 'Concluiu',
  cta_seen: 'Viu a oferta', offer_clicked: 'Clicou na oferta',
};

export interface WebinarioLead {
  id: string;
  nome: string;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  status: string | null;
  vendedor: string | null;
  criado_em: string | null;
  pessoa_id: string | null;
}

export interface TrackingJoined {
  id: string;
  lead_id: string;
  watch_stage: WatchStage;
  updated_at: string;
  leads: WebinarioLead;
}

export interface LeadNoFunil {
  lead: WebinarioLead;
  stage: WatchStage;
  updatedAt: string;
}

export function consolidarLeads(linhas: TrackingJoined[]): LeadNoFunil[] {
  const porLead = new Map<string, LeadNoFunil>();
  for (const linha of linhas) {
    if (!linha.leads || !STAGES.includes(linha.watch_stage)) continue;
    const atual = porLead.get(linha.lead_id);
    if (!atual || STAGES.indexOf(linha.watch_stage) > STAGES.indexOf(atual.stage) ||
      (linha.watch_stage === atual.stage && linha.updated_at > atual.updatedAt)) {
      porLead.set(linha.lead_id, { lead: linha.leads, stage: linha.watch_stage, updatedAt: linha.updated_at });
    }
  }
  return [...porLead.values()].sort((a, b) => (b.lead.criado_em ?? '').localeCompare(a.lead.criado_em ?? ''));
}

export function funilAcumulado(leads: LeadNoFunil[]) {
  return STAGES.map((stage, index) => ({
    stage, label: STAGE_LABEL[stage],
    quantidade: leads.filter((item) => STAGES.indexOf(item.stage) >= index).length,
  }));
}

export function bucketKanban(stage: WatchStage): 'cadastro' | 'entrou' | 'interessado' {
  const rank = STAGES.indexOf(stage);
  return rank >= STAGES.indexOf('cta_seen') ? 'interessado' : rank >= 1 ? 'entrou' : 'cadastro';
}
