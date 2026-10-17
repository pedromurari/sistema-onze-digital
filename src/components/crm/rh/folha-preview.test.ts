import { describe, expect, it } from 'vitest';
import { calcularPreviaFolha } from './folha-preview';

describe('prévia de folha', () => {
  const profissional = { id: 'p1', nome: 'Professora', modelo_pagamento: 'por_aula', valor_por_aula: 150 };
  const aulas = [
    { id: 'a1', profissional_id: 'p1', data: '2026-10-01', status: 'realizada' },
    { id: 'a2', profissional_id: 'p1', data: '2026-10-02', status: 'agendada' },
    { id: 'a3', profissional_id: 'p1', data: '2026-10-03', status: 'realizada' },
    { id: 'a4', profissional_id: 'p1', data: '2026-10-04', status: 'cancelada' },
  ];

  it('conta somente aulas realizadas com presença positiva do professor vinculado', () => {
    const resultado = calcularPreviaFolha([profissional], aulas, [
      { aula_id: 'a1', profissional_id: 'p1', presente: true },
      { aula_id: 'a2', profissional_id: 'p1', presente: true },
      { aula_id: 'a3', profissional_id: 'p1', presente: false },
      { aula_id: 'a4', profissional_id: 'p1', presente: true },
    ])[0];
    expect(resultado.quantidade).toBe(1);
    expect(resultado.valorAulas).toBe(150);
  });

  it('não inventa valor para comissão ou tarifa ausente', () => {
    expect(calcularPreviaFolha([{ ...profissional, modelo_pagamento: 'comissao' }], aulas, [
      { aula_id: 'a1', profissional_id: 'p1', presente: true },
    ])[0].valorAulas).toBeNull();
    expect(calcularPreviaFolha([{ ...profissional, valor_por_aula: null }], aulas, [
      { aula_id: 'a1', profissional_id: 'p1', presente: true },
    ])[0].requerRevisao).toBe(true);
  });
});
