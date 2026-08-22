import { describe, it, expect } from 'vitest';
import {
  canAccessView,
  permissionsFromMatrix,
  permissionsToToggles,
  matrixFromRows,
  getDefaultPermissions,
  type PermissionMatrix,
} from './access-control';

/**
 * Regras de acesso — a parte do sistema onde um erro silencioso é mais caro.
 *
 * Estes casos vieram de coisas encontradas na base real durante a sprint 1:
 * duas parceiras enxergando o Financeiro, um usuário sem papel definido com acesso a
 * Configurações, e telas que respondiam `false` fixo em vez de consultar a permissão.
 * Cada teste aqui existe porque a situação aconteceu de verdade.
 */

const matriz = (pares: Record<string, boolean>): PermissionMatrix =>
  Object.fromEntries(Object.entries(pares).map(([recurso, ver]) => [recurso, { ver }]));

describe('canAccessView com a matriz do banco', () => {
  it('nega recurso ausente da matriz — deny-by-default', () => {
    const m = matriz({ dashboard: true });
    const p = permissionsFromMatrix(m);

    expect(canAccessView('financeiro', p, false, m)).toBe(false);
    expect(canAccessView('recurso_que_nao_existe', p, false, m)).toBe(false);
  });

  it('libera exatamente o que a matriz diz', () => {
    const m = matriz({ time_comercial: true, financeiro: false });
    const p = permissionsFromMatrix(m);

    expect(canAccessView('time_comercial', p, false, m)).toBe(true);
    expect(canAccessView('financeiro', p, false, m)).toBe(false);
  });

  it('as três views de Operações caem no mesmo recurso', () => {
    const m = matriz({ operacoes: true });
    const p = permissionsFromMatrix(m);

    for (const view of [
      'operacoes_tarefas',
      'operacoes_calendario_geral',
      'operacoes_calendario_conteudo',
    ]) {
      expect(canAccessView(view, p, false, m), view).toBe(true);
    }
  });

  it('npa_overview usa o recurso npa', () => {
    const m = matriz({ npa: true });
    const p = permissionsFromMatrix(m);
    expect(canAccessView('npa_overview', p, false, m)).toBe(true);
  });

  it('libera telas que antes eram false fixo, quando a matriz permite', () => {
    // Produtos, Posts, Parceiros e Equipe 11DS respondiam `false` no mapa antigo, o que
    // obrigava a promover alguém a admin só para dar acesso a uma delas.
    const m = matriz({ produtos: true, posts: true });
    const p = permissionsFromMatrix(m);

    expect(canAccessView('produtos', p, false, m)).toBe(true);
    expect(canAccessView('posts', p, false, m)).toBe(true);
    expect(canAccessView('parceiros', p, false, m)).toBe(false);
  });

  it('sem matriz carregada, cai no modelo antigo em vez de trancar todo mundo pra fora', () => {
    const p = getDefaultPermissions('admin');
    expect(canAccessView('dashboard', p, false)).toBe(true);
  });
});

describe('permissionsFromMatrix', () => {
  it('ver_todos vem da ação ver_todos, não da ver', () => {
    // Falha real da sprint 1.2: só a ação `ver` foi migrada, e `can_view_all_*` virou
    // letra morta — a investidora com escopo de 2 turmas passou a enxergar tudo.
    const m: PermissionMatrix = {
      financeiro: { ver: true, ver_todos: false },
      lancamentos: { ver: true, ver_todos: true },
    };
    const p = permissionsFromMatrix(m);

    expect(p.canViewFinanceiro).toBe(true);
    expect(p.canViewAllFinanceiroTurmas).toBe(false);
    expect(p.canViewAllLancamentos).toBe(true);
  });

  it('escopo por registro entra por fora, não pela matriz', () => {
    const p = permissionsFromMatrix({ financeiro: { ver: true } }, 'vendedor', {
      allowedFinanceiroTurmaIds: ['turma-a', 'turma-b'],
    });
    expect(p.allowedFinanceiroTurmaIds).toEqual(['turma-a', 'turma-b']);
  });
});

describe('matrixFromRows', () => {
  it('agrupa as ações do mesmo recurso', () => {
    const m = matrixFromRows([
      { recurso: 'financeiro', acao: 'ver', permitido: true },
      { recurso: 'financeiro', acao: 'editar', permitido: false },
    ]);
    expect(m.financeiro).toEqual({ ver: true, editar: false });
  });

  it('lista vazia ou nula vira matriz vazia, não explode', () => {
    expect(matrixFromRows([])).toEqual({});
    expect(matrixFromRows(null)).toEqual({});
  });
});

describe('permissionsToToggles', () => {
  it('as três telas de Cobrança seguem a permissão de Cobrança', () => {
    const p = permissionsFromMatrix({ cobranca: { ver: true } });
    const toggles = permissionsToToggles(p);

    for (const recurso of ['funil_lancamento', 'disparos_monitor', 'chat_conversas']) {
      const t = toggles.find(x => x.recurso === recurso && x.acao === 'ver');
      expect(t?.permitido, recurso).toBe(true);
    }
  });

  it('ida e volta pela matriz preserva o conjunto de permissões', () => {
    const original = permissionsFromMatrix({
      dashboard: { ver: true },
      financeiro: { ver: true, ver_todos: true },
      cobranca: { ver: false },
      settings: { ver: false },
    });

    const m: PermissionMatrix = {};
    for (const t of permissionsToToggles(original)) {
      (m[t.recurso] ??= {})[t.acao as 'ver' | 'ver_todos'] = t.permitido;
    }
    const volta = permissionsFromMatrix(m);

    expect(volta.canViewDashboard).toBe(original.canViewDashboard);
    expect(volta.canViewFinanceiro).toBe(original.canViewFinanceiro);
    expect(volta.canViewAllFinanceiroTurmas).toBe(original.canViewAllFinanceiroTurmas);
    expect(volta.canViewCobranca).toBe(original.canViewCobranca);
    expect(volta.canViewSettings).toBe(original.canViewSettings);
  });
});
