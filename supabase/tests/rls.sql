-- ============================================================================
-- Testes de RLS — rodam SÓ no banco local.
--
--   npm run test:rls        (exige `supabase start` no ar)
--
-- Falha com `raise exception` na primeira divergência, então o comando sai com código
-- diferente de zero e o script quebra. Sem dependência de pgTAP.
--
-- SEGURANÇA: nenhum teste aqui escreve em `lancamento_leads` nem `npa_evento_leads` — as
-- duas tabelas com gatilho de envio. O seed já desliga esses gatilhos, mas a regra vale
-- em dobro: cinto e suspensório.
-- ============================================================================

\set ON_ERROR_STOP on

do $$
declare
  v_admin      uuid := '00000000-0000-4000-a000-000000000001';
  v_gestor     uuid := '00000000-0000-4000-a000-000000000002';
  v_vendedor   uuid := '00000000-0000-4000-a000-000000000003';
  v_investidor uuid := '00000000-0000-4000-a000-000000000004';
  v_parceiro   uuid := '00000000-0000-4000-a000-000000000005';
  falhas       text := '';
  n            bigint;
begin
  -- ── pagamentos ───────────────────────────────────────────────────────────
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub',v_vendedor,'role','authenticated')::text, true);
  select count(*) into n from public.pagamentos;
  perform set_config('role','postgres',true);
  if n <> 0 then
    falhas := falhas || format(E'vendedor deveria ver 0 pagamentos, viu %s\n', n);
  end if;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub',v_investidor,'role','authenticated')::text, true);
  select count(*) into n from public.pagamentos;
  perform set_config('role','postgres',true);
  -- O gatilho gera 12 parcelas por aluno.
  if n <> 12 then
    falhas := falhas || format(E'investidor deveria ver 12 pagamentos (so a turma dele), viu %s\n', n);
  end if;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated')::text, true);
  select count(*) into n from public.pagamentos;
  perform set_config('role','postgres',true);
  if n <> 24 then
    falhas := falhas || format(E'admin deveria ver 24 pagamentos (12 por aluno), viu %s\n', n);
  end if;

  -- ── alunos: escopo por turma do investidor ───────────────────────────────
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub',v_investidor,'role','authenticated')::text, true);
  select count(*) into n from public.alunos;
  perform set_config('role','postgres',true);
  if n <> 1 then
    falhas := falhas || format(E'investidor deveria ver 1 aluno (so a turma dele), viu %s\n', n);
  end if;

  -- ── parceiro nao ve NADA do CRM ──────────────────────────────────────────
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub',v_parceiro,'role','authenticated')::text, true);
  select (select count(*) from public.alunos)
       + (select count(*) from public.pagamentos)
       + (select count(*) from public.leads)
       + (select count(*) from public.pessoas) into n;
  perform set_config('role','postgres',true);
  if n <> 0 then
    falhas := falhas || format(E'parceiro deveria ver 0 linhas somando alunos+pagamentos+leads+pessoas, viu %s\n', n);
  end if;

  -- ── pool de leads exige permissao comercial ──────────────────────────────
  -- Regressao real: a policy liberava o pool para QUALQUER logado, e a parceira via tudo.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub',v_vendedor,'role','authenticated')::text, true);
  select count(*) into n from public.leads;
  perform set_config('role','postgres',true);
  if n <> 1 then
    falhas := falhas || format(E'vendedor deveria ver 1 lead do pool, viu %s\n', n);
  end if;

  -- ── segredo de e-mail so para admin ──────────────────────────────────────
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub',v_gestor,'role','authenticated')::text, true);
  select count(*) into n from public.email_config;
  perform set_config('role','postgres',true);
  if n <> 0 then
    falhas := falhas || format(E'gestor nao deveria ler email_config, leu %s linha(s)\n', n);
  end if;

  -- ── escalada de privilegio ───────────────────────────────────────────────
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub',v_vendedor,'role','authenticated')::text, true);
  begin
    perform public.definir_permissao(v_vendedor, 'settings', 'ver', true);
    falhas := falhas || E'vendedor conseguiu se dar permissao de Settings\n';
  exception when others then
    null;  -- esperado: a funcao recusa
  end;
  perform set_config('role','postgres',true);

  -- ── anonimo nao le nada ──────────────────────────────────────────────────
  perform set_config('role','anon',true);
  perform set_config('request.jwt.claims', null, true);
  begin
    select count(*) into n from public.alunos;
    if n > 0 then
      falhas := falhas || format(E'anonimo leu %s alunos\n', n);
    end if;
  exception when others then
    null;  -- esperado: sem GRANT, nem conta
  end;
  perform set_config('role','postgres',true);

  if falhas <> '' then
    raise exception E'\n=== TESTES DE RLS FALHARAM ===\n%', falhas;
  end if;

  raise notice 'RLS ok: todos os perfis enxergam exatamente o esperado.';
end $$;
