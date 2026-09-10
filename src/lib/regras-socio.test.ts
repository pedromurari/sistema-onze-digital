import { describe, expect, it } from 'vitest';
import { REGRAS_SOCIO_DEFAULT, normalizarRegrasSocio } from './regras-socio';

describe('normalizarRegrasSocio', () => {
  it('mantém o comportamento legado quando a coluna está vazia ou contém lixo', () => {
    expect(normalizarRegrasSocio({})).toEqual(REGRAS_SOCIO_DEFAULT);
    expect(normalizarRegrasSocio('inválido')).toEqual(REGRAS_SOCIO_DEFAULT);
    expect(REGRAS_SOCIO_DEFAULT.custo_dedicado_por_fornecedor).toContainEqual({
      match: 'google workspace',
      socio: 'rodrygo',
    });
  });

  it('mescla configuração parcial e preserva arrays vazios intencionais', () => {
    const regras = normalizarRegrasSocio({
      eventos_npa_pct_pedro: 65,
      professoras_por_proporcao_mensalidade: false,
      receita_outra_por_fornecedor: [],
    });

    expect(regras.eventos_npa_pct_pedro).toBe(65);
    expect(regras.professoras_por_proporcao_mensalidade).toBe(false);
    expect(regras.custo_fixo_pct_pedro).toBe(50);
    expect(regras.receita_outra_por_fornecedor).toEqual([]);
  });

  it('não deixa percentuais inválidos ou linhas malformadas atravessarem a fronteira JSONB', () => {
    const regras = normalizarRegrasSocio({
      custo_fixo_pct_pedro: 130,
      receita_outra_por_fornecedor: [
        { match: '  parceiro ', pct_pedro: '25' },
        { match: '', pct_pedro: 90 },
      ],
      custo_dedicado_por_fornecedor: [
        { match: 'gateway x', socio: 'pedro' },
        { match: 'gateway y', socio: 'terceiro' },
      ],
    });

    expect(regras.custo_fixo_pct_pedro).toBe(50);
    expect(regras.receita_outra_por_fornecedor).toEqual([{ match: 'parceiro', pct_pedro: 25 }]);
    expect(regras.custo_dedicado_por_fornecedor).toEqual([{ match: 'gateway x', socio: 'pedro' }]);
  });
});
