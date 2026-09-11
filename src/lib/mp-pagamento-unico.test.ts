import { describe, expect, it } from 'vitest';
import {
  montarLinhaPagamentoUnico,
  taxaEfetivaMercadoPago,
} from '../../supabase/functions/_shared/mp-pagamento-unico';

describe('venda única do Mercado Pago no financeiro', () => {
  it('cartão parcelado vira uma única linha pelo total bruto', () => {
    const linha = montarLinhaPagamentoUnico(
      { id: 'aluno-1', turma_id: null, produto: 'psicanalise', forma_pagamento: 'cartao' },
      {
        id: 12345,
        transaction_amount: 1_021.46,
        installments: 12,
        date_approved: '2026-09-10T18:30:00-03:00',
        transaction_details: { net_received_amount: 970.59 },
      },
    );

    expect(linha).toMatchObject({
      aluno_id: 'aluno-1',
      valor: 1_021.46,
      numero_parcela: 1,
      status: 'pago',
      forma_pagamento: 'cartao',
      conta_recebimento: 'mercado_pago',
      mp_payment_id: '12345',
      data_pagamento: '2026-09-10',
      mes_referencia: '2026-09-01',
      taxa_valor: 50.87,
    });
    expect(linha.observacoes).toContain('12x no cartão');
  });

  it('Pix à vista também entra como pagamento único', () => {
    const linha = montarLinhaPagamentoUnico(
      { id: 'aluno-2', produto: 'psicanalise', forma_pagamento: 'avista' },
      { id: '987', transaction_amount: 997, installments: 1, date_created: '2026-09-09T23:50:00-03:00', fee_details: [{ amount: 9.87 }] },
    );

    expect(linha).toMatchObject({ valor: 997, forma_pagamento: 'avista', taxa_valor: 9.87 });
    expect(linha.observacoes).toContain('Pix à vista');
  });

  it('prefere bruto menos líquido e cai em fee_details quando o líquido não veio', () => {
    expect(taxaEfetivaMercadoPago({ transaction_amount: 100, transaction_details: { net_received_amount: 95.02 }, fee_details: [{ amount: 99 }] })).toBe(4.98);
    expect(taxaEfetivaMercadoPago({ transaction_amount: 100, fee_details: [{ amount: 3 }, { amount: 1.98 }] })).toBe(4.98);
    expect(taxaEfetivaMercadoPago({ transaction_amount: 100 })).toBeNull();
  });
});
