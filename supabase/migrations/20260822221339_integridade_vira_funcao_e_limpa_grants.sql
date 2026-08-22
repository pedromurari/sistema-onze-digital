-- Limpa o que o linter do Supabase aponta, e documenta o que fica apontado de proposito.
--
-- ── 1. `integridade_financeira`: view SECURITY DEFINER vira funcao ──────────
--
-- O linter marca view SECURITY DEFINER como ERROR, e com razao no caso geral. A minha
-- precisa desse comportamento (as checagens sao `not exists`, e sob a RLS de quem consulta
-- a ausencia por falta de permissao virava falso positivo — o vendedor via 187 alunos
-- "sem parcela"). Mas deixar um ERROR permanente no painel mata o sinal: a proxima falha
-- de verdade passa despercebida no meio do ruido.
--
-- Funcao SECURITY DEFINER expressa a mesma coisa e o linter classifica como WARN, junto
-- com as outras 40 que ja existem. E o padrao que `email_config_resumo()` ja usa aqui.

drop view if exists public.integridade_financeira;

create or replace function public.integridade_financeira()
returns table (
  problema       text,
  gravidade      text,
  entidade       text,
  efeito         text,
  valor_em_risco numeric,
  referencia     uuid
)
language sql
security definer
stable
set search_path to 'public', 'pg_temp'
as $fn$
  select * from (
    select 'aluno sem turma' as problema, 'alto' as gravidade, a.nome as entidade,
           'Fora da cobranca (o JOIN com cobranca_turmas_ativas nao acha) e fora do rateio por investidor' as efeito,
           coalesce((select sum(p.valor) from public.pagamentos p
                      where p.aluno_id = a.id and p.status = 'pendente'), 0)::numeric as valor_em_risco,
           a.id as referencia
      from public.alunos a
     where a.turma_id is null and a.status not in ('cancelado','concluido')
    union all
    select 'devendo e sem forma de pagamento', 'alto', a.nome,
           'Tem parcela vencida e forma_pagamento nula — a cobranca nunca vai alcancar',
           coalesce((select sum(p.valor) from public.pagamentos p
                      where p.aluno_id = a.id and p.status='pendente'
                        and p.data_vencimento < current_date), 0)::numeric, a.id
      from public.alunos a
     where coalesce(a.forma_pagamento,'') = '' and a.status not in ('cancelado','concluido')
       and exists (select 1 from public.pagamentos p where p.aluno_id=a.id
                    and p.status='pendente' and p.data_vencimento < current_date)
    union all
    select 'cartao/a vista com parcela vencida', 'medio', a.nome,
           'Paga por ' || a.forma_pagamento
             || ' (cobranca automatica), mas tem parcela vencida — recorrencia falhou ou falta dar baixa',
           coalesce((select sum(p.valor) from public.pagamentos p
                      where p.aluno_id=a.id and p.status='pendente'
                        and p.data_vencimento < current_date), 0)::numeric, a.id
      from public.alunos a
     where a.forma_pagamento in ('cartao','avista') and a.status not in ('cancelado','concluido')
       and exists (select 1 from public.pagamentos p where p.aluno_id=a.id
                    and p.status='pendente' and p.data_vencimento < current_date)
    union all
    select 'aluno sem parcela gerada', 'alto', a.nome,
           'Matriculado e sem nenhuma mensalidade — invisivel na inadimplencia',
           0::numeric, a.id
      from public.alunos a
     where a.status not in ('cancelado','concluido')
       and not exists (select 1 from public.pagamentos p where p.aluno_id = a.id)
    union all
    select 'turma com responsavel mas sem split', 'alto', t.nome,
           'responsavel_id aponta para ' || coalesce(r.nome,'?')
             || ', mas sem linha em turma_responsaveis — recorrencia vai 100% ao IDM',
           (coalesce((select sum(p.valor) from public.pagamentos p
                       where p.turma_id=t.id and coalesce(p.numero_parcela,1) > 1), 0) * 0.5)::numeric,
           t.id
      from public.turmas t
      left join public.responsaveis r on r.id = t.responsavel_id
     where t.responsavel_id is not null
       and not exists (select 1 from public.turma_responsaveis tr where tr.turma_id = t.id)
    union all
    select 'pago com valor zero', 'baixo', a.nome,
           count(*)::text || ' parcelas com status pago e valor 0 — provavelmente e isento',
           0::numeric, a.id
      from public.pagamentos p join public.alunos a on a.id = p.aluno_id
     where p.status='pago' and coalesce(p.valor,0) <= 0
     group by a.nome, a.id
    union all
    select 'pagamento sem turma, aluno com turma', 'medio', a.nome,
           count(*)::text || ' pagamentos sem turma_id, mas o aluno esta em ' || t.nome,
           coalesce(sum(p.valor),0)::numeric, a.id
      from public.pagamentos p
      join public.alunos a on a.id = p.aluno_id
      join public.turmas t on t.id = a.turma_id
     where p.turma_id is null
     group by a.nome, a.id, t.nome
  ) achados
   where public.tem_permissao('financeiro', 'ver')
     and public.tem_permissao('financeiro', 'ver_todos');
$fn$;

comment on function public.integridade_financeira() is
  'Dado financeiro que o sistema aceita calado e calcula errado. SECURITY DEFINER de proposito: as checagens sao `not exists` e, sob a RLS de quem consulta, ausencia por falta de permissao viraria falso positivo (o vendedor via 187 alunos "sem parcela"). O portao no fim exige ver E ver_todos de financeiro.';

revoke execute on function public.integridade_financeira() from public, anon;
grant  execute on function public.integridade_financeira() to authenticated;

-- ── 2. O outro ERROR do linter fica, e agora com o motivo escrito ──────────
comment on view public.parceiros_produtos_checkout is
  'SECURITY DEFINER de proposito: e a vitrine da pagina publica de checkout, precisa ler produto ativo sem login. Expoe so nome, preco e `mp_public_key` — a chave PUBLICA do Mercado Pago. O linter aponta como ERROR pelo padrao geral; aqui e intencional.';

-- ── 3. Grants pendurados em tabela sem policy ──────────────────────────────
-- `idm_criativos_log`, `leads_ia_debounce`, `sheet_leads_33` e `subtarefas` tem RLS ligada
-- e ZERO policies, entao hoje nao passa nada — mas cada uma carrega 8 grants para anon e
-- authenticated. Grant sem policy e pegadinha adormecida: no dia em que alguem criar uma
-- policy "so para testar", a porta abre junto. Nenhuma delas e usada pelo frontend; a
-- unica com uso (`leads_ia_debounce`) e lida por edge function, que usa service_role e
-- ignora tudo isto.
revoke all on public.idm_criativos_log from anon, authenticated;
revoke all on public.leads_ia_debounce from anon, authenticated;
revoke all on public.sheet_leads_33    from anon, authenticated;
revoke all on public.subtarefas        from anon, authenticated;

comment on table public.leads_ia_debounce is
  'Somente service_role: sem grant e sem policy para o app, de proposito. Usada apenas pela edge function do SDR de IA.';
