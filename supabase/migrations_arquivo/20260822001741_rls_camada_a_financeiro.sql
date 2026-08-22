-- Sprint 1.3b — Camada A: financeiro, cobranca e segredos.
--
-- Antes desta migration, TODA tabela desta lista tinha uma unica policy no formato
-- `ALL to authenticated USING (true) WITH CHECK (true)`. Traduzindo: qualquer pessoa
-- logada — vendedor, professora, conta de teste — lia e ESCREVIA os 2.462 pagamentos,
-- os templates de cobranca, o balanco e as configuracoes. A tela escondia o menu; a API
-- entregava tudo.
--
-- Agora quem decide e a matriz da sprint 1.2, via `tem_permissao(recurso, acao)`. O acesso
-- passa a acompanhar o que esta cadastrado na tela de permissoes, em vez de ser fixo no SQL.
--
-- Detalhe que vale pro resto da sprint: nao basta criar policy restritiva. Varias tabelas
-- acumulavam policy restritiva E permissiva ao mesmo tempo, e como RLS soma com OU, a
-- frouxa sempre vencia e a restritiva era enfeite. Por isso cada bloco aqui DERRUBA as
-- antigas antes de criar as novas.

-- ─── Helper: reduz repeticao nos blocos abaixo ───────────────────────────────
create or replace function public.aplicar_camada(
  p_tabela  text,
  p_recurso text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare r record;
begin
  -- limpa o que existia
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

-- ─── Financeiro ──────────────────────────────────────────────────────────────
select public.aplicar_camada('pagamentos',  'financeiro');
select public.aplicar_camada('fechamentos', 'financeiro');

-- ─── Balanco ─────────────────────────────────────────────────────────────────
select public.aplicar_camada('balanco_config', 'balanco');
select public.aplicar_camada('balanco_itens',  'balanco');

-- ─── Cobranca ────────────────────────────────────────────────────────────────
select public.aplicar_camada('cobranca_config',        'cobranca');
select public.aplicar_camada('cobranca_templates',     'cobranca');
select public.aplicar_camada('cobranca_logs',          'cobranca');
select public.aplicar_camada('cobranca_ia_conversas',  'cobranca');
select public.aplicar_camada('cobranca_ia_mensagens',  'cobranca');
select public.aplicar_camada('cobranca_turmas_ativas', 'cobranca');
select public.aplicar_camada('canais_cobranca',        'cobranca');

-- ─── Configuracoes de e-mail (credenciais de SMTP) ───────────────────────────
select public.aplicar_camada('email_config', 'settings');

-- ─── Auditoria: so admin le, e ninguem escreve pela API ──────────────────────
drop policy if exists "Admins podem ler audit_logs" on public.audit_logs;
drop policy if exists "Nenhum insert direto de usuarios" on public.audit_logs;

create policy audit_logs_admin_le on public.audit_logs
  for select to authenticated
  using (public.is_admin());

comment on table public.audit_logs is
  'So admin le. Escrita e exclusiva de service_role (trigger/edge function) — nao existe policy de insert de proposito.';

-- ─── crm_config: leitura geral, escrita de admin ─────────────────────────────
-- Bug corrigido de passagem: so existia policy de SELECT. O `LeadsContext` tenta gravar
-- a config de webhook e levava 403 silencioso — nunca foi possivel salvar por ali.
drop policy if exists "allow read crm_config" on public.crm_config;

create policy crm_config_logado_le on public.crm_config
  for select to authenticated using (true);

create policy crm_config_admin_escreve on public.crm_config
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ─── Tabelas mortas do modulo "Seu Vendedor" ─────────────────────────────────
-- Nenhuma linha de codigo em src/ ou supabase/functions/ toca nelas: aparecem so no
-- types.ts gerado. Estavam com `ALL` liberado para {anon, authenticated}. Trancadas em
-- admin ate a limpeza da sprint 6 decidir se somem.
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

-- ─── Evolution API: escrita fecha, leitura fica ──────────────────────────────
-- NAO restringi a leitura porque dez telas dependem dela, incluindo o chat do Time
-- Comercial que o vendedor usa. Mas `evolution_config` guarda a API key do WhatsApp:
-- enquanto o frontend ler essa tabela, qualquer pessoa logada consegue a chave de envio.
-- A correcao de verdade e mover o envio pra tras de edge function e parar de expor a
-- coluna — isso e mudanca de codigo, nao de policy. Fica registrado como pendencia.
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
