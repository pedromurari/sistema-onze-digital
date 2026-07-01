export interface AccessPermissions {
  canViewDashboard: boolean;
  canViewPipeline: boolean;
  canViewLancamentos: boolean;
  canViewAllLancamentos: boolean;
  allowedLancamentoIds: string[];
  canViewNpa: boolean;
  canViewAulaSecreta: boolean;
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
}

export type AppView =
  | 'dashboard' | 'pipeline' | 'npa_overview' | 'financeiro' | 'financeiro_cfo' | 'balanco' | 'rodrygo'
  | 'lancamentos_30' | 'lancamentos_31' | 'lancamentos_32'
  | 'team' | 'settings' | 'cobranca' | 'funil_lancamento' | 'disparos_monitor'
  | 'operacoes_tarefas' | 'operacoes_calendario_geral' | 'operacoes_calendario_conteudo'
  | 'mapa_mental' | 'produtos' | 'franquia_psi';

export const DEFAULT_NON_ADMIN_PERMISSIONS: AccessPermissions = {
  canViewDashboard: true,
  canViewPipeline: true,
  canViewLancamentos: true,
  canViewAllLancamentos: true,
  allowedLancamentoIds: [],
  canViewNpa: true,
  canViewAulaSecreta: true,
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
};

export const DEFAULT_ADMIN_PERMISSIONS: AccessPermissions = {
  ...DEFAULT_NON_ADMIN_PERMISSIONS,
  canViewCobranca: true,
  canViewTeam: true,
  canViewSettings: true,
};

export function getDefaultPermissions(role?: string): AccessPermissions {
  return role === 'admin' ? { ...DEFAULT_ADMIN_PERMISSIONS } : { ...DEFAULT_NON_ADMIN_PERMISSIONS };
}

export function normalizePermissionsRow(row: any, role?: string): AccessPermissions {
  const defaults = getDefaultPermissions(role);

  if (!row) return defaults;

  return {
    canViewDashboard: row.can_view_dashboard ?? defaults.canViewDashboard,
    canViewPipeline: row.can_view_pipeline ?? defaults.canViewPipeline,
    canViewLancamentos: row.can_view_lancamentos ?? defaults.canViewLancamentos,
    canViewAllLancamentos: row.can_view_all_lancamentos ?? defaults.canViewAllLancamentos,
    allowedLancamentoIds: Array.isArray(row.allowed_lancamento_ids) ? row.allowed_lancamento_ids.filter(Boolean) : defaults.allowedLancamentoIds,
    canViewNpa: row.can_view_npa ?? defaults.canViewNpa,
    canViewAulaSecreta: row.can_view_aula_secreta ?? defaults.canViewAulaSecreta,
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
  };
}

export function permissionsToRow(permissions: AccessPermissions) {
  return {
    can_view_dashboard: permissions.canViewDashboard,
    can_view_pipeline: permissions.canViewPipeline,
    can_view_lancamentos: permissions.canViewLancamentos,
    can_view_all_lancamentos: permissions.canViewAllLancamentos,
    allowed_lancamento_ids: permissions.allowedLancamentoIds,
    can_view_npa: permissions.canViewNpa,
    can_view_aula_secreta: permissions.canViewAulaSecreta,
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

export function canAccessView(view: string, permissions: AccessPermissions, isAdmin: boolean) {
  if (isAdmin) return true;

  if (view.startsWith('lancamentos_')) {
    const lancamentoId = view.replace('lancamentos_', '');
    return canAccessLancamento(permissions, lancamentoId);
  }

  if (view.startsWith('npa_')) return permissions.canViewNpa;
  if (view.startsWith('aula_secreta_')) return permissions.canViewAulaSecreta;

  const permissionByView: Partial<Record<AppView, boolean>> = {
    dashboard: permissions.canViewDashboard,
    pipeline: permissions.canViewPipeline,
    npa_overview: permissions.canViewNpa,
    financeiro: permissions.canViewFinanceiro,
    financeiro_cfo: permissions.canViewFinanceiroCfo,
    balanco: permissions.canViewBalanco,
    cobranca:          permissions.canViewCobranca,
    funil_lancamento:  permissions.canViewCobranca,
    disparos_monitor:  permissions.canViewCobranca,
    rodrygo:          permissions.canViewRodrygo,
    team: permissions.canViewTeam,
    settings: permissions.canViewSettings,
    operacoes_tarefas: permissions.canViewOperacoes,
    operacoes_calendario_geral: permissions.canViewOperacoes,
    operacoes_calendario_conteudo: permissions.canViewOperacoes,
    mapa_mental: permissions.canViewMapaMental,
    produtos: false, // admin-only — isAdmin check at top of function already handles it
    franquia_psi: true,
  };

  return permissionByView[view as AppView] ?? false; // deny-by-default para views não mapeadas
}

export function firstAllowedView(permissions: AccessPermissions, isAdmin: boolean, allowedLaunchIds: string[]) {
  if (isAdmin || permissions.canViewDashboard) return 'dashboard' as AppView;
  if (permissions.canViewPipeline) return 'pipeline';
  if (permissions.canViewLancamentos && allowedLaunchIds.length > 0) return `lancamentos_${allowedLaunchIds[0]}` as AppView;
  if (permissions.canViewNpa) return 'npa_overview';
  if (permissions.canViewFinanceiro) return 'financeiro';
  return 'dashboard';
}
