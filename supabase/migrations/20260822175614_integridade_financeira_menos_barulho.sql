-- Afina a visao de integridade: a primeira versao gritava demais.
--
-- Ela marcava como grave todo aluno com `cobranca_ativa` e forma diferente de boleto —
-- 37 pessoas. Mas medindo: dos 21 a vista e 9 no cartao, o vencido e R$ 0. A cobranca
-- automatica do meio de pagamento funciona; ter `cobranca_ativa=true` neles e inocuo,
-- nao buraco. Os 7 sem forma de pagamento nenhuma e que sao o problema.
--
-- Visao de integridade barulhenta e visao que ninguem le. Falso positivo custa mais caro
-- aqui do que numa lista qualquer, porque ensina a ignorar a lista.

create or replace view public.integridade_financeira
with (security_invoker = true) as

-- ── Aluno ativo sem turma ───────────────────────────────────────────────────
select 'aluno sem turma'                             as problema,
       'alto'                                        as gravidade,
       a.nome                                        as entidade,
       'Fora da cobranca (o JOIN com cobranca_turmas_ativas nao acha) e fora do rateio por investidor' as efeito,
       coalesce((select sum(p.valor) from public.pagamentos p
                  where p.aluno_id = a.id and p.status = 'pendente'), 0) as valor_em_risco,
       a.id                                          as referencia
  from public.alunos a
 where a.turma_id is null
   and a.status not in ('cancelado', 'concluido')

union all

-- ── Devendo, sem forma de pagamento cadastrada ──────────────────────────────
-- `get_alunos_para_cobranca` exige `forma_pagamento = 'boleto'`. Sem forma nenhuma o
-- aluno nunca entra na fila, e a tela mostra a cobranca ligada.
select 'devendo e sem forma de pagamento',
       'alto',
       a.nome,
       'Tem parcela vencida e forma_pagamento nula — a cobranca nunca vai alcancar',
       coalesce((select sum(p.valor) from public.pagamentos p
                  where p.aluno_id = a.id and p.status = 'pendente'
                    and p.data_vencimento < current_date), 0),
       a.id
  from public.alunos a
 where coalesce(a.forma_pagamento, '') = ''
   and a.status not in ('cancelado', 'concluido')
   and exists (select 1 from public.pagamentos p
                where p.aluno_id = a.id and p.status = 'pendente'
                  and p.data_vencimento < current_date)

union all

-- ── Cartao ou a vista com parcela vencida ───────────────────────────────────
-- Nesses meios a cobranca e automatica, entao vencido significa que a recorrencia falhou
-- — ou que o aluno pagou por fora e ninguem baixou a parcela. Precisa de olho humano, mas
-- nao e o mesmo grau do caso acima.
select 'cartao/a vista com parcela vencida',
       'medio',
       a.nome,
       'Paga por ' || a.forma_pagamento
         || ' (cobranca automatica), mas tem parcela vencida — recorrencia falhou ou falta dar baixa',
       coalesce((select sum(p.valor) from public.pagamentos p
                  where p.aluno_id = a.id and p.status = 'pendente'
                    and p.data_vencimento < current_date), 0),
       a.id
  from public.alunos a
 where a.forma_pagamento in ('cartao', 'avista')
   and a.status not in ('cancelado', 'concluido')
   and exists (select 1 from public.pagamentos p
                where p.aluno_id = a.id and p.status = 'pendente'
                  and p.data_vencimento < current_date)

union all

-- ── Aluno ativo sem nenhuma parcela ─────────────────────────────────────────
select 'aluno sem parcela gerada',
       'alto',
       a.nome,
       'Matriculado e sem nenhuma mensalidade — invisivel na inadimplencia',
       0,
       a.id
  from public.alunos a
 where a.status not in ('cancelado', 'concluido')
   and not exists (select 1 from public.pagamentos p where p.aluno_id = a.id)

union all

-- ── Turma com dono mas sem split ────────────────────────────────────────────
-- O bug que custou R$ 1.093,90: `turmas.responsavel_id` registra a intencao, mas o
-- calculo do repasse le `turma_responsaveis`. Ter um e nao o outro reparte errado.
select 'turma com responsavel mas sem split',
       'alto',
       t.nome,
       'responsavel_id aponta para ' || coalesce(r.nome, '?')
         || ', mas sem linha em turma_responsaveis — recorrencia vai 100% ao IDM',
       coalesce((select sum(p.valor) from public.pagamentos p
                  where p.turma_id = t.id and coalesce(p.numero_parcela, 1) > 1), 0) * 0.5,
       t.id
  from public.turmas t
  left join public.responsaveis r on r.id = t.responsavel_id
 where t.responsavel_id is not null
   and not exists (select 1 from public.turma_responsaveis tr where tr.turma_id = t.id)

union all

-- ── Pagamento quitado com valor zero ────────────────────────────────────────
select 'pago com valor zero',
       'baixo',
       a.nome,
       count(*)::text || ' parcelas com status pago e valor 0 — provavelmente e isento',
       0,
       a.id
  from public.pagamentos p
  join public.alunos a on a.id = p.aluno_id
 where p.status = 'pago' and coalesce(p.valor, 0) <= 0
 group by a.nome, a.id

union all

-- ── Pagamento orfao de turma cujo aluno TEM turma ───────────────────────────
select 'pagamento sem turma, aluno com turma',
       'medio',
       a.nome,
       count(*)::text || ' pagamentos sem turma_id, mas o aluno esta em ' || t.nome,
       coalesce(sum(p.valor), 0),
       a.id
  from public.pagamentos p
  join public.alunos a on a.id = p.aluno_id
  join public.turmas t on t.id = a.turma_id
 where p.turma_id is null
 group by a.nome, a.id, t.nome;

comment on view public.integridade_financeira is
  'Dado financeiro que o sistema aceita calado e calcula errado: aluno sem turma, quem deve e a cobranca nao alcanca, turma sem split. Nao corrige nada — cada caso e decisao de negocio. Mantida enxuta de proposito: falso positivo aqui ensina a ignorar a lista.';

grant select on public.integridade_financeira to authenticated;
