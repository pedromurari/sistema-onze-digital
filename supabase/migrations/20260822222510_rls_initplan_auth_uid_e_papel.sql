-- Segunda passada do InitPlan: `auth.uid()`, `auth.role()`, `is_gestor()` e `is_admin()`.
--
-- A primeira passada envolveu `tem_permissao(...)` e resolveu quase tudo:
--     pagamentos       218 ms -> 13 ms
--     lancamento_leads          -> 50 ms  (13.032 linhas)
--     whatsapp_mensagens        -> 60 ms  (12.953 linhas)
--
-- `leads` ficou em 850 ms porque a policy dela tem outra forma:
--     (auth.uid() = responsavel_id) OR is_gestor() OR (...)
-- `auth.uid()` e `is_gestor()` nao dependem da linha, mas o planejador so sabe disso se
-- estiverem envolvidos. `auth.uid() = responsavel_id` continua comparando por linha — o que
-- muda e que o UUID de quem esta logado passa a ser buscado uma vez, nao 11.778 vezes.
--
-- Mesma trava da primeira passada: desfazer o embrulho por texto tem que devolver a
-- expressao original, senao levanta excecao e desfaz tudo.

do $$
declare
  r          record;
  novo_qual  text;
  novo_check text;
  confere    text;
  alteradas  int := 0;
  padroes    text[] := array[
    'auth\.uid\(\)',
    'auth\.role\(\)',
    'is_gestor\(\)',
    'is_admin\(\)'
  ];
  padrao     text;
begin
  for r in
    select p.tablename, p.policyname, p.qual, p.with_check
      from pg_policies p
     where p.schemaname = 'public'
       and (p.qual ~ '(auth\.uid\(\)|auth\.role\(\)|is_gestor\(\)|is_admin\(\))'
         or p.with_check ~ '(auth\.uid\(\)|auth\.role\(\)|is_gestor\(\)|is_admin\(\))')
  loop
    novo_qual  := r.qual;
    novo_check := r.with_check;

    foreach padrao in array padroes loop
      if novo_qual is not null then
        novo_qual := regexp_replace(novo_qual, '(?<!\(select )(' || padrao || ')', '(select \1)', 'g');
      end if;
      if novo_check is not null then
        novo_check := regexp_replace(novo_check, '(?<!\(select )(' || padrao || ')', '(select \1)', 'g');
      end if;
    end loop;

    if novo_qual is not distinct from r.qual and novo_check is not distinct from r.with_check then
      continue;
    end if;

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

  raise notice 'policies com auth/papel envolvidos: %', alteradas;
end $$;
