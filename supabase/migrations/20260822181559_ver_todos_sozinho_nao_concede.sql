-- `ver_todos` e modificador, nunca concessao. Duas correcoes que vem do mesmo mal-entendido.
--
-- ── O QUE ACONTECEU ─────────────────────────────────────────────────────────
-- Toda policy das camadas checa `ver` ANTES de olhar o escopo:
--
--     tem_permissao('financeiro','ver') AND (tem_permissao('financeiro','ver_todos') OR ...)
--
-- Ou seja, `ver_todos` sozinho nao abre nada — e por isso os parceiros, que tem
-- `financeiro/ver_todos` sem ter `financeiro/ver`, enxergam zero pagamentos.
--
-- So que a view `integridade_financeira` estreou com um portao que olhava SO o
-- `ver_todos`. Resultado medido: parceiro via as 9 linhas do diagnostico financeiro, que
-- inclui nome de aluno e valor em aberto. Vazamento causado por sair da convencao.

-- ── 1. O portao passa a seguir a convencao da casa ──────────────────────────
create or replace view public.integridade_financeira as
select * from (
  select 'aluno sem turma' as problema, 'alto' as gravidade, a.nome as entidade,
         'Fora da cobranca (o JOIN com cobranca_turmas_ativas nao acha) e fora do rateio por investidor' as efeito,
         coalesce((select sum(p.valor) from public.pagamentos p
                    where p.aluno_id = a.id and p.status = 'pendente'), 0) as valor_em_risco,
         a.id as referencia
    from public.alunos a
   where a.turma_id is null and a.status not in ('cancelado','concluido')
  union all
  select 'devendo e sem forma de pagamento', 'alto', a.nome,
         'Tem parcela vencida e forma_pagamento nula — a cobranca nunca vai alcancar',
         coalesce((select sum(p.valor) from public.pagamentos p
                    where p.aluno_id = a.id and p.status='pendente'
                      and p.data_vencimento < current_date), 0), a.id
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
                      and p.data_vencimento < current_date), 0), a.id
    from public.alunos a
   where a.forma_pagamento in ('cartao','avista') and a.status not in ('cancelado','concluido')
     and exists (select 1 from public.pagamentos p where p.aluno_id=a.id
                  and p.status='pendente' and p.data_vencimento < current_date)
  union all
  select 'aluno sem parcela gerada', 'alto', a.nome,
         'Matriculado e sem nenhuma mensalidade — invisivel na inadimplencia', 0, a.id
    from public.alunos a
   where a.status not in ('cancelado','concluido')
     and not exists (select 1 from public.pagamentos p where p.aluno_id = a.id)
  union all
  select 'turma com responsavel mas sem split', 'alto', t.nome,
         'responsavel_id aponta para ' || coalesce(r.nome,'?')
           || ', mas sem linha em turma_responsaveis — recorrencia vai 100% ao IDM',
         coalesce((select sum(p.valor) from public.pagamentos p
                    where p.turma_id=t.id and coalesce(p.numero_parcela,1) > 1), 0) * 0.5, t.id
    from public.turmas t
    left join public.responsaveis r on r.id = t.responsavel_id
   where t.responsavel_id is not null
     and not exists (select 1 from public.turma_responsaveis tr where tr.turma_id = t.id)
  union all
  select 'pago com valor zero', 'baixo', a.nome,
         count(*)::text || ' parcelas com status pago e valor 0 — provavelmente e isento', 0, a.id
    from public.pagamentos p join public.alunos a on a.id = p.aluno_id
   where p.status='pago' and coalesce(p.valor,0) <= 0
   group by a.nome, a.id
  union all
  select 'pagamento sem turma, aluno com turma', 'medio', a.nome,
         count(*)::text || ' pagamentos sem turma_id, mas o aluno esta em ' || t.nome,
         coalesce(sum(p.valor),0), a.id
    from public.pagamentos p
    join public.alunos a on a.id = p.aluno_id
    join public.turmas t on t.id = a.turma_id
   where p.turma_id is null
   group by a.nome, a.id, t.nome
) achados
 where public.tem_permissao('financeiro', 'ver')
   and public.tem_permissao('financeiro', 'ver_todos');

comment on view public.integridade_financeira is
  'Dado financeiro que o sistema aceita calado e calcula errado. Roda com o privilegio da dona de proposito: as checagens sao `not exists`, e sob RLS a ausencia por falta de permissao viraria falso positivo (o vendedor via 187 alunos "sem parcela"). O portao no fim exige ver E ver_todos de financeiro — `ver_todos` sozinho nunca concede nada neste sistema.';

grant select on public.integridade_financeira to authenticated;

-- ── 2. Tirar os overrides que nao dizem nada ────────────────────────────────
-- Os parceiros receberam `financeiro/ver_todos` e `lancamentos/ver_todos` sem o `ver`
-- correspondente, na migration escopo_turma_e_padrao_vendedor. Sao inertes para as
-- policies, mas linha inerte em tabela de permissao ja causou dois bugs nesta sprint:
-- foi lida como concessao pela minha propria view, e o padrao largo do vendedor nasceu
-- do mesmo tipo de ruido. Tabela de permissao tem que dizer a verdade quando lida por um
-- humano com pressa.
delete from public.user_permissao_override o
 where o.acao = 'ver_todos'
   and o.permitido
   and not exists (
     select 1 from public.user_permissao_override v
      where v.user_id = o.user_id and v.recurso = o.recurso
        and v.acao = 'ver' and v.permitido
   )
   and not exists (
     select 1 from public.role_permissoes rp
      join public.user_roles ur on ur.user_id = o.user_id
     where rp.papel::text = ur.role::text and rp.recurso = o.recurso and rp.acao = 'ver'
   );
