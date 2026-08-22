-- Conserta um vazamento na propria view de integridade — e e o mesmo tipo de bug que ela
-- foi criada para caçar.
--
-- ── O ERRO ──────────────────────────────────────────────────────────────────
-- A view nasceu `security_invoker = true`, o que parecia o certo: cada um enxerga
-- conforme a sua permissao. Mas as checagens dela sao `not exists`, e isso se inverte
-- quando a RLS esconde linhas:
--
--     not exists (select 1 from pagamentos where aluno_id = a.id)   -- "aluno sem parcela"
--
-- O vendedor le `alunos` mas nao le `pagamentos`. Para ele o subselect volta vazio SEMPRE,
-- entao os 187 alunos apareciam como "sem parcela gerada". Medido: admin via 9 linhas,
-- vendedor via 187.
--
-- Ausencia por falta de permissao lida como ausencia de fato. Exatamente o que a view
-- deveria denunciar.
--
-- ── A CORRECAO ──────────────────────────────────────────────────────────────
-- A view passa a rodar com o privilegio da dona (sem `security_invoker`), enxergando todas
-- as linhas — e ganha um portao explicito no lugar da RLS implicita. Mesmo padrao de
-- `email_config_resumo()`.
--
-- O portao e `financeiro/ver_todos`, nao `financeiro/ver`. E um diagnostico do conjunto:
-- so faz sentido para quem enxerga o financeiro inteiro. A investidora, que tem
-- `financeiro/ver` restrito as turmas dela, receberia um retrato do que nao e dela — entao
-- fica de fora.

drop view if exists public.integridade_financeira;

create view public.integridade_financeira as
select *
  from (

  -- ── Aluno ativo sem turma ─────────────────────────────────────────────────
  select 'aluno sem turma'                           as problema,
         'alto'                                      as gravidade,
         a.nome                                      as entidade,
         'Fora da cobranca (o JOIN com cobranca_turmas_ativas nao acha) e fora do rateio por investidor' as efeito,
         coalesce((select sum(p.valor) from public.pagamentos p
                    where p.aluno_id = a.id and p.status = 'pendente'), 0) as valor_em_risco,
         a.id                                        as referencia
    from public.alunos a
   where a.turma_id is null
     and a.status not in ('cancelado', 'concluido')

  union all

  -- ── Devendo, sem forma de pagamento cadastrada ────────────────────────────
  select 'devendo e sem forma de pagamento', 'alto', a.nome,
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

  -- ── Cartao ou a vista com parcela vencida ─────────────────────────────────
  select 'cartao/a vista com parcela vencida', 'medio', a.nome,
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

  -- ── Aluno ativo sem nenhuma parcela ───────────────────────────────────────
  select 'aluno sem parcela gerada', 'alto', a.nome,
         'Matriculado e sem nenhuma mensalidade — invisivel na inadimplencia',
         0, a.id
    from public.alunos a
   where a.status not in ('cancelado', 'concluido')
     and not exists (select 1 from public.pagamentos p where p.aluno_id = a.id)

  union all

  -- ── Turma com dono mas sem split ──────────────────────────────────────────
  select 'turma com responsavel mas sem split', 'alto', t.nome,
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

  -- ── Pagamento quitado com valor zero ──────────────────────────────────────
  select 'pago com valor zero', 'baixo', a.nome,
         count(*)::text || ' parcelas com status pago e valor 0 — provavelmente e isento',
         0, a.id
    from public.pagamentos p
    join public.alunos a on a.id = p.aluno_id
   where p.status = 'pago' and coalesce(p.valor, 0) <= 0
   group by a.nome, a.id

  union all

  -- ── Pagamento orfao de turma cujo aluno TEM turma ─────────────────────────
  select 'pagamento sem turma, aluno com turma', 'medio', a.nome,
         count(*)::text || ' pagamentos sem turma_id, mas o aluno esta em ' || t.nome,
         coalesce(sum(p.valor), 0), a.id
    from public.pagamentos p
    join public.alunos a on a.id = p.aluno_id
    join public.turmas t on t.id = a.turma_id
   where p.turma_id is null
   group by a.nome, a.id, t.nome

  ) achados
 -- O portao. Sem ele a view rodaria com o privilegio da dona para qualquer um logado.
 where public.tem_permissao('financeiro', 'ver_todos');

comment on view public.integridade_financeira is
  'Dado financeiro que o sistema aceita calado e calcula errado. Roda com o privilegio da dona de proposito: as checagens sao `not exists`, e sob RLS a ausencia por falta de permissao viraria falso positivo (o vendedor via 187 alunos "sem parcela"). O acesso e controlado pelo portao tem_permissao(financeiro, ver_todos) no fim da view.';

grant select on public.integridade_financeira to authenticated;
