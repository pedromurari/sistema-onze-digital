-- Regras de atribuição do DRE por sócio (quem fica com cada receita/custo).
--
-- Hoje essas regras estão hardcoded em `financial-utils.ts::calcDrePorSocio`
-- (eventos NPA 50/50, custo fixo 50/50, professoras pela proporção de
-- mensalidade, receita fora do CRM por fornecedor, taxa Voomp 100% Rodrygo).
-- Esta coluna vai guardar essas regras de forma editável — vazio (`{}`) faz o
-- código cair nos defaults, que espelham exatamente o comportamento atual.
--
-- Ver TAREFA C4 em docs/FINANCEIRO-CODEX.md.

alter table public.balanco_config
  add column if not exists regras_socio jsonb not null default '{}'::jsonb;

comment on column public.balanco_config.regras_socio is
  'Regras de divisão do DRE por sócio (eventos %, rateio de custo fixo %, atribuição por fornecedor). Vazio = defaults do código. Ver FINANCEIRO-CODEX.md C4.';
