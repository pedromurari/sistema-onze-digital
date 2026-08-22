-- As duas turmas do ciclo #02526 nasceram sem linha em `turma_responsaveis`.
--
-- ── A REGRA (confirmada pelo dono em 22/08/2026) ────────────────────────────
-- Investidor fica com 50% e o instituto com 50%. A excecao e o primeiro pagamento:
-- o comercial e da 11ds. Essa parte ja esta correta no codigo — `calcRepassePagamento`
-- separa uma mensalidade da 1a parcela para a Onze Digital antes de dividir o resto.
--
-- ── O QUE ESTAVA ERRADO ─────────────────────────────────────────────────────
-- O 50/50 da RECORRENCIA depende de existir linha em `turma_responsaveis`. Quando nao
-- existe, `metadeComInvestidor` cai neste caminho:
--
--     if (investidores.length === 0)
--       return [{ nome: nomeBase, percentual: 100, valor: liquido }];   // 100% IDM
--
-- Ou seja: turma sem split registrado manda 100% da recorrencia para o IDM, e o
-- investidor nao recebe atribuicao nenhuma. Nao ha erro visivel na tela — o numero
-- simplesmente aparece do lado errado.
--
-- Todas as turmas anteriores tem a linha. So as duas do #02526, o ciclo mais recente,
-- ficaram sem — e as duas tem `turmas.responsavel_id` preenchido, entao a intencao esta
-- registrada, so nao no lugar que o calculo consulta.
--
-- ── O QUE ISSO JA CUSTOU ────────────────────────────────────────────────────
-- Recorrencia ja recebida e atribuida 100% ao IDM em vez de dividida:
--   Turma #02526/Keila   R$   329,70  ->  R$   164,85 eram da Keila
--   Turma #02526/OnzeDS  R$ 1.858,10  ->  R$   929,05 eram da Onze Digital
--                                          R$ 1.093,90 no total
-- Alem de R$ 13.737,50 e R$ ~29 mil ainda a receber, que seguiriam pelo caminho errado.
--
-- Os pagamentos comerciais dessas turmas estao corretos e nao mudam: sao 1 mensalidade
-- cada (R$ 109,90), que vai 100% para a Onze Digital com ou sem split cadastrado.
--
-- ── O PERCENTUAL 50 ─────────────────────────────────────────────────────────
-- Em `metadeComInvestidor` o percentual e a fatia DENTRE os investidores, normalizada
-- pelo total — nao o corte absoluto. Com um unico investidor, 50 e 100 dao o mesmo
-- resultado (ele leva os 50% do lado do investidor). Uso 50 para ficar igual as turmas
-- irmas (#02426/Keila e #02326/OnzeDS), que ja estao assim.
--
-- Reversivel: sao duas linhas. `delete from turma_responsaveis where turma_id in (...)`.

insert into public.turma_responsaveis (turma_id, user_id, nome_ref, percentual)
select t.id, r.id, r.nome, 50.00
  from public.turmas t
  join public.responsaveis r on r.id = t.responsavel_id
 where t.nome in ('Turma #02526/Keila', 'Turma #02526/OnzeDS')
   and not exists (
     select 1 from public.turma_responsaveis tr where tr.turma_id = t.id
   );
