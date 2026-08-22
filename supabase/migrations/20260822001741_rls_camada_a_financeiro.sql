-- Sprint 1.3b — Camada A: financeiro, cobranca e segredos.
-- Antes: toda tabela desta lista tinha uma unica policy `ALL to authenticated USING(true)`.
-- Qualquer pessoa logada lia e ESCREVIA os 2.462 pagamentos, templates de cobranca, balanco
-- e configuracoes. Agora quem decide e a matriz da 1.2, via tem_permissao(recurso, acao).
-- Cada bloco DERRUBA as policies antigas antes de criar: policy restritiva convivendo com
-- permissiva nao adianta nada, porque RLS soma com OU e a frouxa vence.

create or replace function public.aplicar_camada(p_tabela text, p_recurso text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare r record;
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
      for all to authenticated
      using (public.tem_permissao(%L, 'editar'))
      with check (public.tem_permissao(%L, 'editar'))
  $f$, p_tabela || '_editar', p_tabela, p_recurso, p_recurso);
end;
$fn$;

comment on function public.aplicar_camada(text, text) is
  'Troca todas as policies de uma tabela pelo par ver/editar amarrado a um recurso da matriz. Uso interno das migrations de RLS.';

select public.aplicar_camada('pagamentos',  'financeiro');
select public.aplicar_camada('fechamentos', 'financeiro');

select public.aplicar_camada('balanco_config', 'balanco');
select public.aplicar_camada('balanco_itens',  'balanco');

select public.aplicar_camada('cobranca_config',        'cobranca');
select public.aplicar_camada('cobranca_templates',     'cobranca');
select public.aplicar_camada('cobranca_logs',          'cobranca');
select public.aplicar_camada('cobranca_ia_conversas',  'cobranca');
select public.aplicar_camada('cobranca_ia_mensagens',  'cobranca');
select public.aplicar_camada('cobranca_turmas_ativas', 'cobranca');
select public.aplicar_camada('canais_cobranca',        'cobranca');

select public.aplicar_camada('email_config', 'settings');

drop policy if exists "Admins podem ler audit_logs" on public.audit_logs;
drop policy if exists "Nenhum insert direto de usuarios" on public.audit_logs;

create policy audit_logs_admin_le on public.audit_logs
  for select to authenticated
  using (public.is_admin());

comment on table public.audit_logs is
  'So admin le. Escrita e exclusiva de service_role (trigger/edge function) — nao existe policy de insert de proposito.';

-- Bug corrigido de passagem: crm_config so tinha policy de SELECT. O LeadsContext tenta
-- gravar a config de webhook e levava 403 silencioso — nunca foi possivel salvar por ali.
drop policy if exists "allow read crm_config" on public.crm_config;

create policy crm_config_logado_le on public.crm_config
  for select to authenticated using (true);

create policy crm_config_admin_escreve on public.crm_config
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Tabelas mortas do modulo "Seu Vendedor": nenhum consumidor em src/ nem em
-- supabase/functions/. Estavam com ALL liberado para {anon, authenticated}.
do $$
declare t text;
begin
  foreach t in array array['sv_app_config','sv_campanhas','sv_evolution_configs',
                           'sv_lead_mensagens','sv_leads','sv_reunioes','sv_scripts','sv_tarefas']
  loop
    execute format('drop policy if exists sv_allow_all on public.%I', t);
    execute format('drop policy if exists sv_app_config_read on public.%I', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (public.is_admin()) with check (public.is_admin())
    $f$, t || '_admin', t);
    execute format('comment on table public.%I is %L', t,
      'Modulo "Seu Vendedor" sem nenhum consumidor no codigo. Trancada em admin ate a limpeza da sprint 6.');
  end loop;
end $$;

-- Evolution API: escrita fecha, leitura fica. Dez telas dependem da leitura, incluindo o
-- chat do Time Comercial que o vendedor usa.
do $$
declare t text;
begin
  foreach t in array array['evolution_config','evolution_task_config','evolution_conexao_eventos']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_authenticated', t);
    execute format('drop policy if exists "Autenticados podem ler e escrever evolution_task_config" on public.%I', t);
    execute format($f$
      create policy %I on public.%I for select to authenticated using (true)
    $f$, t || '_ver', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (public.is_admin()) with check (public.is_admin())
    $f$, t || '_admin_escreve', t);
  end loop;
end $$;

comment on table public.evolution_config is
  'PENDENCIA DE SEGURANCA: guarda a API key do WhatsApp e e lida pelo frontend (10 telas, inclusive o chat do Time Comercial). Escrita ja e so de admin; a leitura so fecha quando o envio sair do cliente para uma edge function.';
