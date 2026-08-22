// User types are now in AuthContext
// Re-export for backwards compatibility
export type { UserRole, AppUser as User } from '@/contexts/AuthContext';

export type PipelineStage = 
  | 'novo'
  | 'sdr'
  | 'closer'
  | 'matricula'
  | 'handoff_rodrygo'
  | 'follow_up_01'
  | 'follow_up_02'
  | 'follow_up_03'
  | 'aquecimento';

export type NPAPipelineStage =
  | 'novo_npa'
  | 'apresentacao'
  | 'proposta_enviada'
  | 'matricula_npa'
  | 'handoff_rodrygo_npa'
  | 'follow_up_01_npa'
  | 'follow_up_02_npa'
  | 'aquecimento_npa';

export interface Lead {
  id: string;
  /**
   * Vínculo com a pessoa canônica. Preenchido em 100% dos leads desde a sprint 3 — é o
   * que permite abrir a jornada completa de alguém a partir de qualquer tela.
   */
  pessoaId?: string | null;
  nome: string;
  email: string;
  telefone: string;
  dataNascimento?: string;
  cpf?: string;
  cidade?: string;
  estado?: string;
  formacaoAcademica?: string;
  areaAtuacao?: string;
  jaFezPsicanalise?: boolean;
  cursoInteresse: string;
  comoConheceu: string;
  valorInvestimento?: number;
  formaPagamento?: string;
  etapa: PipelineStage;
  responsavelId: string;
  proximaAcao?: string;
  dataProximaAcao?: string;
  observacoes?: string;
  criadoPorId: string;
  criadoEm: string;
  atualizadoEm: string;
  convertidoEm?: string;
  historico: HistoricoItem[];
  boasVindas?: string;
  tempoInteresse?: string;
  objetivoPrincipal?: string;
  engajamento?: string;
  followup01?: string;
  followup02?: string;
  followup03?: string;
  closser?: string;
  ultimaMensagem?: string;
  linkDePagamentoEnviado?: string;
  mensagemLead?: string;
  mensagemIa?: string;
}

export interface HistoricoItem {
  id: string;
  acao: string;
  usuarioId: string;
  usuarioNome: string;
  data: string;
  detalhes?: string;
}

export interface Curso {
  id: string;
  nome: string;
  valorPadrao?: number;
}

export interface Fonte {
  id: string;
  nome: string;
}

export interface CRMConfig {
  webhookOut?: string;
  webhookIn?: string;
}

export interface Task {
  id: string;
  titulo: string;
  descricao?: string;
  responsavel_id?: string;
  prazo?: string;
  prioridade: 'alta' | 'media' | 'baixa';
  categoria: string;
  produto: string;
  lancamento?: string;
  status: 'a_fazer' | 'em_andamento' | 'revisao' | 'concluido';
  video_url?: string;
  criado_por_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  tipo: string;
  titulo: string;
  descricao?: string;
  link?: string;
  lida: boolean;
  created_at: string;
}

export const PIPELINE_STAGES: { key: PipelineStage; label: string; color: string }[] = [
  { key: 'novo', label: 'Novo Lead', color: 'bg-pipeline-novo' },
  { key: 'sdr', label: 'SDR', color: 'bg-pipeline-sdr' },
  { key: 'closer', label: 'Closer', color: 'bg-pipeline-closer' },
  { key: 'matricula', label: 'Matrícula', color: 'bg-pipeline-matricula' },
  { key: 'handoff_rodrygo', label: 'Handoff → Rodrygo', color: 'bg-pipeline-handoff' },
  { key: 'follow_up_01', label: 'Follow Up 01', color: 'bg-pipeline-followup1' },
  { key: 'follow_up_02', label: 'Follow Up 02', color: 'bg-pipeline-followup2' },
  { key: 'follow_up_03', label: 'Follow Up 03 (Ligação)', color: 'bg-pipeline-followup3' },
  { key: 'aquecimento', label: 'Aquecimento', color: 'bg-pipeline-aquecimento' },
];

export const NPA_PIPELINE_STAGES: { key: NPAPipelineStage; label: string; color: string }[] = [
  { key: 'novo_npa', label: 'Novo Lead NPA', color: 'bg-muted-foreground' },
  { key: 'apresentacao', label: 'Apresentação', color: 'bg-pipeline-sdr' },
  { key: 'proposta_enviada', label: 'Proposta Enviada', color: 'bg-pipeline-closer' },
  { key: 'matricula_npa', label: 'Matrícula NPA', color: 'bg-pipeline-matricula' },
  { key: 'handoff_rodrygo_npa', label: 'Handoff → Rodrygo', color: 'bg-pipeline-handoff' },
  { key: 'follow_up_01_npa', label: 'Follow Up 01', color: 'bg-pipeline-followup1' },
  { key: 'follow_up_02_npa', label: 'Follow Up 02', color: 'bg-pipeline-followup2' },
  { key: 'aquecimento_npa', label: 'Aquecimento', color: 'bg-pipeline-aquecimento' },
];

export const FORMACOES = [
  'Ensino Médio',
  'Graduação',
  'Pós-graduação',
  'Mestrado',
  'Doutorado',
  'Outro',
];

export const CURSOS_PADRAO = [
  'Psicanálise Clínica',
  'Formação em Psicanálise',
  'Curso Livre de Psicanálise',
  'Especialização',
  'Supervisão Clínica',
  'Outro',
];

export const FONTES_PADRAO = [
  'WhatsApp',
  'Google Forms',
  'Site',
  'Instagram',
  'Facebook',
  'LinkedIn',
  'Indicação',
  'YouTube',
  'Google Ads',
  'Outro',
];

export const FORMAS_PAGAMENTO = [
  'Boleto 1+14',
  'Cartão 12x',
  'PIX à vista',
];

export const TASK_STATUS_COLUMNS = [
  { key: 'a_fazer' as const, label: 'A Fazer', icon: '📥' },
  { key: 'em_andamento' as const, label: 'Em Andamento', icon: '⚡' },
  { key: 'revisao' as const, label: 'Revisão', icon: '🔍' },
  { key: 'concluido' as const, label: 'Concluído', icon: '✅' },
];
