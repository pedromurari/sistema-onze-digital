-- Sprint 1.3e — Escopo por turma no financeiro, e vendedor deixa de ver dinheiro.
--
-- Contexto do dono: a Keila esta cadastrada como `vendedor`, mas nao e vendedora — e
-- investidora de duas turmas ("Turma #02526/Keila" e "Turma #02426/Keila"). O escopo dela
-- ja estava certo na tela (`can_view_all_financeiro_turmas = false` + as 2 turmas em
-- `allowed_financeiro_turma_ids`), mas o banco nunca aplicou isso: ela lia os 2.462
-- pagamentos, quando deveria ver 576 (os 42 alunos das turmas dela).
--
-- Tres coisas aqui:
--   1. Corrige uma falha da sprint 1.2: os overrides migrados cobriram so a acao `ver`.
--      `can_view_all_*` nunca virou `ver_todos`, entao o escopo por turma era ignorado.
--   2. Tira `financeiro` e `balanco` do padrao do papel `vendedor` — quem for contratado
--      amanha nao herda mais acesso ao dinheiro. Quem precisa hoje fica por excecao.
--   3. Faz a RLS de `pagamentos` respeitar o escopo por turma de verdade.

-- ─── 1) `ver_todos` migrado das colunas antigas ──────────────────────────────
insert into public.user_permissao_override (user_id, recurso, acao, permitido)
select ap.user_id, x.recurso, 'ver_todos', x.valor
from public.user_access_permissions ap
join public.user_roles ur on ur.user_id = ap.user_id
cross join lateral (values
  ('financeiro',  ap.can_view_all_financeiro_turmas),
  ('lancamentos', ap.can_view_all_lancamentos)
) x(recurso, valor)
where ur.role <> 'admin'::public.app_role
  and x.valor is not null
  and x.valor is distinct from exists (
    select 1 from public.role_permissoes rp
    where rp.papel = ur.role and rp.recurso = x.recurso and rp.acao = 'ver_todos'
  )
on conflict (user_id, recurso, acao) do update set permitido = excluded.permitido;

-- ─── 2) Vendedor nao ve mais dinheiro por padrao ─────────────────────────────
-- Antes de mexer no padrao: quem HOJE tem acesso liberado na tela antiga vira excecao
-- explicita, senao a mudanca de padrao tiraria o acesso de quem precisa (a Keila).
insert into public.user_permissao_override (user_id, recurso, acao, permitido)
select ap.user_id, x.recurso, a.acao, true
from public.user_access_permissions ap
join public.user_roles ur on ur.user_id = ap.user_id
cross join lateral (values
  ('financeiro', ap.can_view_financeiro),
  ('balanco',    ap.can_view_balanco)
) x(recurso, tinha)
cross join (values ('ver'),('editar')) a(acao)
where ur.role = 'vendedor'::public.app_role
  and x.tinha is true
on conflict (user_id, recurso, acao) do update set permitido = true;

delete from public.role_permissoes
 where papel = 'vendedor'::public.app_role
   and recurso in ('financeiro','balanco');

-- ─── 3) Escopo por turma aplicado no banco ───────────────────────────────────
create or replace function public.turmas_financeiro_permitidas()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(
    (select ap.allowed_financeiro_turma_ids
       from public.user_access_permissions ap
      where ap.user_id = auth.uid()),
    '{}'::text[]);
$fn$;

comment on function public.turmas_financeiro_permitidas() is
  'Turmas que o usuario logado pode ver no financeiro. So vale para quem NAO tem `financeiro/ver_todos`.';

grant execute on function public.turmas_financeiro_permitidas() to authenticated;

-- `pagamentos.turma_id` esta preenchido em 2.461 das 2.462 linhas e bate 100% com o
-- `turma_id` do aluno, entao da pra escopar direto na coluna, sem subconsulta por linha.
drop policy if exists pagamentos_ver on public.pagamentos;
create policy pagamentos_ver on public.pagamentos
  for select to authenticated
  using (
    public.tem_permissao('financeiro','ver')
    and (
      public.tem_permissao('financeiro','ver_todos')
      or turma_id::text = any (public.turmas_financeiro_permitidas())
    )
  );

drop policy if exists pagamentos_update on public.pagamentos;
create policy pagamentos_update on public.pagamentos
  for update to authenticated
  using (
    public.tem_permissao('financeiro','ver')
    and public.tem_permissao('financeiro','editar')
    and (
      public.tem_permissao('financeiro','ver_todos')
      or turma_id::text = any (public.turmas_financeiro_permitidas())
    )
  )
  with check (
    public.tem_permissao('financeiro','ver')
    and public.tem_permissao('financeiro','editar')
    and (
      public.tem_permissao('financeiro','ver_todos')
      or turma_id::text = any (public.turmas_financeiro_permitidas())
    )
  );

drop policy if exists pagamentos_delete on public.pagamentos;
create policy pagamentos_delete on public.pagamentos
  for delete to authenticated
  using (
    public.tem_permissao('financeiro','ver')
    and public.tem_permissao('financeiro','editar')
    and (
      public.tem_permissao('financeiro','ver_todos')
      or turma_id::text = any (public.turmas_financeiro_permitidas())
    )
  );

comment on table public.pagamentos is
  'Camada A + escopo por turma: precisa de `financeiro/ver`, e quem nao tem `financeiro/ver_todos` so alcanca as turmas de allowed_financeiro_turma_ids.';
