import { describe, expect, it } from 'vitest';
import { MODULO_PILOTO } from './modulo-piloto';

describe('piloto do primeiro módulo', () => {
  it('tem cinco questões discursivas com gabarito e rubrica para revisão', () => {
    expect(MODULO_PILOTO.questoes).toHaveLength(5);
    for (const questao of MODULO_PILOTO.questoes) {
      expect(questao.enunciado.length).toBeGreaterThan(20);
      expect(questao.resposta_esperada.length).toBeGreaterThan(20);
      expect(questao.criterios_correcao).toContain('ponto');
    }
    expect(MODULO_PILOTO.instrucoes).toContain('REVISÃO');
  });
});
