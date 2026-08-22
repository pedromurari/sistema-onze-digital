-- Sprint 1.3d — Fecha a propria tabela de permissoes.
-- `user_access_permissions` tinha uma policy `Admins can manage` E uma `ALL USING(true)`
-- para authenticated. Como RLS soma com OU, a frouxa vencia: qualquer pessoa logada podia
-- reescrever as listas de escopo (allowed_lancamento_ids / allowed_financeiro_turma_ids)
-- de qualquer usuario, inclusive as proprias.
--
-- A tabela ja nao decide mais permissao de tela (isso e a matriz da sprint 1.2); sobrou
-- so o escopo por registro, que sai na 1.3 quando escopo por dono for tratado.

do $$
declare r record;
begin
  for r in select policyname from pg_policies
            where schemaname='public' and tablename='user_access_permissions'
  loop
    execute format('drop policy %I on public.user_access_permissions', r.policyname);
  end loop;
end $$;

create policy uap_le_o_proprio on public.user_access_permissions
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy uap_admin_escreve on public.user_access_permissions
  for insert to authenticated
  with check (public.is_admin());

create policy uap_admin_atualiza on public.user_access_permissions
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy uap_admin_apaga on public.user_access_permissions
  for delete to authenticated
  using (public.is_admin());

comment on table public.user_access_permissions is
  'Legado: so as listas allowed_lancamento_ids / allowed_financeiro_turma_ids ainda valem. Permissao de tela agora e a matriz (app_recursos / role_permissoes / user_permissao_override).';
