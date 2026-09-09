import { describe, expect, it } from 'vitest';
import { CONTA_LABELS, CONTAS, getContaCor, getContaLabel, isConta } from './contas';

describe('contas', () => {
  it('mantém as seis contas na ordem operacional definida pelo financeiro', () => {
    expect(CONTAS.map(({ id }) => id)).toEqual([
      'inter', 'c6', 'mercado_pago', 'asaas', 'voomp', 'outro',
    ]);
  });

  it('valida somente identificadores canônicos', () => {
    expect(isConta('asaas')).toBe(true);
    expect(isConta('hotmart')).toBe(false);
    expect(isConta(null)).toBe(false);
  });

  it('expõe rótulos, cores e fallbacks consistentes', () => {
    expect(CONTA_LABELS.mercado_pago).toBe('Mercado Pago');
    expect(getContaLabel('c6')).toBe('C6 Bank');
    expect(getContaLabel(null)).toBe('Não informada');
    expect(getContaCor('inter')).toBe('#F97316');
    expect(getContaCor('legado')).toBe('#64748B');
  });
});
