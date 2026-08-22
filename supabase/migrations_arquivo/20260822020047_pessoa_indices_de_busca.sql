-- Sprint 3f — Indices para a ficha da pessoa nao varrer tabela inteira.
--
-- A `pessoa_timeline` junta `whatsapp_mensagens` (12.952 linhas) com `pessoas` aplicando
-- `normalizar_telefone()` em cada linha. Sem indice funcional isso e varredura completa a
-- cada abertura de ficha. `normalizar_telefone` e IMMUTABLE, entao pode ser indexada.

create index if not exists idx_whatsapp_mensagens_telefone_norm
  on public.whatsapp_mensagens (public.normalizar_telefone(telefone));

create index if not exists idx_pessoas_telefone on public.pessoas (telefone);
create index if not exists idx_pessoas_email    on public.pessoas (lower(email));

-- Busca por nome na ficha da pessoa (ILIKE '%texto%' nao usa indice comum).
create extension if not exists pg_trgm;
create index if not exists idx_pessoas_nome_trgm on public.pessoas using gin (nome gin_trgm_ops);

create index if not exists idx_leads_historico_fase_lead on public.leads_historico_fase (lead_id);
create index if not exists idx_pagamentos_aluno          on public.pagamentos (aluno_id);
