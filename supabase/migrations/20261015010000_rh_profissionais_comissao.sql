-- Campos estruturados de comissao pra profissional modelo 'comissao'/'hibrido'
-- (ex: vendedora) -- antes só dava pra guardar isso em texto livre nas
-- observacoes, pedido do Pedro 15/10/2026 pra ficar "bem elaborado".
-- Percentual, não valor fixo: comissao de vendedor aqui e % do LIQUIDO
-- (bruto menos taxa do gateway, nunca desconta imposto) -- confirmado pelo
-- Pedro depois de eu ter tentado com valor fixo primeiro. Nulos pra quem
-- não trabalha com comissão (ex: professor por aula).
alter table public.profissionais
  add column comissao_percentual_avista numeric(5,2) check (comissao_percentual_avista is null or comissao_percentual_avista between 0 and 100),
  add column comissao_percentual_boleto numeric(5,2) check (comissao_percentual_boleto is null or comissao_percentual_boleto between 0 and 100),
  add column comissao_meta1_faturamento numeric(12,2) check (comissao_meta1_faturamento is null or comissao_meta1_faturamento >= 0),
  add column comissao_meta1_bonus numeric(12,2) check (comissao_meta1_bonus is null or comissao_meta1_bonus >= 0),
  add column comissao_meta2_faturamento numeric(12,2) check (comissao_meta2_faturamento is null or comissao_meta2_faturamento >= 0),
  add column comissao_meta2_bonus numeric(12,2) check (comissao_meta2_bonus is null or comissao_meta2_bonus >= 0);
