-- Parâmetros da Análise CFO (DRE Gerencial, Ponto de Equilíbrio, CAC/LTV/Payback,
-- Saúde de Caixa) — 1 coluna jsonb em balanco_config, reaproveitando as 2 linhas
-- já existentes (onze_digital/idm) em vez de criar tabela nova.
--
-- Estrutura esperada do JSON (todos os campos com fallback no código se ausentes):
--   impostos_pct               numeric — alíquota efetiva sobre receita bruta
--   cac_estimado                numeric — CAC manual, usado quando não há gasto
--                                          'ads' lançado em balanco_itens no período
--   gross_margin_pct            numeric — margem bruta usada em payback/LTV
--   saldo_caixa_manual          numeric — saldo em caixa informado manualmente
--   saldo_caixa_atualizado_em   text (ISO date) — data do último input do saldo
--   reserva_emergencia_meta_meses numeric — meses de custo fixo para reserva ideal
ALTER TABLE public.balanco_config
  ADD COLUMN IF NOT EXISTS parametros_cfo JSONB NOT NULL DEFAULT '{}'::jsonb;
