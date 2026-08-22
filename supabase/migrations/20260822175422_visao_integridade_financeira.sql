-- Uma visao que mostra dado financeiro que o sistema aceita em silencio e calcula errado.
--
-- ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
-- Tres bugs desta sprint tem a mesma forma: um campo vazio que o codigo interpreta como
-- um valor valido, sem reclamar.
--
--   • Turma de investidor sem linha em `turma_responsaveis` -> `metadeComInvestidor` le
--     "nenhum investidor" e manda 100% da recorrencia para o IDM. Custou R$ 1.093,90.
--   • Aluno sem `dia_vencimento` -> a geracao de parcelas quebrava e o aluno ficava sem
--     nenhuma, invisivel na inadimplencia.
--   • Aluno sem turma -> `get_alunos_para_cobranca` faz JOIN com `cobranca_turmas_ativas`
--     e o aluno simplesmente nao aparece. Nunca e cobrado, e ninguem fica sabendo.
--
-- Nenhum desses da erro. O numero so aparece do lado errado, ou nao aparece. Procurar isso
-- na mao nao escala; a visao poe todos na mesma lista.
--
-- Nao corrige nada por conta propria: cada caso e decisao de quem conhece o negocio.

create or replace view public.integridade_financeira
with (security_invoker = true) as

-- ── Aluno ativo sem turma ───────────────────────────────────────────────────
-- Fica fora da cobranca (o JOIN com cobranca_turmas_ativas nao acha) e fora do repasse
-- (sem turma nao ha investidor, entao vai 100% IDM).
select 'aluno sem turma'                             as problema,
       'alto'                                        as gravidade,
       a.nome                                        as entidade,
       'Nao entra na cobranca nem no rateio por investidor' as efeito,
       coalesce((select sum(p.valor) from public.pagamentos p
                  where p.aluno_id = a.id and p.status = 'pendente'), 0) as valor_em_risco,
       a.id                                          as referencia
  from public.alunos a
 where a.turma_id is null
   and a.status not in ('cancelado', 'concluido')

union all

-- ── Aluno com cobranca ligada que a cobranca nunca alcanca ──────────────────
-- `get_alunos_para_cobranca` exige `forma_pagamento = 'boleto'`. Quem tem cobranca_ativa
-- mas outra forma (ou nenhuma) aparece ligado na tela e nunca recebe mensagem.
select 'cobranca ligada mas inalcancavel',
       'alto',
       a.nome,
       'cobranca_ativa=true, mas forma_pagamento=' || coalesce(a.forma_pagamento, 'nula')
         || ' — a funcao de cobranca so pega boleto',
       coalesce((select sum(p.valor) from public.pagamentos p
                  where p.aluno_id = a.id and p.status = 'pendente'
                    and p.data_vencimento < current_date), 0),
       a.id
  from public.alunos a
 where a.cobranca_ativa
   and coalesce(a.forma_pagamento, '') <> 'boleto'
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
-- Este e o bug que custou R$ 1.093,90: `turmas.responsavel_id` registra a intencao, mas
-- o calculo do repasse le `turma_responsaveis`. Ter um e nao o outro reparte errado.
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
-- Bolsa registrada como 'pago R$ 0' em vez de 'isento'. Nao muda dinheiro, mas entra na
-- contagem de pagamentos e distorce media por parcela.
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
-- Divergencia entre o pagamento e o cadastro do aluno: o rateio usa a turma do PAGAMENTO.
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
  'Dado financeiro que o sistema aceita calado e calcula errado: aluno sem turma, cobranca que nunca alcanca, turma sem split. Nao corrige nada — cada caso e decisao de negocio.';

-- A visao le alunos, pagamentos e turmas. Com security_invoker ela respeita a RLS de quem
-- consulta: quem nao pode ver financeiro nao ve nada aqui.
grant select on public.integridade_financeira to authenticated;
