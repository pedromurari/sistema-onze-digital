-- Regras canônicas por conta financeira. Não removemos as regras antigas por rótulo:
-- elas continuam atendendo baixas legadas que ainda informam `canal_cobranca`, enquanto
-- estas cobrem a interface atual, que registra `conta_recebimento` com um enum estável.
--
-- A migration é idempotente pela chave única (produto, forma, gateway, faixa mínima).
insert into public.payment_method_rates (
  produto_slug,
  forma_pagamento,
  gateway,
  percentual,
  fixo_por_transacao,
  faixa_min,
  faixa_max,
  ativo
)
values
  ('*', 'boleto', 'asaas',          0.00, 1.99, 0, 999999.99, true),
  ('*', 'pix',    'asaas',          0.00, 1.99, 0, 999999.99, true),
  ('*', 'boleto', 'voomp',          5.90, 0.00, 0, 999999.99, true),
  ('*', 'pix',    'mercado_pago',   0.99, 0.00, 0, 999999.99, true),
  ('*', 'cartao', 'mercado_pago',   4.98, 0.00, 0, 999999.99, true)
on conflict (produto_slug, forma_pagamento, gateway, faixa_min)
do update set
  percentual = excluded.percentual,
  fixo_por_transacao = excluded.fixo_por_transacao,
  faixa_max = excluded.faixa_max,
  ativo = excluded.ativo,
  updated_at = now();
