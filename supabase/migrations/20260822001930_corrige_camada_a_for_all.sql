-- Sprint 1.3c — Corrige a camada A: `FOR ALL` estava reabrindo a leitura.
-- No Postgres FOR ALL tambem cobre SELECT. Como o padrao do papel vendedor tem `editar`
-- em financeiro (herdado do modelo antigo, sem distincao ver/editar), a policy de escrita
-- reabria a leitura: Helen, com financeiro/ver NEGADO, lia os 2.462 pagamentos.
-- Correcoes: escrita vira INSERT/UPDATE/DELETE explicitos, e escrever exige `ver` E `editar`.

create or replace function public.aplicar_camada(p_tabela text, p_recurso text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  r   record;
  cmd text;
begin
  for r in select policyname from pg_policies
            where schemaname = 'public' and tablename = p_tabela
  loop
    execute format('drop policy %I on public.%I', r.policyname, p_tabela);
  end loop;

  execute format($f$
    create policy %I on public.%I
      for select to authenticated
      using (public.tem_permissao(%L, 'ver'))
  $f$, p_tabela || '_ver', p_tabela, p_recurso);

  execute format($f$
    create policy %I on public.%I
      for insert to authenticated
      with check (public.tem_permissao(%L, 'ver') and public.tem_permissao(%L, 'editar'))
  $f$, p_tabela || '_inserir', p_tabela, p_recurso, p_recurso);

  foreach cmd in array array['update','delete']
  loop
    execute format($f$
      create policy %I on public.%I
        for %s to authenticated
        using (public.tem_permissao(%L, 'ver') and public.tem_permissao(%L, 'editar'))
    $f$, p_tabela || '_' || cmd, p_tabela, cmd, p_recurso, p_recurso);
  end loop;

  execute format($f$
    alter policy %I on public.%I
      with check (public.tem_permissao(%L, 'ver') and public.tem_permissao(%L, 'editar'))
  $f$, p_tabela || '_update', p_tabela, p_recurso, p_recurso);
end;
$fn$;

comment on function public.aplicar_camada(text, text) is
  'SELECT amarrado a `ver`; INSERT/UPDATE/DELETE amarrados a `ver` + `editar`. Nunca usar FOR ALL — FOR ALL cobre SELECT e reabre a leitura.';

select public.aplicar_camada('pagamentos',            'financeiro');
select public.aplicar_camada('fechamentos',           'financeiro');
select public.aplicar_camada('balanco_config',        'balanco');
select public.aplicar_camada('balanco_itens',         'balanco');
select public.aplicar_camada('cobranca_config',       'cobranca');
select public.aplicar_camada('cobranca_templates',    'cobranca');
select public.aplicar_camada('cobranca_logs',         'cobranca');
select public.aplicar_camada('cobranca_ia_conversas', 'cobranca');
select public.aplicar_camada('cobranca_ia_mensagens', 'cobranca');
select public.aplicar_camada('cobranca_turmas_ativas','cobranca');
select public.aplicar_camada('canais_cobranca',       'cobranca');
select public.aplicar_camada('email_config',          'settings');
