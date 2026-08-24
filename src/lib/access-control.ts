export interface AccessPermissions {
  canViewDashboard: boolean;
  canViewLancamentos: boolean;
  canViewAllLancamentos: boolean;
  allowedLancamentoIds: string[];
  canViewNpa: boolean;
  canViewFinanceiro: boolean;
  canViewFinanceiroCfo: boolean;
  canViewAllFinanceiroTurmas: boolean;
  allowedFinanceiroTurmaIds: string[];
  canViewBalanco: boolean;
  canViewCobranca: boolean;
  canViewOperacoes: boolean;
  canViewMapaMental: boolean;
  canViewRodrygo: boolean;
  canViewTeam: boolean;
  canViewSettings: boolean;
  canViewTimeComercial: boolean;
  canViewFranquiaPsi: boolean;
}

// --- Matriz de acesso vinda do banco ---------------------------------------
// A partir da sprint 1.2 quem manda e a matriz `app_recursos x role_permissoes x
// user_permissao_override`, lida pelas RPC `minhas_permissoes()` / `permissoes_efetivas()`.
// `AccessPermissions` continua existindo como projecao dela, pra nao reescrever os
// consumidores de uma vez -- mas nao e mais a fonte da verdade.

export type PermissionAction = 'ver' | 'editar' | 'excluir' | 'ver_todos';

export type PermissionMatrix = Record<string, Partial<Record<PermissionAction, boolean>>>;

export interface PermissionRow {
  recurso: string;
  acao: string;
  permitido: boolean;
}

export function matrixFromRows(rows: PermissionRow[] | null | undefined): PermissionMatrix {
  const matrix: PermissionMatrix = {};
  for (const row of rows ?? []) {
    (matrix[row.recurso] ??= {})[row.acao as PermissionAction] = row.permitido;
  }
  return matrix;
}

const podeVer = (matrix: PermissionMatrix, recurso: string, fallback: boolean) =>
  matrix[recurso]?.ver ?? fallback;

/**
 * Projeta a matriz no formato antigo. As duas listas de escopo por registro
 * (allowed*Ids) nao vivem na matriz -- continuam em `user_access_permissions` ate a
 * sprint 1.3 tratar escopo por dono -- entao vem por fora.
 */
export function permissionsFromMatrix(
  matrix: PermissionMatrix,
  role?: string,
  escopo?: { allowedLancamentoIds?: string[]; allowedFinanceiroTurmaIds?: string[] },
): AccessPermissions {
  const d = getDefaultPermissions(role);
  return {
    canViewDashboard:            podeVer(matrix, 'dashboard',      d.canViewDashboard),
    canViewLancamentos:          podeVer(matrix, 'lancamentos',    d.canViewLancamentos),
    canViewAllLancamentos:       matrix['lancamentos']?.ver_todos ?? d.canViewAllLancamentos,
    allowedLancamentoIds:        escopo?.allowedLancamentoIds     ?? d.allowedLancamentoIds,
    canViewNpa:                  podeVer(matrix, 'npa',            d.canViewNpa),
    canViewFinanceiro:           podeVer(matrix, 'financeiro',     d.canViewFinanceiro),
    canViewFinanceiroCfo:        podeVer(matrix, 'financeiro_cfo', d.canViewFinanceiroCfo),
    canViewAllFinanceiroTurmas:  matrix['financeiro']?.ver_todos  ?? d.canViewAllFinanceiroTurmas,
    allowedFinanceiroTurmaIds:   escopo?.allowedFinanceiroTurmaIds ?? d.allowedFinanceiroTurmaIds,
    canViewBalanco:              podeVer(matrix, 'balanco',        d.canViewBalanco),
    canViewCobranca:             podeVer(matrix, 'cobranca',       d.canViewCobranca),
    canViewOperacoes:            podeVer(matrix, 'operacoes',      d.canViewOperacoes),
    canViewMapaMental:           podeVer(matrix, 'mapa_mental',    d.canViewMapaMental),
    canViewRodrygo:              podeVer(matrix, 'rodrygo',        d.canViewRodrygo),
    canViewTeam:                 podeVer(matrix, 'team',           d.canViewTeam),
    canViewSettings:             podeVer(matrix, 'settings',       d.canViewSettings),
    canViewTimeComercial:        podeVer(matrix, 'time_comercial', d.canViewTimeComercial),
    canViewFranquiaPsi:          podeVer(matrix, 'franquia_psi',   d.canViewFranquiaPsi),
  };
}

/** Converte o formato antigo em chamadas de `definir_permissao` (recurso, acao, valor). */
export function permissionsToToggles(permissions: AccessPermissions): PermissionRow[] {
  return [
    { recurso: 'dashboard',        acao: 'ver',       permitido: permissions.canViewDashboard },
    { recurso: 'lancamentos',      acao: 'ver',       permitido: permissions.canViewLancamentos },
    { recurso: 'lancamentos',      acao: 'ver_todos', permitido: permissions.canViewAllLancamentos },
    { recurso: 'npa',              acao: 'ver',       permitido: permissions.canViewNpa },
    { recurso: 'financeiro',       acao: 'ver',       permitido: permissions.canViewFinanceiro },
    { recurso: 'financeiro',       acao: 'ver_todos', permitido: permissions.canViewAllFinanceiroTurmas },
    { recurso: 'financeiro_cfo',   acao: 'ver',       permitido: permissions.canViewFinanceiroCfo },
    { recurso: 'balanco',          acao: 'ver',       permitido: permissions.canViewBalanco },
    { recurso: 'cobranca',         acao: 'ver',       permitido: permissions.canViewCobranca },
    // as tres telas abaixo seguem a permissao de Cobranca, como em canAccessView
    { recurso: 'funil_lancamento', acao: 'ver',       permitido: permissions.canViewCobranca },
    { recurso: 'disparos_monitor', acao: 'ver',       permitido: permissions.canViewCobranca },
    { recurso: 'chat_conversas',   acao: 'ver',       permitido: permissions.canViewCobranca },
    { recurso: 'operacoes',        acao: 'ver',       permitido: permissions.canViewOperacoes },
    { recurso: 'mapa_mental',      acao: 'ver',       permitido: permissions.canViewMapaMental },
    { recurso: 'rodrygo',          acao: 'ver',       permitido: permissions.canViewRodrygo },
    { recurso: 'team',             acao: 'ver',       permitido: permissions.canViewTeam },
    { recurso: 'settings',         acao: 'ver',       permitido: permissions.canViewSettings },
    { recurso: 'time_comercial',   acao: 'ver',       permitido: permissions.canViewTimeComercial },
    { recurso: 'franquia_psi',     acao: 'ver',       permitido: permissions.canViewFranquiaPsi },
  ];
}

/** Uma tela pode ser varias views (Operacoes tem tres). Aqui elas viram um recurso so. */
const RECURSO_POR_VIEW: Record<string, string> = {
  npa_overview:                  'npa',
  lancamentos_overview:          'lancamentos',
  operacoes_tarefas:             'operacoes',
  operacoes_calendario_geral:    'operacoes',
  operacoes_calendario_conteudo: 'operacoes',
};

export type AppView =
  | 'dashboard' | 'npa_overview' | 'lancamentos_overview' | 'financeiro' | 'financeiro_cfo' | 'balanco' | 'rodrygo'
  | 'lancamentos_30' | 'lancamentos_31' | 'lancamentos_32'
  | 'team' | 'settings' | 'cobranca' | 'funil_lancamento' | 'disparos_monitor' | 'chat_conversas'
  | 'operacoes_tarefas' | 'operacoes_calendario_geral' | 'operacoes_calendario_conteudo'
  | 'mapa_mental' | 'franquia_psi' | 'posts' | 'parceiros' | 'equipe_11ds'
  | 'aquecimento_chips' | 'time_comercial' | 'pessoas';

export const DEFAULT_NON_ADMIN_PERMISSIONS: AccessPermissions = {
  canViewDashboard: true,
  canViewLancamentos: true,
  canViewAllLancamentos: true,
  allowedLancamentoIds: [],
  canViewNpa: true,
  canViewFinanceiro: true,
  canViewFinanceiroCfo: false,
  canViewAllFinanceiroTurmas: true,
  allowedFinanceiroTurmaIds: [],
  canViewBalanco: true,
  canViewCobranca: false,
  canViewOperacoes: true,
  canViewMapaMental: true,
  canViewRodrygo: true,
  canViewTeam: false,
  canViewSettings: false,
  canViewTimeComercial: true,
  canViewFranquiaPsi: true,
};

export const DEFAULT_ADMIN_PERMISSIONS: AccessPermissions = {
  ...DEFAULT_NON_ADMIN_PERMISSIONS,
  canViewCobranca: true,
  canViewTeam: true,
  canViewSettings: true,
  canViewTimeComercial: true,
};

export function getDefaultPermissions(role?: string): AccessPermissions {
  return role === 'admin' ? { ...DEFAULT_ADMIN_PERMISSIONS } : { ...DEFAULT_NON_ADMIN_PERMISSIONS };
}

export function normalizePermissionsRow(row: any, role?: string): AccessPermissions {
  const defaults = getDefaultPermissions(role);

  if (!row) return defaults;

  return {
    canViewDashboard: row.can_view_dashboard ?? defaults.canViewDashboard,
    canViewLancamentos: row.can_view_lancamentos ?? defaults.canViewLancamentos,
    canViewAllLancamentos: row.can_view_all_lancamentos ?? defaults.canViewAllLancamentos,
    allowedLancamentoIds: Array.isArray(row.allowed_lancamento_ids) ? row.allowed_lancamento_ids.filter(Boolean) : defaults.allowedLancamentoIds,
    canViewNpa: row.can_view_npa ?? defaults.canViewNpa,
    canViewFinanceiro: row.can_view_financeiro ?? defaults.canViewFinanceiro,
    canViewFinanceiroCfo: row.can_view_financeiro_cfo ?? defaults.canViewFinanceiroCfo,
    canViewAllFinanceiroTurmas: row.can_view_all_financeiro_turmas ?? defaults.canViewAllFinanceiroTurmas,
    allowedFinanceiroTurmaIds: Array.isArray(row.allowed_financeiro_turma_ids) ? row.allowed_financeiro_turma_ids.filter(Boolean) : defaults.allowedFinanceiroTurmaIds,
    canViewBalanco: row.can_view_balanco ?? defaults.canViewBalanco,
    canViewCobranca: row.can_view_cobranca ?? defaults.canViewCobranca,
    canViewOperacoes: row.can_view_operacoes ?? defaults.canViewOperacoes,
    canViewMapaMental: row.can_view_mapa_mental ?? defaults.canViewMapaMental,
    canViewRodrygo: row.can_view_rodrygo ?? defaults.canViewRodrygo,
    canViewTeam: row.can_view_team ?? defaults.canViewTeam,
    canViewSettings: row.can_view_settings ?? defaults.canViewSettings,
    canViewTimeComercial: row.can_view_time_comercial ?? defaults.canViewTimeComercial,
    canViewFranquiaPsi: row.can_view_franquia_psi ?? defaults.canViewFranquiaPsi,
  };
}

export function permissionsToRow(permissions: AccessPermissions) {
  return {
    can_view_dashboard: permissions.canViewDashboard,
    can_view_lancamentos: permissions.canViewLancamentos,
    can_view_all_lancamentos: permissions.canViewAllLancamentos,
    allowed_lancamento_ids: permissions.allowedLancamentoIds,
    can_view_npa: permissions.canViewNpa,
    can_view_financeiro: permissions.canViewFinanceiro,
    can_view_financeiro_cfo: permissions.canViewFinanceiroCfo,
    can_view_all_financeiro_turmas: permissions.canViewAllFinanceiroTurmas,
    allowed_financeiro_turma_ids: permissions.allowedFinanceiroTurmaIds,
    can_view_balanco: permissions.canViewBalanco,
    can_view_cobranca: permissions.canViewCobranca,
    can_view_operacoes: permissions.canViewOperacoes,
    can_view_mapa_mental: permissions.canViewMapaMental,
    can_view_rodrygo: permissions.canViewRodrygo,
    can_view_team: permissions.canViewTeam,
    can_view_settings: permissions.canViewSettings,
    can_view_time_comercial: permissions.canViewTimeComercial,
    can_view_franquia_psi: permissions.canViewFranquiaPsi,
  };
}

export function canAccessLancamento(permissions: AccessPermissions, lancamentoId: string) {
  return permissions.canViewLancamentos && (
    permissions.canViewAllLancamentos ||
    permissions.allowedLancamentoIds.includes(lancamentoId)
  );
}

export function canAccessFinanceiroTurma(permissions: AccessPermissions, turmaId: string) {
  return permissions.canViewFinanceiro && (
    permissions.canViewAllFinanceiroTurmas ||
    permissions.allowedFinanceiroTurmaIds.includes(turmaId)
  );
}

export function canAccessView(
  view: string,
  permissions: AccessPermissions,
  isAdmin: boolean,
  matrix?: PermissionMatrix,
) {
  if (isAdmin) return true;

  if (view === 'lancamentos_overview') return permissions.canViewLancamentos;

  if (view.startsWith('lancamentos_')) {
    const lancamentoId = view.replace('lancamentos_', '');
    return canAccessLancamento(permissions, lancamentoId);
  }

  if (view.startsWith('npa_')) return permissions.canViewNpa;
  if (view.startsWith('financeiro_aluno_')) return permissions.canViewFinanceiro;

  // Com a matriz carregada, o banco decide -- inclusive para as telas que antes eram
  // `false` fixo no mapa abaixo (produtos, posts, parceiros, equipe_11ds, ...), que agora
  // sao recursos de verdade e podem ser liberadas para um papel sem virar admin.
  if (matrix) {
    const recurso = RECURSO_POR_VIEW[view] ?? view;
    return matrix[recurso]?.ver ?? false;
  }

  const permissionByView: Partial<Record<AppView, boolean>> = {
    dashboard: permissions.canViewDashboard,
    time_comercial: permissions.canViewTimeComercial,
    npa_overview: permissions.canViewNpa,
    lancamentos_overview: permissions.canViewLancamentos,
    financeiro: permissions.canViewFinanceiro,
    financeiro_cfo: permissions.canViewFinanceiroCfo,
    balanco: permissions.canViewBalanco,
    cobranca:          permissions.canViewCobranca,
    funil_lancamento:  permissions.canViewCobranca,
    disparos_monitor:  permissions.canViewCobranca,
    chat_conversas:    permissions.canViewCobranca,
    rodrygo:          permissions.canViewRodrygo,
    team: permissions.canViewTeam,
    settings: permissions.canViewSettings,
    operacoes_tarefas: permissions.canViewOperacoes,
    operacoes_calendario_geral: permissions.canViewOperacoes,
    operacoes_calendario_conteudo: permissions.canViewOperacoes,
    mapa_mental: permissions.canViewMapaMental,
    posts: false, // admin-only — isAdmin check at top of function already handles it
    parceiros: false, // admin-only — isAdmin check at top of function already handles it
    equipe_11ds: false, // admin-only — isAdmin check at top of function already handles it
    franquia_psi: permissions.canViewFranquiaPsi,
    aquecimento_chips: false, // admin-only — isAdmin check at top of function already handles it
  };

  return permissionByView[view as AppView] ?? false; // deny-by-default para views não mapeadas
}

export function firstAllowedView(permissions: AccessPermissions, isAdmin: boolean, allowedLaunchIds: string[]) {
  if (isAdmin || permissions.canViewDashboard) return 'dashboard' as AppView;
  if (permissions.canViewTimeComercial) return 'time_comercial';
  if (permissions.canViewLancamentos && allowedLaunchIds.length > 0) return `lancamentos_${allowedLaunchIds[0]}` as AppView;
  if (permissions.canViewNpa) return 'npa_overview';
  if (permissions.canViewFinanceiro) return 'financeiro';
  if (permissions.canViewFranquiaPsi) return 'franquia_psi';
  return 'dashboard';
}
