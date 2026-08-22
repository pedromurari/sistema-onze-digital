-- Sprint 1.1 — Fechar exposicao anonima de `alunos` e `leads`.
--
-- Situacao encontrada (politicas criadas direto no dashboard, sem migration):
--   alunos: anon SELECT USING(true) + anon UPDATE USING(true) WITH CHECK(true)
--   leads : anon SELECT USING(true) + anon UPDATE USING(true) WITH CHECK(true)
-- Ou seja: com a chave anonima (que esta no bundle do site) qualquer pessoa lia
-- os 198 alunos e os 11.768 leads, e ainda podia reescrever qualquer registro.
--
-- As tres paginas publicas (/membros, /assinar, /formulario) dependiam desse
-- SELECT anonimo, sempre filtrando por token. Aqui esse acesso passa a ser feito
-- por funcoes SECURITY DEFINER que so devolvem a linha do token informado —
-- mesma funcionalidade, sem expor a tabela.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Portal do aluno — /membros/:token
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.portal_aluno_por_token(p_token uuid)
returns table (
  id                          uuid,
  nome                        text,
  email                       text,
  whatsapp                    text,
  status                      text,
  produto                     text,
  data_inicio                 date,
  data_fim                    date,
  dia_vencimento              integer,
  contrato_assinado           boolean,
  autentique_link_assinatura  text,
  link_grupo_whatsapp         text,
  turma_nome                  text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    a.id, a.nome, a.email, a.whatsapp, a.status, a.produto,
    a.data_inicio, a.data_fim, a.dia_vencimento,
    a.contrato_assinado, a.autentique_link_assinatura,
    tdc.link_grupo,
    t.nome
  from public.alunos a
  left join public.turmas t
    on t.id = a.turma_id
  left join public.turma_disparo_config tdc
    on tdc.turma_id = a.turma_id::text
  where a.contrato_token = p_token
  limit 1;
$$;

comment on function public.portal_aluno_por_token(uuid) is
  'Portal publico do aluno (/membros/:token). O token e a credencial; devolve so a linha dele.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Pagamentos do portal — /membros/:token
--    (a pagina lia `pagamentos` com a chave anonima, mas nunca houve policy anon
--     nessa tabela: a lista de parcelas sempre voltou vazia. Aqui passa a funcionar.)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.portal_pagamentos_por_token(p_token uuid)
returns table (
  id               uuid,
  data_vencimento  date,
  valor            numeric,
  status           text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.data_vencimento, p.valor, p.status
  from public.pagamentos p
  join public.alunos a on a.id = p.aluno_id
  where a.contrato_token = p_token
  order by p.data_vencimento desc
  limit 6;
$$;

comment on function public.portal_pagamentos_por_token(uuid) is
  'Ultimas 6 parcelas do aluno dono do token. Usada pelo portal publico /membros/:token.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Ficha de contrato — /assinar/:token e /formulario/:token
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.portal_contrato_por_token(p_token uuid)
returns table (
  id                          uuid,
  nome                        text,
  whatsapp                    text,
  email                       text,
  produto                     text,
  status                      text,
  cpf                         text,
  data_nascimento             date,
  endereco                    text,
  cep                         text,
  cidade_estado               text,
  forms_respondido            boolean,
  contrato_enviado            boolean,
  autentique_link_assinatura  text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    a.id, a.nome, a.whatsapp, a.email, a.produto, a.status,
    a.cpf, a.data_nascimento, a.endereco, a.cep, a.cidade_estado,
    a.forms_respondido, a.contrato_enviado, a.autentique_link_assinatura
  from public.alunos a
  where a.contrato_token = p_token
  limit 1;
$$;

comment on function public.portal_contrato_por_token(uuid) is
  'Ficha do aluno para as paginas publicas de contrato (/assinar/:token, /formulario/:token).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Permissao de execucao — so anon e authenticated, nunca PUBLIC
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.portal_aluno_por_token(uuid)      from public;
revoke all on function public.portal_pagamentos_por_token(uuid) from public;
revoke all on function public.portal_contrato_por_token(uuid)   from public;

grant execute on function public.portal_aluno_por_token(uuid)      to anon, authenticated;
grant execute on function public.portal_pagamentos_por_token(uuid) to anon, authenticated;
grant execute on function public.portal_contrato_por_token(uuid)   to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Fecha o buraco: remove leitura e escrita anonima direta nas tabelas
--    (o INSERT anonimo fica por enquanto — captura publica de lead/matricula
--     pode depender dele; sera tratado no passo 1.1b, depois de confirmado.)
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists anon_select_alunos_by_email   on public.alunos;
drop policy if exists anon_update_alunos_matricula  on public.alunos;

drop policy if exists anon_select_leads_by_contact  on public.leads;
drop policy if exists anon_update_leads_matricula   on public.leads;
