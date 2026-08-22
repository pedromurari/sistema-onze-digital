-- Faz a permissao ser avaliada UMA VEZ por consulta, e nao uma vez por linha.
--
-- ── MEDIDO ANTES ────────────────────────────────────────────────────────────
--     leads      (11.778 linhas)  785 ms   num simples count(*)
--     pagamentos ( 2.507 linhas)  218 ms
--     alunos     (   198 linhas)   24 ms
-- ~67 microssegundos por linha: nao e a consulta que e lenta, e a permissao recalculada
-- para cada registro. O planejador trata `tem_permissao('x','ver')` como expressao
-- dependente da linha; envolvida em `(select ...)` ela vira InitPlan e roda uma vez so.
--
-- ── POR QUE NAO REAPLICAR O GERADOR ─────────────────────────────────────────
-- `aplicar_camada_multi` derruba TODAS as policies da tabela e recria as quatro padrao.
-- Varias tabelas ganharam escopo extra depois (recorte por turma em `pagamentos`,
-- `pessoas` e `turma_responsaveis`, dono do registro em `leads`). Reaplicar apagaria esses
-- recortes em silencio — a investidora voltaria a ver os 2.507 pagamentos.
-- Aqui a expressao e PRESERVADA e so `tem_permissao(...)` e envolvida.
--
-- ── POR QUE `turmas_financeiro_permitidas()` FICA COMO ESTA ─────────────────
-- Ela aparece como `turma_id::text = ANY (turmas_financeiro_permitidas())`. Envolver em
-- `(select ...)` ali muda o sentido do ANY — o Postgres passa a ler como subconsulta e
-- reclama `text = text[]`. Ela roda uma vez por linha em tres tabelas; o ganho nao paga o
-- risco de mexer na forma do ANY. `tem_permissao` e a chamada dominante e aparece em 113.
--
-- ── A TRAVA ─────────────────────────────────────────────────────────────────
-- Depois de montar a expressao nova, a migration desfaz o embrulho por texto e compara com
-- a original. Qualquer diferenca alem dos `(select )` levanta excecao e desfaz tudo.
-- Reescrever regra de seguranca por regex sem essa conferencia seria irresponsavel.

do $$
declare
  r          record;
  novo_qual  text;
  novo_check text;
  confere    text;
  alteradas  int := 0;
begin
  for r in
    select p.tablename, p.policyname, p.qual, p.with_check
      from pg_policies p
     where p.schemaname = 'public'
       and (p.qual like '%tem_permissao(%' or p.with_check like '%tem_permissao(%')
  loop
    novo_qual  := r.qual;
    novo_check := r.with_check;

    -- Forma fixa, sempre gerada pelo mesmo codigo — nada de expressao livre.
    if novo_qual is not null then
      novo_qual := regexp_replace(novo_qual,
        '(?<!\(select )(tem_permissao\(''[a-z_]+''::text, ''[a-z_]+''::text\))',
        '(select \1)', 'g');
    end if;
    if novo_check is not null then
      novo_check := regexp_replace(novo_check,
        '(?<!\(select )(tem_permissao\(''[a-z_]+''::text, ''[a-z_]+''::text\))',
        '(select \1)', 'g');
    end if;

    if novo_qual is not distinct from r.qual and novo_check is not distinct from r.with_check then
      continue;   -- ja estava envolvida
    end if;

    -- TRAVA: tirar o embrulho tem que devolver exatamente a expressao original.
    if novo_qual is not null then
      confere := replace(replace(novo_qual, '(select ', ''), ')', '');
      if confere <> replace(r.qual, ')', '') then
        raise exception 'policy % em %: o embrulho mudou a expressao.', r.policyname, r.tablename;
      end if;
    end if;
    if novo_check is not null then
      confere := replace(replace(novo_check, '(select ', ''), ')', '');
      if confere <> replace(r.with_check, ')', '') then
        raise exception 'policy % em %: o embrulho mudou o with_check.', r.policyname, r.tablename;
      end if;
    end if;

    if novo_qual is not null and novo_check is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)',
                     r.policyname, r.tablename, novo_qual, novo_check);
    elsif novo_qual is not null then
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, novo_qual);
    else
      execute format('alter policy %I on public.%I with check (%s)', r.policyname, r.tablename, novo_check);
    end if;

    alteradas := alteradas + 1;
  end loop;

  raise notice 'policies envolvidas em (select ...): %', alteradas;
end $$;
