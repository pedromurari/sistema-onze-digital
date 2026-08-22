-- ============================================================================
-- BASELINE DO SCHEMA — gerado de producao em 2026-08-22 via `supabase db dump`.
--
-- POR QUE ESTE ARQUIVO EXISTE:
-- o historico de migrations nao reproduzia o banco. Eram 211 arquivos no repo contra 301
-- migrations registradas em producao, e o schema base (profiles, alunos, leads, turmas,
-- pagamentos, tarefas) nao estava em nenhum deles — foi criado direto no dashboard, antes
-- do historico comecar. `supabase start` morria na migration 40, em
-- `20260106190000_create_operations_tables.sql`, que referencia `tarefas` (criada depois,
-- pelo dashboard) e `users` (que nunca existiu neste banco).
--
-- Sem isto nao havia banco local, staging, teste de RLS, nem restauracao pelo repositorio.
--
-- O historico antigo esta em `supabase/migrations_arquivo/` — arquivado, nao apagado:
-- ainda serve para entender por que uma decisao foi tomada.
--
-- PENDENCIA: o historico REMOTO ainda tem as 301 entradas antigas. Enquanto nao for
-- reparado, `supabase db push` vai reclamar de divergencia. Aplicar mudanca em producao
-- continua sendo pelo painel/MCP ate essa decisao ser tomada.
-- ============================================================================

-- ── Extensoes ────────────────────────────────────────────────────────────────
-- `supabase db dump` NAO inclui extensoes: no projeto hospedado elas sao gerenciadas pela
-- plataforma, mas o banco local nasce sem nenhuma. Sem isto o baseline morre no indice
-- trigram de `pessoas` (statement 979): "operator class public.gin_trgm_ops does not exist".
--
-- Os schemas abaixo espelham producao (conferido em 22/08/2026): pg_trgm e pg_net vivem em
-- `public`, o resto em `extensions`. Se mudarem la, mudar aqui.
create extension if not exists pg_trgm     with schema public;
create extension if not exists pg_net      with schema public;
create extension if not exists pgcrypto    with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'vendedor',
    'parceiro',
    'gestor',
    'professora',
    'investidor'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


COMMENT ON TYPE "public"."app_role" IS 'admin, gestor, vendedor, professora, parceiro, investidor. Investidor ve o financeiro so das turmas em allowed_financeiro_turma_ids.';



CREATE TYPE "public"."funnel_message_status" AS ENUM (
    'draft',
    'scheduled',
    'sent',
    'error'
);


ALTER TYPE "public"."funnel_message_status" OWNER TO "postgres";


CREATE TYPE "public"."funnel_recipient_type" AS ENUM (
    'group',
    'number'
);


ALTER TYPE "public"."funnel_recipient_type" OWNER TO "postgres";


CREATE TYPE "public"."quick_send_status" AS ENUM (
    'sent',
    'error'
);


ALTER TYPE "public"."quick_send_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aplicar_camada"("p_tabela" "text", "p_recurso" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."aplicar_camada"("p_tabela" "text", "p_recurso" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."aplicar_camada"("p_tabela" "text", "p_recurso" "text") IS 'SELECT amarrado a `ver`; INSERT/UPDATE/DELETE amarrados a `ver` + `editar`. Nunca usar FOR ALL — FOR ALL cobre SELECT e reabre a leitura.';



CREATE OR REPLACE FUNCTION "public"."aplicar_camada_catalogo"("p_tabela" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
    create policy %I on public.%I for select to authenticated using (true)
  $f$, p_tabela || '_ver', p_tabela);

  execute format($f$
    create policy %I on public.%I
      for insert to authenticated with check (public.is_gestor())
  $f$, p_tabela || '_inserir', p_tabela);

  foreach cmd in array array['update','delete']
  loop
    execute format($f$
      create policy %I on public.%I for %s to authenticated using (public.is_gestor())
    $f$, p_tabela || '_' || cmd, p_tabela, cmd);
  end loop;

  execute format($f$
    alter policy %I on public.%I with check (public.is_gestor())
  $f$, p_tabela || '_update', p_tabela);
end;
$_$;


ALTER FUNCTION "public"."aplicar_camada_catalogo"("p_tabela" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."aplicar_camada_catalogo"("p_tabela" "text") IS 'Camada D: leitura para qualquer usuario logado, escrita so para gestor/admin.';



CREATE OR REPLACE FUNCTION "public"."aplicar_camada_multi"("p_tabela" "text", "p_recursos" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  r        record;
  cmd      text;
  cond_ver text;
  cond_edt text;
begin
  -- Preserva policies do papel anon: sao as de captura publica (matricula, inscricao
  -- em evento, resolucao de link encurtado).
  for r in select policyname from pg_policies
            where schemaname = 'public' and tablename = p_tabela
              and roles::text not like '%anon%'
  loop
    execute format('drop policy %I on public.%I', r.policyname, p_tabela);
  end loop;

  select string_agg(format('public.tem_permissao(%L, %L)', x, 'ver'),    ' or ')
    into cond_ver from unnest(p_recursos) x;
  select string_agg(format('public.tem_permissao(%L, %L)', x, 'editar'), ' or ')
    into cond_edt from unnest(p_recursos) x;

  execute format('create policy %I on public.%I for select to authenticated using (%s)',
                 p_tabela || '_ver', p_tabela, cond_ver);
  execute format('create policy %I on public.%I for insert to authenticated with check ((%s) and (%s))',
                 p_tabela || '_inserir', p_tabela, cond_ver, cond_edt);
  foreach cmd in array array['update','delete']
  loop
    execute format('create policy %I on public.%I for %s to authenticated using ((%s) and (%s))',
                   p_tabela || '_' || cmd, p_tabela, cmd, cond_ver, cond_edt);
  end loop;
  execute format('alter policy %I on public.%I with check ((%s) and (%s))',
                 p_tabela || '_update', p_tabela, cond_ver, cond_edt);
end;
$$;


ALTER FUNCTION "public"."aplicar_camada_multi"("p_tabela" "text", "p_recursos" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."aplicar_camada_multi"("p_tabela" "text", "p_recursos" "text"[]) IS 'Como aplicar_camada, mas aceita varios recursos (basta ter permissao em UM) e NAO derruba policies do papel anon.';



CREATE OR REPLACE FUNCTION "public"."atualizar_fase_npa_lead"("p_lead_id" "uuid", "p_nova_fase" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  -- Valida se a fase é válida
  IF p_nova_fase NOT IN (
    'novo', 'ingresso_pago', 'no_grupo', 'confirmado',
    'evento', 'closer', 'follow_up_01', 'follow_up_02',
    'follow_up_03', 'matricula'
  ) THEN
    RAISE EXCEPTION 'Fase inválida: %', p_nova_fase;
  END IF;

  UPDATE public.npa_evento_leads
  SET
    fase = p_nova_fase,
    ultima_atividade = now(),
    updated_at = now()
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado: %', p_lead_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."atualizar_fase_npa_lead"("p_lead_id" "uuid", "p_nova_fase" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_disparo_36"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
DECLARE
  v_campanha_pm UUID := '19cfe283-d415-40be-96d2-7cd559e7f9d9';
  v_campanha_ig UUID := '1a56539d-8546-4f11-92e3-6a865efb7aca';
  v_target UUID;
  v_phone TEXT;
  v_count_pm INT;
  v_count_ig INT;
BEGIN
  -- Só para Turma #36
  IF NEW.lancamento_id != 'bc9a8236-66f4-4702-b508-4760ae8305f0' THEN
    RETURN NEW;
  END IF;

  v_phone := REGEXP_REPLACE(COALESCE(NEW.whatsapp, ''), '[^0-9]', '', 'g');
  IF v_phone = '' THEN RETURN NEW; END IF;

  -- Se entrou no grupo: cancela envio pendente
  IF TG_OP = 'UPDATE' AND NEW.no_grupo = true AND (OLD.no_grupo IS NULL OR OLD.no_grupo = false) THEN
    UPDATE disparo_leads
      SET status = 'pulado', error_msg = 'Entrou no grupo'
    WHERE phone = v_phone
      AND campanha_id IN (v_campanha_pm, v_campanha_ig)
      AND status = 'pendente';
    RETURN NEW;
  END IF;

  -- Se é INSERT e ainda não entrou no grupo
  IF TG_OP = 'INSERT' AND (NEW.no_grupo IS NULL OR NEW.no_grupo = false) THEN
    -- Evita duplicata
    IF EXISTS (
      SELECT 1 FROM disparo_leads
      WHERE phone = v_phone
        AND campanha_id IN (v_campanha_pm, v_campanha_ig)
        AND status IN ('pendente', 'enviado')
    ) THEN RETURN NEW; END IF;

    -- Alterna PM/IG pelo que tem menos pendentes
    SELECT COUNT(*) INTO v_count_pm FROM disparo_leads
      WHERE campanha_id = v_campanha_pm AND status = 'pendente';
    SELECT COUNT(*) INTO v_count_ig FROM disparo_leads
      WHERE campanha_id = v_campanha_ig AND status = 'pendente';

    v_target := CASE WHEN v_count_pm <= v_count_ig THEN v_campanha_pm ELSE v_campanha_ig END;

    INSERT INTO disparo_leads (campanha_id, nome, phone, status, ordem)
    VALUES (v_target, NEW.nome, v_phone, 'pendente', EXTRACT(EPOCH FROM NOW())::BIGINT);

    UPDATE disparo_campanhas SET leads_total = leads_total + 1 WHERE id = v_target;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_disparo_36"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."definir_permissao"("p_user_id" "uuid", "p_recurso" "text", "p_acao" "text", "p_permitido" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_papel  public.app_role;
  v_padrao boolean;
begin
  if not public.is_admin() then
    raise exception 'Apenas admin pode alterar permissao';
  end if;

  if not exists (select 1 from public.app_recursos where chave = p_recurso) then
    raise exception 'Recurso desconhecido: %', p_recurso;
  end if;

  select ur.role into v_papel from public.user_roles ur where ur.user_id = p_user_id;

  v_padrao := exists (
    select 1 from public.role_permissoes rp
    where rp.papel = v_papel and rp.recurso = p_recurso and rp.acao = p_acao
  );

  if p_permitido = v_padrao then
    delete from public.user_permissao_override
     where user_id = p_user_id and recurso = p_recurso and acao = p_acao;
  else
    insert into public.user_permissao_override (user_id, recurso, acao, permitido)
    values (p_user_id, p_recurso, p_acao, p_permitido)
    on conflict (user_id, recurso, acao)
    do update set permitido = excluded.permitido, definido_em = now();
  end if;
end;
$$;


ALTER FUNCTION "public"."definir_permissao"("p_user_id" "uuid", "p_recurso" "text", "p_acao" "text", "p_permitido" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."definir_permissao"("p_user_id" "uuid", "p_recurso" "text", "p_acao" "text", "p_permitido" boolean) IS 'Grava um toggle de permissao. Se a escolha bate com o padrao do papel, remove o override.';



CREATE OR REPLACE FUNCTION "public"."deletar_tarefa_cancelada"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status = 'cancelada' THEN
    DELETE FROM tarefas WHERE id = NEW.id;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."deletar_tarefa_cancelada"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."desbloquear_primeira_etapa"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  IF NEW.ordem = 1 THEN
    NEW.desbloqueada = true;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."desbloquear_primeira_etapa"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."desbloquear_proxima_etapa"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status = 'concluido' AND OLD.status != 'concluido' THEN
    UPDATE public.tarefas_etapas
    SET desbloqueada = true
    WHERE tarefa_id = NEW.tarefa_id
      AND ordem = NEW.ordem + 1;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."desbloquear_proxima_etapa"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gerar_mensalidades_aluno"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
DECLARE
  i INTEGER;
  data_venc DATE;
  total_parc INTEGER;
  valor_mens NUMERIC;
  data_base DATE;
BEGIN
  SELECT total_mensalidades, valor_mensalidade
  INTO total_parc, valor_mens
  FROM public.turmas WHERE id = NEW.turma_id;

  IF total_parc IS NULL THEN total_parc := 14; END IF;
  IF valor_mens IS NULL THEN valor_mens := 109.90; END IF;

  data_base := COALESCE(NEW.data_inicio, CURRENT_DATE);

  FOR i IN 1..total_parc LOOP
    -- Vai para o mês correto e ajusta para o dia de vencimento
    data_venc := (DATE_TRUNC('month', data_base) + ((i - 1) * INTERVAL '1 month'))::DATE
                  + (NEW.dia_vencimento - 1);

    -- Segurança: se dia_vencimento=10, vai para dia 10; se=20, dia 20
    -- Evita overflow em meses com menos dias (ex: fevereiro)
    data_venc := LEAST(
      data_venc,
      (DATE_TRUNC('month', data_venc) + INTERVAL '1 month' - INTERVAL '1 day')::DATE
    );

    INSERT INTO public.pagamentos (
      aluno_id, turma_id, produto,
      valor, mes_referencia, data_vencimento,
      numero_parcela, status
    ) VALUES (
      NEW.id, NEW.turma_id, NEW.produto,
      valor_mens,
      DATE_TRUNC('month', data_venc)::DATE,
      data_venc,
      i,
      'pendente'
    );
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."gerar_mensalidades_aluno"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_alunos_para_cobranca"("p_data" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("aluno_id" "uuid", "aluno_nome" "text", "telefone" "text", "pagamento_id" "uuid", "valor" numeric, "parcela" integer, "data_vencimento" "date", "dias_offset" integer, "link_pagamento" "text", "pagamento_status" "text", "data_prevista_pagamento" "date", "cobranca_ia_ativa" boolean, "cobranca_ativa" boolean)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
  SELECT
    a.id            AS aluno_id,
    a.nome          AS aluno_nome,
    COALESCE(a.cobranca_telefone, a.whatsapp) AS telefone,
    p.id            AS pagamento_id,
    p.valor,
    p.numero_parcela AS parcela,
    p.data_vencimento,
    (p_data - p.data_vencimento)::INTEGER AS dias_offset,
    COALESCE(a.asaas_link, a.voomp_link, '') AS link_pagamento,
    p.status        AS pagamento_status,
    p.data_prevista_pagamento,
    a.cobranca_ia_ativa,
    a.cobranca_ativa
  FROM public.pagamentos p
  JOIN public.alunos     a   ON a.id = p.aluno_id
  JOIN public.cobranca_turmas_ativas cta ON cta.turma_id = a.turma_id
  WHERE
    a.status NOT IN ('cancelado', 'concluido')
    AND a.forma_pagamento = 'boleto'
    AND (
      p.status = 'atrasado'
      OR (p.status = 'pendente' AND date_trunc('month', p.data_vencimento) = date_trunc('month', p_data))
      OR (p.status = 'pendente' AND p.data_vencimento < p_data)
    )
    AND COALESCE(a.cobranca_telefone, a.whatsapp) IS NOT NULL
    AND COALESCE(a.cobranca_telefone, a.whatsapp) <> ''
  ORDER BY a.nome, p.data_vencimento;
$$;


ALTER FUNCTION "public"."get_alunos_para_cobranca"("p_data" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_equipe_11ds_composite_config"() RETURNS TABLE("url" "text", "secret" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'equipe_11ds_composite_url' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'equipe_11ds_composite_secret' limit 1);
$$;


ALTER FUNCTION "public"."get_equipe_11ds_composite_config"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_equipe_11ds_cron_secret"() RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select decrypted_secret from vault.decrypted_secrets where name = 'equipe_11ds_cron_secret' limit 1;
$$;


ALTER FUNCTION "public"."get_equipe_11ds_cron_secret"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_equipe_11ds_elevenlabs_key"() RETURNS TABLE("api_key" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'equipe_11ds_elevenlabs_key' limit 1);
$$;


ALTER FUNCTION "public"."get_equipe_11ds_elevenlabs_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_equipe_11ds_github_config"() RETURNS TABLE("token" "text", "repo" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'equipe_11ds_github_token' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'equipe_11ds_github_repo' limit 1);
$$;


ALTER FUNCTION "public"."get_equipe_11ds_github_config"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_idm_reels_worker_config"() RETURNS TABLE("url" "text", "secret" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'idm_reels_worker_url' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'idm_reels_worker_secret' limit 1);
$$;


ALTER FUNCTION "public"."get_idm_reels_worker_config"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pexels_api_key"() RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select decrypted_secret from vault.decrypted_secrets where name = 'pexels_api_key' limit 1;
$$;


ALTER FUNCTION "public"."get_pexels_api_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select public.has_role(auth.uid(), 'admin'::public.app_role); $$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_gestor"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'gestor'::public.app_role);
$$;


ALTER FUNCTION "public"."is_gestor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_lancamento_evento"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lancamento_eventos (lancamento_id, evento, payload)
    VALUES (NEW.id, 'criado', row_to_json(NEW)::jsonb);
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    INSERT INTO public.lancamento_eventos (lancamento_id, evento, payload)
    VALUES (NEW.id, 'status_' || NEW.status, row_to_json(NEW)::jsonb);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_lancamento_evento"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_npa_evento"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.npa_eventos_log (npa_evento_id, evento, payload)
    VALUES (NEW.id, 'criado', row_to_json(NEW)::jsonb);
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    INSERT INTO public.npa_eventos_log (npa_evento_id, evento, payload)
    VALUES (NEW.id, 'status_' || NEW.status, row_to_json(NEW)::jsonb);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_npa_evento"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."marcar_matriculado_lead_direto"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.origem = 'Direto' and new.status = 'matricula' and (old.status is distinct from 'matricula') then
    new.matriculado_em := coalesce(new.matriculado_em, now());
  elsif new.origem = 'Direto' and new.status is distinct from 'matricula' and old.status = 'matricula' then
    -- Saiu de matricula (correcao de status) -- limpa, pra nao contar em metas.
    new.matriculado_em := null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."marcar_matriculado_lead_direto"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."marcar_pagamentos_atrasados"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.pagamentos
  SET status = 'atrasado'
  WHERE status = 'pendente'
    AND data_vencimento < CURRENT_DATE;
END;
$$;


ALTER FUNCTION "public"."marcar_pagamentos_atrasados"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."minhas_permissoes"() RETURNS TABLE("recurso" "text", "acao" "text", "permitido" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select r.chave,
         a.acao,
         coalesce(
           (select o.permitido from public.user_permissao_override o
             where o.user_id = auth.uid() and o.recurso = r.chave and o.acao = a.acao),
           exists (select 1 from public.role_permissoes rp
                    join public.user_roles ur on ur.role = rp.papel
                   where ur.user_id = auth.uid() and rp.recurso = r.chave and rp.acao = a.acao)
         )
  from public.app_recursos r
  cross join (values ('ver'),('editar'),('excluir'),('ver_todos')) a(acao);
$$;


ALTER FUNCTION "public"."minhas_permissoes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalizar_telefone"("p_valor" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with d as (select regexp_replace(coalesce(p_valor, ''), '\D', '', 'g') as x),
  sem_pais as (
    select case
      when length(x) > 14 then null              -- id de grupo do WhatsApp, nao telefone
      when x like '55%' and length(x) >= 12 then substr(x, 3)
      else x
    end as y from d
  ),
  sem_zero as (
    select case
      when y is null then null
      when y like '0%' then substr(y, 2)         -- zero de operadora colado no DDD
      else y
    end as w from sem_pais
  )
  select case
    when w is null or length(w) < 10 then null
    when length(w) = 11 then '55' || w
    when length(w) = 10 and substr(w, 3, 1) between '6' and '9'
      then '55' || substr(w, 1, 2) || '9' || substr(w, 3)
    when length(w) = 10 then '55' || w
    else null
  end
  from sem_zero;
$$;


ALTER FUNCTION "public"."normalizar_telefone"("p_valor" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."normalizar_telefone"("p_valor" "text") IS 'Telefone brasileiro canonico (55 + DDD + numero). NULL para o que nao e telefone.';



CREATE OR REPLACE FUNCTION "public"."notificar"("p_user_id" "uuid", "p_tipo" "text", "p_titulo" "text", "p_descricao" "text" DEFAULT NULL::"text", "p_link" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.notifications (user_id, tipo, titulo, descricao, link)
  VALUES (p_user_id, p_tipo, p_titulo, p_descricao, p_link)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."notificar"("p_user_id" "uuid", "p_tipo" "text", "p_titulo" "text", "p_descricao" "text", "p_link" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notificar_admins"("p_tipo" "text", "p_titulo" "text", "p_descricao" "text" DEFAULT NULL::"text", "p_link" "text" DEFAULT NULL::"text") RETURNS SETOF "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  FOR v_admin_id IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    RETURN NEXT public.notificar(v_admin_id, p_tipo, p_titulo, p_descricao, p_link);
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."notificar_admins"("p_tipo" "text", "p_titulo" "text", "p_descricao" "text", "p_link" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notificar_vendedores_ativos"("p_tipo" "text", "p_titulo" "text", "p_descricao" "text" DEFAULT NULL::"text", "p_link" "text" DEFAULT NULL::"text") RETURNS SETOF "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id UUID;
BEGIN
  FOR v_user_id IN
    SELECT p.id
    FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.ativo = true
      AND COALESCE(ur.role, 'vendedor') IN ('vendedor', 'admin')
  LOOP
    RETURN NEXT public.notificar(v_user_id, p_tipo, p_titulo, p_descricao, p_link);
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."notificar_vendedores_ativos"("p_tipo" "text", "p_titulo" "text", "p_descricao" "text", "p_link" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_n8n_npa_bv_email"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  IF NEW.ingresso_pago = true
     AND (OLD.ingresso_pago IS DISTINCT FROM true)
     AND (NEW.bv_enviado IS NOT true)
     AND NEW.email IS NOT NULL
  THEN
    PERFORM net.http_post(
      url     := 'https://idm-n8n.nzj83i.easypanel.host/webhook/npa-bv-email',
      body    := jsonb_build_object(
                   'type',       'UPDATE',
                   'table',      'npa_evento_leads',
                   'schema',     'public',
                   'record',     row_to_json(NEW)::jsonb,
                   'old_record', row_to_json(OLD)::jsonb
                 ),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_n8n_npa_bv_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."permissoes_efetivas"() RETURNS TABLE("user_id" "uuid", "recurso" "text", "acao" "text", "permitido" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select p.id,
         r.chave,
         a.acao,
         coalesce(
           (select o.permitido from public.user_permissao_override o
             where o.user_id = p.id and o.recurso = r.chave and o.acao = a.acao),
           exists (select 1 from public.role_permissoes rp
                    where rp.papel = ur.role and rp.recurso = r.chave and rp.acao = a.acao)
         )
  from public.profiles p
  left join public.user_roles ur on ur.user_id = p.id
  cross join public.app_recursos r
  cross join (values ('ver'),('editar'),('excluir'),('ver_todos')) a(acao)
  where public.is_admin();
$$;


ALTER FUNCTION "public"."permissoes_efetivas"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."permissoes_efetivas"() IS 'Matriz resolvida de toda a equipe. So admin recebe linhas — sem admin, retorna vazio.';



CREATE OR REPLACE FUNCTION "public"."portal_aluno_por_token"("p_token" "uuid") RETURNS TABLE("id" "uuid", "nome" "text", "email" "text", "whatsapp" "text", "status" "text", "produto" "text", "data_inicio" "date", "data_fim" "date", "dia_vencimento" integer, "contrato_assinado" boolean, "autentique_link_assinatura" "text", "link_grupo_whatsapp" "text", "turma_nome" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    a.id, a.nome, a.email, a.whatsapp, a.status, a.produto,
    a.data_inicio, a.data_fim, a.dia_vencimento,
    a.contrato_assinado, a.autentique_link_assinatura,
    tdc.link_grupo, t.nome
  from public.alunos a
  left join public.turmas t on t.id = a.turma_id
  left join public.turma_disparo_config tdc on tdc.turma_id = a.turma_id::text
  where a.contrato_token = p_token
  limit 1;
$$;


ALTER FUNCTION "public"."portal_aluno_por_token"("p_token" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."portal_aluno_por_token"("p_token" "uuid") IS 'Portal publico do aluno (/membros/:token). O token e a credencial; devolve so a linha dele.';



CREATE OR REPLACE FUNCTION "public"."portal_contrato_por_token"("p_token" "uuid") RETURNS TABLE("id" "uuid", "nome" "text", "whatsapp" "text", "email" "text", "produto" "text", "status" "text", "cpf" "text", "data_nascimento" "date", "endereco" "text", "cep" "text", "cidade_estado" "text", "forms_respondido" boolean, "contrato_enviado" boolean, "autentique_link_assinatura" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    a.id, a.nome, a.whatsapp, a.email, a.produto, a.status,
    a.cpf, a.data_nascimento, a.endereco, a.cep, a.cidade_estado,
    a.forms_respondido, a.contrato_enviado, a.autentique_link_assinatura
  from public.alunos a
  where a.contrato_token = p_token
  limit 1;
$$;


ALTER FUNCTION "public"."portal_contrato_por_token"("p_token" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."portal_contrato_por_token"("p_token" "uuid") IS 'Ficha do aluno para as paginas publicas de contrato (/assinar/:token, /formulario/:token).';



CREATE OR REPLACE FUNCTION "public"."portal_pagamentos_por_token"("p_token" "uuid") RETURNS TABLE("id" "uuid", "data_vencimento" "date", "valor" numeric, "status" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select p.id, p.data_vencimento, p.valor, p.status
  from public.pagamentos p
  join public.alunos a on a.id = p.aluno_id
  where a.contrato_token = p_token
  order by p.data_vencimento desc
  limit 6;
$$;


ALTER FUNCTION "public"."portal_pagamentos_por_token"("p_token" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."portal_pagamentos_por_token"("p_token" "uuid") IS 'Ultimas 6 parcelas do aluno dono do token. Usada pelo portal publico /membros/:token.';



CREATE OR REPLACE FUNCTION "public"."registrar_historico_fase_lead"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.origem <> 'Time Comercial' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.leads_historico_fase (lead_id, fase_anterior, fase_nova, vendedor, origem_mudanca)
    VALUES (NEW.id, NULL, NEW.status, NEW.vendedor, 'criacao');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.leads_historico_fase (lead_id, fase_anterior, fase_nova, vendedor, origem_mudanca)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.vendedor, 'atualizacao');
  END IF;

  -- Pegar/devolver lead não muda a fase, então o ramo acima não registra —
  -- precisa de um evento próprio pra aparecer na trajetória do lead.
  IF TG_OP = 'UPDATE' AND NEW.vendedor IS DISTINCT FROM OLD.vendedor THEN
    IF NEW.vendedor IS NOT NULL THEN
      INSERT INTO public.leads_historico_fase (lead_id, fase_anterior, fase_nova, vendedor, origem_mudanca)
      VALUES (NEW.id, NEW.status, NEW.status, NEW.vendedor, 'atribuicao');
    ELSE
      INSERT INTO public.leads_historico_fase (lead_id, fase_anterior, fase_nova, vendedor, origem_mudanca)
      VALUES (NEW.id, NEW.status, NEW.status, OLD.vendedor, 'devolucao');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."registrar_historico_fase_lead"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registrar_insert_anonimo"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if current_user = 'anon' then
    begin
      insert into public.anon_insert_watch (tabela) values (tg_table_name);
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."registrar_insert_anonimo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolver_pessoa"("p_nome" "text", "p_telefone" "text", "p_email" "text" DEFAULT NULL::"text", "p_cpf" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_tel    text := public.normalizar_telefone(p_telefone);
  v_email  text := lower(nullif(trim(p_email), ''));
  v_cpf    text := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  v_pessoa uuid;
begin
  if v_tel is null and v_email is null and v_cpf is null then
    return null;
  end if;

  -- Ordem de confianca: CPF > telefone > email. E-mail e o mais fraco porque familia
  -- compartilha e-mail com frequencia nesse tipo de negocio.
  if v_cpf is not null then
    select pessoa_id into v_pessoa from public.pessoa_identificadores
     where tipo = 'cpf' and valor = v_cpf;
  end if;
  if v_pessoa is null and v_tel is not null then
    select pessoa_id into v_pessoa from public.pessoa_identificadores
     where tipo = 'telefone' and valor = v_tel;
  end if;
  if v_pessoa is null and v_email is not null then
    select pessoa_id into v_pessoa from public.pessoa_identificadores
     where tipo = 'email' and valor = v_email;
  end if;

  if v_pessoa is null then
    insert into public.pessoas (nome, telefone, email, cpf)
    values (nullif(trim(p_nome), ''), v_tel, v_email, v_cpf)
    returning id into v_pessoa;
  else
    update public.pessoas
       set nome     = coalesce(nome, nullif(trim(p_nome), '')),
           telefone = coalesce(telefone, v_tel),
           email    = coalesce(email, v_email),
           cpf      = coalesce(cpf, v_cpf),
           atualizado_em = now()
     where id = v_pessoa;
  end if;

  if v_tel is not null then
    insert into public.pessoa_identificadores (pessoa_id, tipo, valor)
    values (v_pessoa, 'telefone', v_tel) on conflict (tipo, valor) do nothing;
  end if;
  if v_email is not null then
    insert into public.pessoa_identificadores (pessoa_id, tipo, valor)
    values (v_pessoa, 'email', v_email) on conflict (tipo, valor) do nothing;
  end if;
  if v_cpf is not null then
    insert into public.pessoa_identificadores (pessoa_id, tipo, valor)
    values (v_pessoa, 'cpf', v_cpf) on conflict (tipo, valor) do nothing;
  end if;

  return v_pessoa;
end;
$$;


ALTER FUNCTION "public"."resolver_pessoa"("p_nome" "text", "p_telefone" "text", "p_email" "text", "p_cpf" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."resolver_pessoa"("p_nome" "text", "p_telefone" "text", "p_email" "text", "p_cpf" "text") IS 'Acha ou cria a pessoa dessas chaves. Idempotente: pode ser chamada em trigger e em backfill sem duplicar.';



CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_valor_potencial"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  IF NEW.produto = 'npa' THEN
    NEW.valor_potencial = 397;
  ELSIF NEW.origem = 'Direto' THEN
    NEW.valor_potencial = NULL;
  ELSE
    NEW.valor_potencial = 109.90;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_valor_potencial"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sincronizar_inadimplencia"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  -- Marca pagamentos vencidos
  UPDATE pagamentos SET status = 'atrasado'
  WHERE status = 'pendente' AND data_vencimento < CURRENT_DATE;

  -- Marca alunos inadimplentes
  UPDATE alunos SET status = 'inadimplente'
  WHERE status = 'ativo' AND id IN (
    SELECT DISTINCT aluno_id FROM pagamentos WHERE status = 'atrasado'
  );

  -- Volta alunos que quitaram tudo para ativo
  UPDATE alunos SET status = 'ativo'
  WHERE status = 'inadimplente' AND id NOT IN (
    SELECT DISTINCT aluno_id FROM pagamentos WHERE status = 'atrasado'
  );
END;
$$;


ALTER FUNCTION "public"."sincronizar_inadimplencia"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_fase_lancamento_leads"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
declare
  v_nome_coluna text;
  v_coluna_id uuid;
begin
  v_nome_coluna :=
    case
      when new.matriculado = true then 'Matrícula'
      when new.follow_up_03 = true then 'Follow Up 03'
      when new.follow_up_02 = true then 'Follow Up 02'
      when new.follow_up_01 = true then 'Follow Up 01'
      when new.grupo_oferta = true then 'Grupo Oferta'
      when new.no_grupo = true then 'Grupo Lançamento'
      else 'Planilha'
    end;

  select kc.id
    into v_coluna_id
  from public.kanban_colunas kc
  where kc.lancamento_id = new.lancamento_id
    and lower(
      translate(kc.nome,
        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
      )
    ) = lower(
      translate(v_nome_coluna,
        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
      )
    )
  order by kc.ordem
  limit 1;

  if v_coluna_id is not null then
    new.fase := v_coluna_id::text;
  end if;

  new.ultima_atividade := now();
  new.updated_at := now();

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_fase_lancamento_leads"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_fase_npa_lead"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  IF NEW.matriculado = true THEN
    NEW.fase = 'matricula';
  ELSIF NEW.follow_up_03 = true THEN
    NEW.fase = 'follow_up_03';
  ELSIF NEW.follow_up_02 = true THEN
    NEW.fase = 'follow_up_02';
  ELSIF NEW.follow_up_01 = true THEN
    NEW.fase = 'follow_up_01';
  ELSIF NEW.closer = true THEN
    NEW.fase = 'closer';
  ELSIF NEW.esteve_no_evento = true THEN
    NEW.fase = 'evento';
  ELSIF NEW.presente_evento = true THEN
    NEW.fase = 'confirmado';
  ELSIF NEW.no_grupo = true THEN
    NEW.fase = 'no_grupo';
  ELSIF NEW.ingresso_pago = true THEN
    NEW.fase = 'ingresso_pago';
  ELSE
    NEW.fase = 'novo';
  END IF;

  NEW.ultima_atividade = now();
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_fase_npa_lead"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_lancamento_lead_to_time_comercial"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_lancamento_nome text;
  v_phone text;
  v_s8 text;
  v_existing_id uuid;
BEGIN
  SELECT nome INTO v_lancamento_nome FROM public.lancamentos WHERE id = NEW.lancamento_id;
  IF v_lancamento_nome IS NULL OR v_lancamento_nome !~* '^turma\s*#\s*\d+$' THEN
    RETURN NEW;
  END IF;

  v_phone := regexp_replace(coalesce(NEW.whatsapp, ''), '\D', '', 'g');
  IF length(v_phone) < 8 THEN
    RETURN NEW;
  END IF;
  v_s8 := right(v_phone, 8);

  SELECT id INTO v_existing_id
  FROM public.leads
  WHERE origem = 'Time Comercial' AND canal = 'SDD' AND telefone ILIKE '%' || v_s8
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    INSERT INTO public.leads (nome, telefone, whatsapp, origem, canal, status, produto, interesse_produto, lancamento_id, cidade, criado_em)
    VALUES (NEW.nome, NEW.whatsapp, NEW.whatsapp, 'Time Comercial', 'SDD', 'frio', 'time_comercial', 'Psicanálise', NEW.lancamento_id, NEW.cidade, now());
  ELSE
    UPDATE public.leads
    SET lancamento_id = COALESCE(lancamento_id, NEW.lancamento_id),
        cidade = COALESCE(cidade, NEW.cidade)
    WHERE id = v_existing_id;
  END IF;

  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."sync_lancamento_lead_to_time_comercial"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_lancamento_lead_to_time_comercial"() IS 'Espelha novos leads de lançamentos "Turma #NN" (Semana do Despertar) pro funil Time Comercial, entrando como status=frio. Ver TimeComercial.tsx (SDD_STAGES) e webhook-grupo (espelha avanço pra grupo_oferta).';



CREATE OR REPLACE FUNCTION "public"."sync_mensalidades_pagas"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.alunos
  SET mensalidades_pagas = (
    SELECT COUNT(*) FROM public.pagamentos
    WHERE aluno_id = COALESCE(NEW.aluno_id, OLD.aluno_id)
      AND status = 'pago'
  )
  WHERE id = COALESCE(NEW.aluno_id, OLD.aluno_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_mensalidades_pagas"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_mind_map_node_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  NEW.title     := COALESCE(NEW.titulo, NEW.title);
  NEW.titulo    := COALESCE(NEW.titulo, NEW.title);
  NEW.type      := COALESCE(NEW.tipo, NEW.type);
  NEW.tipo      := COALESCE(NEW.tipo, NEW.type);
  NEW.position_x := COALESCE(NEW.posicao_x, NEW.position_x, 100);
  NEW.posicao_x  := COALESCE(NEW.posicao_x, NEW.position_x, 100);
  NEW.position_y := COALESCE(NEW.posicao_y, NEW.position_y, 100);
  NEW.posicao_y  := COALESCE(NEW.posicao_y, NEW.position_y, 100);
  NEW.color     := COALESCE(NEW.cor, NEW.color, '#AC1131');
  NEW.cor       := COALESCE(NEW.cor, NEW.color, '#AC1131');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_mind_map_node_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_planilha38_to_email_campanha"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
DECLARE
  v_campanha_id uuid := '1160f1fa-3101-425c-a0bf-6ee1df1e3f5c';
  v_fase_planilha text := 'planilha';
  v_lancamento_id uuid := 'e4ab53c7-63f9-44c8-a0c1-7d8a68f7d05f';
BEGIN
  IF NEW.lancamento_id = v_lancamento_id
     AND NEW.fase = v_fase_planilha
     AND NEW.email IS NOT NULL
     AND NEW.email != '' THEN

    INSERT INTO disparo_leads (campanha_id, nome, email, phone, status, temperatura)
    SELECT v_campanha_id, NEW.nome, NEW.email, NEW.whatsapp, 'pendente', 'frio'
    WHERE NOT EXISTS (
      SELECT 1 FROM disparo_leads
      WHERE campanha_id = v_campanha_id AND email = NEW.email
    );

    UPDATE disparo_campanhas
    SET leads_total = (
      SELECT COUNT(*) FROM disparo_leads WHERE campanha_id = v_campanha_id
    )
    WHERE id = v_campanha_id;

  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_planilha38_to_email_campanha"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_title"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  NEW.title := COALESCE(NEW.titulo, NEW.title);
  NEW.titulo := COALESCE(NEW.titulo, NEW.title);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_title"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tem_permissao"("p_recurso" "text", "p_acao" "text" DEFAULT 'ver'::"text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(
    (select o.permitido
       from public.user_permissao_override o
      where o.user_id = auth.uid() and o.recurso = p_recurso and o.acao = p_acao),
    (select true
       from public.role_permissoes rp
       join public.user_roles ur on ur.role = rp.papel
      where ur.user_id = auth.uid() and rp.recurso = p_recurso and rp.acao = p_acao
      limit 1),
    false
  );
$$;


ALTER FUNCTION "public"."tem_permissao"("p_recurso" "text", "p_acao" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."tem_permissao"("p_recurso" "text", "p_acao" "text") IS 'Override da pessoa vence o padrao do papel; sem nenhum dos dois, nega. Usar nas policies de RLS.';



CREATE OR REPLACE FUNCTION "public"."time_comercial_alunos_vendedor"() RETURNS TABLE("vendedor" "text", "vista_cartao" bigint, "boleto" bigint, "bolsa_cortesia" bigint, "sem_forma" bigint, "total" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    vendedor_id AS vendedor,
    count(*) FILTER (WHERE tipo_pagamento = 'mensalidade' AND forma_pagamento IN ('avista', 'cartao')) AS vista_cartao,
    count(*) FILTER (WHERE tipo_pagamento = 'mensalidade' AND forma_pagamento = 'boleto') AS boleto,
    count(*) FILTER (WHERE tipo_pagamento IN ('bolsa', 'cortesia')) AS bolsa_cortesia,
    count(*) FILTER (WHERE forma_pagamento IS NULL AND tipo_pagamento = 'mensalidade') AS sem_forma,
    count(*) AS total
  FROM public.alunos
  WHERE vendedor_id IS NOT NULL
  GROUP BY vendedor_id;
$$;


ALTER FUNCTION "public"."time_comercial_alunos_vendedor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."time_comercial_atividade_vendedor"("p_dias" integer DEFAULT 30) RETURNS TABLE("vendedor" "text", "lead_id" "uuid", "lead_nome" "text", "fase_anterior" "text", "fase_nova" "text", "origem_mudanca" "text", "atendeu" boolean, "resumo" "text", "criado_em" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT h.vendedor, h.lead_id, l.nome, h.fase_anterior, h.fase_nova, h.origem_mudanca, h.atendeu, h.resumo, h.criado_em
  FROM public.leads_historico_fase h
  JOIN public.leads l ON l.id = h.lead_id
  WHERE h.vendedor IS NOT NULL
    AND h.criado_em >= now() - (p_dias || ' days')::interval
  ORDER BY h.criado_em DESC;
$$;


ALTER FUNCTION "public"."time_comercial_atividade_vendedor"("p_dias" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."time_comercial_ciclo_vendas"() RETURNS TABLE("dias_medio" numeric, "vendas_consideradas" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH criacao AS (
    SELECT lead_id, min(criado_em) AS inicio FROM public.leads_historico_fase WHERE origem_mudanca = 'criacao' GROUP BY lead_id
  ), matricula AS (
    SELECT lead_id, min(criado_em) AS fim FROM public.leads_historico_fase WHERE fase_nova = 'matricula' AND origem_mudanca = 'atualizacao' GROUP BY lead_id
  )
  SELECT round(avg(EXTRACT(EPOCH FROM (m.fim - c.inicio)) / 86400)::numeric, 1), count(*)
  FROM matricula m JOIN criacao c ON c.lead_id = m.lead_id;
$$;


ALTER FUNCTION "public"."time_comercial_ciclo_vendas"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."time_comercial_contagens"() RETURNS TABLE("canal" "text", "status" "text", "campanha_id" "uuid", "vendedor" "text", "total" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT canal, status, campanha_id, vendedor, count(*)
  FROM public.leads
  WHERE origem = 'Time Comercial'
  GROUP BY canal, status, campanha_id, vendedor;
$$;


ALTER FUNCTION "public"."time_comercial_contagens"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."time_comercial_leads_por_mes"() RETURNS TABLE("mes" "date", "total" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT date_trunc('month', l.criado_em)::date AS mes, count(*) AS total
  FROM public.leads l
  WHERE l.origem = 'Time Comercial'
    AND NOT EXISTS (
      SELECT 1 FROM public.time_comercial_campanhas c
      WHERE c.id = l.campanha_id AND c.tipo = 'retorno'
    )
  GROUP BY mes;
$$;


ALTER FUNCTION "public"."time_comercial_leads_por_mes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."time_comercial_metricas_turma"() RETURNS TABLE("lancamento_id" "uuid", "turma_nome" "text", "leads_total" bigint, "chegou_grupo_oferta" bigint, "matriculados" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    l.lancamento_id,
    lc.nome,
    count(*) AS leads_total,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.leads_historico_fase h WHERE h.lead_id = l.id AND h.fase_nova = 'grupo_oferta'
    )) AS chegou_grupo_oferta,
    count(*) FILTER (WHERE l.status = 'matricula') AS matriculados
  FROM public.leads l
  LEFT JOIN public.lancamentos lc ON lc.id = l.lancamento_id
  WHERE l.origem = 'Time Comercial' AND l.canal = 'SDD' AND l.lancamento_id IS NOT NULL
  GROUP BY l.lancamento_id, lc.nome
  ORDER BY lc.nome DESC;
$$;


ALTER FUNCTION "public"."time_comercial_metricas_turma"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."time_comercial_movimentacao_dia"("dias" integer DEFAULT 7) RETURNS TABLE("vendedor" "text", "dia" "date", "tipo" "text", "eventos" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    vendedor,
    (criado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
    CASE
      WHEN origem_mudanca IN ('contato_whatsapp', 'contato_ligacao') THEN origem_mudanca
      ELSE 'movimentacao'
    END AS tipo,
    count(*) AS eventos
  FROM public.leads_historico_fase
  WHERE vendedor IS NOT NULL
    AND criado_em >= now() - (dias || ' days')::interval
  GROUP BY vendedor, dia, tipo;
$$;


ALTER FUNCTION "public"."time_comercial_movimentacao_dia"("dias" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."time_comercial_registrar_contato"("p_lead_id" "uuid", "p_vendedor" "text", "p_tipo" "text", "p_criado_em" timestamp with time zone DEFAULT "now"(), "p_atendeu" boolean DEFAULT NULL::boolean, "p_resumo" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_status text;
  v_origem text;
BEGIN
  IF p_tipo NOT IN ('contato_whatsapp', 'contato_ligacao') THEN
    RAISE EXCEPTION 'tipo inválido: %', p_tipo;
  END IF;

  SELECT status, origem INTO v_status, v_origem FROM public.leads WHERE id = p_lead_id;
  IF v_origem IS DISTINCT FROM 'Time Comercial' THEN
    RAISE EXCEPTION 'lead não é do Time Comercial';
  END IF;

  INSERT INTO public.leads_historico_fase (lead_id, fase_anterior, fase_nova, vendedor, origem_mudanca, criado_em, atendeu, resumo)
  VALUES (p_lead_id, v_status, v_status, p_vendedor, p_tipo, p_criado_em, p_atendeu, NULLIF(trim(p_resumo), ''));
END;
$$;


ALTER FUNCTION "public"."time_comercial_registrar_contato"("p_lead_id" "uuid", "p_vendedor" "text", "p_tipo" "text", "p_criado_em" timestamp with time zone, "p_atendeu" boolean, "p_resumo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."time_comercial_sem_vendedor_antigo"("dias" integer DEFAULT 2) RETURNS TABLE("canal" "text", "total" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT canal, count(*)
  FROM public.leads
  WHERE origem = 'Time Comercial'
    AND vendedor IS NULL
    AND criado_em < now() - (dias || ' days')::interval
  GROUP BY canal;
$$;


ALTER FUNCTION "public"."time_comercial_sem_vendedor_antigo"("dias" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."time_comercial_vendas_por_dia_semana"() RETURNS TABLE("dia_semana" integer, "vendas" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    EXTRACT(DOW FROM data_matricula)::integer AS dia_semana,
    count(*) AS vendas
  FROM public.alunos
  WHERE vendedor_id IS NOT NULL AND data_matricula IS NOT NULL
  GROUP BY dia_semana;
$$;


ALTER FUNCTION "public"."time_comercial_vendas_por_dia_semana"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."time_comercial_vendas_por_epoca_mes"() RETURNS TABLE("dia_do_mes" integer, "vendas" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    EXTRACT(DAY FROM data_matricula)::integer AS dia_do_mes,
    count(*) AS vendas
  FROM public.alunos
  WHERE vendedor_id IS NOT NULL AND data_matricula IS NOT NULL
  GROUP BY dia_do_mes;
$$;


ALTER FUNCTION "public"."time_comercial_vendas_por_epoca_mes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."time_comercial_vendas_por_mes"() RETURNS TABLE("mes" "date", "vendedor" "text", "vista_cartao" bigint, "boleto" bigint, "total" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    date_trunc('month', data_matricula)::date AS mes,
    vendedor_id AS vendedor,
    count(*) FILTER (WHERE tipo_pagamento = 'mensalidade' AND forma_pagamento IN ('avista', 'cartao')) AS vista_cartao,
    count(*) FILTER (WHERE tipo_pagamento = 'mensalidade' AND forma_pagamento = 'boleto') AS boleto,
    count(*) AS total
  FROM public.alunos
  WHERE vendedor_id IS NOT NULL AND data_matricula IS NOT NULL
  GROUP BY mes, vendedor_id;
$$;


ALTER FUNCTION "public"."time_comercial_vendas_por_mes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_pessoa_registrar_vinculo"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.pessoa_id is null then
    return new;
  end if;

  insert into public.pessoa_vinculos (pessoa_id, papel, origem_tabela, origem_id)
  values (new.pessoa_id, tg_argv[0], tg_table_name, new.id::text)
  on conflict (origem_tabela, origem_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."trg_pessoa_registrar_vinculo"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trg_pessoa_registrar_vinculo"() IS 'AFTER INSERT: registra o vinculo (precisa do id, que so existe depois de gravar). Argumento 1 = papel.';



CREATE OR REPLACE FUNCTION "public"."trg_pessoa_vincular"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_linha jsonb := to_jsonb(new);
  v_pessoa uuid;
begin
  if new.pessoa_id is not null then
    return new;
  end if;

  v_pessoa := public.resolver_pessoa(
    v_linha ->> 'nome',
    v_linha ->> tg_argv[0],     -- coluna do telefone varia por tabela (whatsapp, phone, ...)
    v_linha ->> 'email',
    v_linha ->> 'cpf'           -- NULL nas tabelas que nao tem a coluna
  );

  new.pessoa_id := v_pessoa;
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_pessoa_vincular"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trg_pessoa_vincular"() IS 'BEFORE INSERT: preenche pessoa_id. Argumento 1 = nome da coluna de telefone da tabela.';



CREATE OR REPLACE FUNCTION "public"."trigger_lancamento_lead_bv"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
declare
  v_lancamento_nome text;
  v_cfg record;
  v_mensagem text;
  v_delay_min integer;
begin
  -- Caminho existente (n8n) -- inalterado
  IF NEW.email IS NOT NULL AND NEW.email != '' THEN
    PERFORM net.http_post(
      url      := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/lancamento-lead-webhook',
      headers  := '{"Content-Type":"application/json"}'::jsonb,
      body     := json_build_object('lead_id', NEW.id)::jsonb
    );
  END IF;

  -- Caminho nativo (Supabase) -- opt-in por funil via boas_vindas_config.auto_agendar.
  begin
    if NEW.whatsapp is not null and NEW.whatsapp != '' and NEW.lancamento_id is not null then
      select nome into v_lancamento_nome from public.lancamentos where id = NEW.lancamento_id;

      if v_lancamento_nome is not null then
        select * into v_cfg from public.boas_vindas_config
          where funnel_name = v_lancamento_nome
            and ativo = true and wpp_ativo = true and auto_agendar = true;

        if found then
          v_delay_min := coalesce(v_cfg.delay_minutos, 3);
          v_mensagem := case when v_cfg.wpp_message_type = 'audio' then ''
            else coalesce(replace(replace(v_cfg.wpp_mensagem, '{{nome}}', coalesce(NEW.nome, 'você')), '{{lancamento}}', v_lancamento_nome), '')
          end;

          insert into public.boas_vindas_agendados (
            lancamento_id, lead_id, lead_tabela, funnel_name, nome, whatsapp, mensagem, agendado_para
          ) values (
            NEW.lancamento_id, NEW.id, 'lancamento_leads', v_lancamento_nome, NEW.nome, NEW.whatsapp, v_mensagem,
            now() + (v_delay_min || ' minutes')::interval
          );

          update public.lancamento_leads set bv_enviado = true, bv_enviado_em = now() where id = NEW.id;
        end if;
      end if;
    end if;
  exception when others then
    raise warning 'trigger_lancamento_lead_bv (native queue) failed for lead %: %', NEW.id, sqlerrm;
  end;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_lancamento_lead_bv"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_notification_push"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/push-enviar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key',   'push-enviar-internal-2026'
    ),
    body    := jsonb_build_object(
      'user_id', NEW.user_id,
      'titulo',  NEW.titulo,
      'descricao', NEW.descricao,
      'link',    NEW.link
    ),
    timeout_milliseconds := 15000
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_notification_push"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_npa_bv_auto"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  IF NEW.ingresso_pago = true
     AND (OLD.ingresso_pago IS DISTINCT FROM true)
     AND (NEW.bv_enviado IS NOT true)
     AND NEW.whatsapp IS NOT NULL
  THEN
    PERFORM net.http_post(
      url     := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/npa-bv-trigger',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := json_build_object('lead_id', NEW.id)::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_npa_bv_auto"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_npa_pix_auto"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  IF NEW.pix_codigo IS NOT NULL
     AND (OLD.pix_codigo IS DISTINCT FROM NEW.pix_codigo)
     AND (NEW.pix_enviado IS NOT true)
     AND NEW.whatsapp IS NOT NULL
  THEN
    PERFORM net.http_post(
      url     := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/npa-pix-trigger',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := json_build_object('lead_id', NEW.id)::text
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_npa_pix_auto"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."turmas_financeiro_permitidas"() RETURNS "text"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(
    (select ap.allowed_financeiro_turma_ids
       from public.user_access_permissions ap
      where ap.user_id = auth.uid()),
    '{}'::text[]);
$$;


ALTER FUNCTION "public"."turmas_financeiro_permitidas"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."turmas_financeiro_permitidas"() IS 'Turmas que o usuario logado pode ver no financeiro. So vale para quem NAO tem `financeiro/ver_todos`.';



CREATE OR REPLACE FUNCTION "public"."update_kanban_colunas_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_kanban_colunas_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ultima_atividade"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.leads SET ultima_atividade = now() WHERE id = NEW.id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ultima_atividade"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verificar_inadimplencia"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
DECLARE
  tem_atrasado BOOLEAN;
BEGIN
  -- Verificar se ainda existe algum pagamento atrasado para esse aluno
  SELECT EXISTS (
    SELECT 1 FROM public.pagamentos
    WHERE aluno_id = COALESCE(NEW.aluno_id, OLD.aluno_id)
      AND status = 'atrasado'
  ) INTO tem_atrasado;

  IF tem_atrasado THEN
    UPDATE public.alunos
    SET status = 'inadimplente'
    WHERE id = COALESCE(NEW.aluno_id, OLD.aluno_id)
      AND status NOT IN ('cancelado', 'concluido');
  ELSE
    -- Sem atrasados: voltar para ativo se estava inadimplente
    UPDATE public.alunos
    SET status = 'ativo'
    WHERE id = COALESCE(NEW.aluno_id, OLD.aluno_id)
      AND status = 'inadimplente';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."verificar_inadimplencia"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verificar_tarefa_concluida"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
DECLARE
  total_etapas INTEGER;
  etapas_concluidas INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_etapas
  FROM public.tarefas_etapas WHERE tarefa_id = NEW.tarefa_id;

  SELECT COUNT(*) INTO etapas_concluidas
  FROM public.tarefas_etapas 
  WHERE tarefa_id = NEW.tarefa_id AND status = 'concluido';

  IF total_etapas > 0 AND total_etapas = etapas_concluidas THEN
    UPDATE public.tarefas SET status = 'concluido' WHERE id = NEW.tarefa_id;
  ELSIF etapas_concluidas > 0 THEN
    UPDATE public.tarefas SET status = 'em_andamento' WHERE id = NEW.tarefa_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."verificar_tarefa_concluida"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."aluno_bonus_eventos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "aluno_id" "uuid" NOT NULL,
    "bonus_id" "uuid" NOT NULL,
    "acao" "text" NOT NULL,
    "criado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bonus_turma_id" "uuid",
    CONSTRAINT "aluno_bonus_eventos_acao_check" CHECK (("acao" = ANY (ARRAY['adicionado'::"text", 'removido'::"text"])))
);


ALTER TABLE "public"."aluno_bonus_eventos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aluno_observacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "aluno_id" "uuid" NOT NULL,
    "texto" "text" NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "criado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolvido_por" "uuid",
    "resolvido_em" timestamp with time zone,
    CONSTRAINT "aluno_observacoes_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'resolvido'::"text"])))
);


ALTER TABLE "public"."aluno_observacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alunos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "whatsapp" "text",
    "email" "text",
    "turma_id" "uuid",
    "dia_vencimento" integer,
    "valor_mensalidade" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'ativo'::"text",
    "produto" "text" DEFAULT 'psicanalise'::"text",
    "origem_lead" "text" DEFAULT 'direto'::"text",
    "data_inicio" "date",
    "data_fim" "date",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "mensalidades_pagas" integer DEFAULT 0,
    "total_mensalidades" integer DEFAULT 15,
    "forms_respondido" boolean DEFAULT false,
    "forms_respondido_em" timestamp with time zone,
    "contrato_enviado" boolean DEFAULT false,
    "contrato_enviado_em" timestamp with time zone,
    "contrato_assinado" boolean DEFAULT false,
    "contrato_assinado_em" timestamp with time zone,
    "autentique_documento_id" "text",
    "autentique_link_assinatura" "text",
    "cpf" "text",
    "data_nascimento" "date",
    "endereco" "text",
    "cep" "text",
    "cidade_estado" "text",
    "pais" "text" DEFAULT 'Brasil'::"text",
    "dia_vencimento_contrato" "text",
    "forma_pagamento" "text",
    "observacoes" "text",
    "data_matricula" "date",
    "contrato_arquivo_url" "text",
    "contrato_arquivo_nome" "text",
    "contrato_baixado" boolean DEFAULT false,
    "asaas_integrado" boolean DEFAULT false,
    "asaas_link" "text",
    "voomp_integrado" boolean DEFAULT false,
    "voomp_link" "text",
    "cobranca_ativa" boolean DEFAULT true NOT NULL,
    "cobranca_telefone" "text",
    "ultimo_contato_em" timestamp with time zone,
    "contrato_token" "uuid" DEFAULT "gen_random_uuid"(),
    "contrato_link_enviado_em" timestamp with time zone,
    "lancamento_id" "uuid",
    "tipo_pagamento" "text" DEFAULT 'mensalidade'::"text" NOT NULL,
    "rg" "text",
    "sexo" "text",
    "lead_quente_contatado_em" timestamp with time zone,
    "grupo_turma_confirmado_em" timestamp with time zone,
    "grupo_turma_confirmado_por" "uuid",
    "cobranca_ia_ativa" boolean DEFAULT true NOT NULL,
    "vendedor" "text",
    "vendedor_id" "text",
    "grupo_turma_id" "uuid",
    "pessoa_id" "uuid",
    CONSTRAINT "alunos_origem_lead_check" CHECK (("origem_lead" = ANY (ARRAY['direto'::"text", 'lancamento'::"text", 'npa'::"text", 'aula_secreta'::"text"]))),
    CONSTRAINT "alunos_produto_check" CHECK (("produto" = ANY (ARRAY['psicanalise'::"text", 'numerologia'::"text"]))),
    CONSTRAINT "alunos_tipo_pagamento_check" CHECK (("tipo_pagamento" = ANY (ARRAY['mensalidade'::"text", 'bolsa'::"text", 'cortesia'::"text"])))
);

ALTER TABLE ONLY "public"."alunos" REPLICA IDENTITY FULL;


ALTER TABLE "public"."alunos" OWNER TO "postgres";


COMMENT ON TABLE "public"."alunos" IS 'Recurso `alunos`. Quem nao tem `alunos/ver_todos` so alcanca as turmas de allowed_financeiro_turma_ids. A policy de INSERT anonimo (matricula publica) e preservada de proposito.';



COMMENT ON COLUMN "public"."alunos"."vendedor_id" IS 'Nome do vendedor do Time Comercial que fechou essa matricula (texto livre por enquanto). Preenchido manualmente na aba Operacao do CRM Time Comercial.';



CREATE OR REPLACE VIEW "public"."alunos_financeiro" WITH ("security_invoker"='true') AS
 SELECT "produto",
    "count"(*) FILTER (WHERE ("status" = 'ativo'::"text")) AS "alunos_ativos",
    "count"(*) FILTER (WHERE ("status" = 'inadimplente'::"text")) AS "alunos_inadimplentes",
    (("count"(*) FILTER (WHERE ("status" = 'ativo'::"text")))::numeric * 109.90) AS "receita_mensal_atual",
    (("count"(*) FILTER (WHERE ("status" = 'ativo'::"text")))::numeric * 1538.60) AS "ltv_potencial"
   FROM "public"."alunos" "a"
  GROUP BY "produto";


ALTER VIEW "public"."alunos_financeiro" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."anon_insert_watch" (
    "id" bigint NOT NULL,
    "tabela" "text" NOT NULL,
    "ocorrido_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."anon_insert_watch" OWNER TO "postgres";


COMMENT ON TABLE "public"."anon_insert_watch" IS 'Temporaria (sprint 1.1h): registra INSERT feito com a chave anonima, pra descobrir quais fluxos publicos existem de verdade antes de fechar o resto. Remover quando a decisao for tomada.';



CREATE SEQUENCE IF NOT EXISTS "public"."anon_insert_watch_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."anon_insert_watch_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."anon_insert_watch_id_seq" OWNED BY "public"."anon_insert_watch"."id";



CREATE TABLE IF NOT EXISTS "public"."app_recursos" (
    "chave" "text" NOT NULL,
    "modulo" "text" NOT NULL,
    "rotulo" "text" NOT NULL,
    "ordem" integer DEFAULT 100 NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_recursos" OWNER TO "postgres";


COMMENT ON TABLE "public"."app_recursos" IS 'Catalogo de telas/recursos protegidos. Tela nova = uma linha aqui, nao uma coluna nova.';



CREATE TABLE IF NOT EXISTS "public"."aquecimento_chips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "evolution_config_id" "text" NOT NULL,
    "numero_whatsapp" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "data_inicio" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT 'aquecendo'::"text" NOT NULL,
    "enviados_hoje" integer DEFAULT 0 NOT NULL,
    "dia_contagem" "date" DEFAULT CURRENT_DATE NOT NULL,
    "consecutive_errors" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "aquecimento_chips_status_check" CHECK (("status" = ANY (ARRAY['aquecendo'::"text", 'pausado'::"text", 'pronto'::"text"])))
);


ALTER TABLE "public"."aquecimento_chips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aquecimento_config" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "ativo" boolean DEFAULT false NOT NULL,
    "rampa" "jsonb" DEFAULT '[{"max": 5, "min": 3, "dia_fim": 3, "dia_inicio": 1}, {"max": 10, "min": 6, "dia_fim": 7, "dia_inicio": 4}, {"max": 20, "min": 12, "dia_fim": 14, "dia_inicio": 8}, {"max": 30, "min": 20, "dia_fim": 21, "dia_inicio": 15}, {"max": 45, "min": 30, "dia_fim": null, "dia_inicio": 22}]'::"jsonb" NOT NULL,
    "pct_dm" integer DEFAULT 50 NOT NULL,
    "delay_min_s" integer DEFAULT 5 NOT NULL,
    "delay_max_s" integer DEFAULT 15 NOT NULL,
    "safe_hour_start" integer DEFAULT 8 NOT NULL,
    "safe_hour_end" integer DEFAULT 21 NOT NULL,
    "max_errors_seq" integer DEFAULT 5 NOT NULL,
    "saude_taxa_entrega_min" numeric DEFAULT 0.85 NOT NULL,
    "saude_max_desconexoes_7d" integer DEFAULT 2 NOT NULL,
    "saude_dias_min_pronto" integer DEFAULT 22 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "msgs_por_sessao_min" integer DEFAULT 3 NOT NULL,
    "msgs_por_sessao_max" integer DEFAULT 8 NOT NULL,
    "ultimo_plano_data" "date"
);


ALTER TABLE "public"."aquecimento_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aquecimento_grupos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "grupo_jid" "text" NOT NULL,
    "evolution_config_id" "text",
    "membros" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."aquecimento_grupos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aquecimento_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tipo" "text" NOT NULL,
    "chip_origem_id" "uuid" NOT NULL,
    "chip_destino_id" "uuid",
    "grupo_id" "uuid",
    "mensagem_texto" "text" NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "error_msg" "text",
    "done_at" timestamp with time zone,
    "evolution_message_id" "text",
    "ack_status" "text" DEFAULT 'enviado'::"text" NOT NULL,
    "entregue_em" timestamp with time zone,
    "lido_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sessao_id" "uuid",
    CONSTRAINT "aquecimento_jobs_ack_status_check" CHECK (("ack_status" = ANY (ARRAY['enviado'::"text", 'entregue'::"text", 'lido'::"text", 'falhou'::"text"]))),
    CONSTRAINT "aquecimento_jobs_destino_check" CHECK (((("tipo" = 'dm'::"text") AND ("chip_destino_id" IS NOT NULL) AND ("grupo_id" IS NULL)) OR (("tipo" = 'grupo'::"text") AND ("grupo_id" IS NOT NULL) AND ("chip_destino_id" IS NULL)))),
    CONSTRAINT "aquecimento_jobs_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'enviando'::"text", 'enviado'::"text", 'erro'::"text"]))),
    CONSTRAINT "aquecimento_jobs_tipo_check" CHECK (("tipo" = ANY (ARRAY['dm'::"text", 'grupo'::"text"])))
);


ALTER TABLE "public"."aquecimento_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aquecimento_mensagens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "texto" "text" NOT NULL,
    "tipo" "text" DEFAULT 'ambos'::"text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "aquecimento_mensagens_tipo_check" CHECK (("tipo" = ANY (ARRAY['dm'::"text", 'grupo'::"text", 'ambos'::"text"])))
);


ALTER TABLE "public"."aquecimento_mensagens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aquecimento_roteiro_mensagens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "roteiro_id" "uuid" NOT NULL,
    "ordem" integer NOT NULL,
    "texto" "text" NOT NULL
);


ALTER TABLE "public"."aquecimento_roteiro_mensagens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aquecimento_roteiros_dm" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."aquecimento_roteiros_dm" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."evolution_conexao_eventos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "evolution_config_id" "text",
    "instance_name" "text" NOT NULL,
    "state" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."evolution_conexao_eventos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."evolution_config" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "api_url" "text" DEFAULT ''::"text" NOT NULL,
    "api_key" "text" DEFAULT ''::"text" NOT NULL,
    "instance_name" "text" DEFAULT ''::"text" NOT NULL,
    "ativo" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "prioridade" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."evolution_config" OWNER TO "postgres";


COMMENT ON TABLE "public"."evolution_config" IS 'PENDENCIA DE SEGURANCA: guarda a API key do WhatsApp e e lida pelo frontend (10 telas, inclusive o chat do Time Comercial). Escrita ja e so de admin; a leitura so fecha quando o envio sair do cliente para uma edge function.';



CREATE OR REPLACE VIEW "public"."aquecimento_saude_view" WITH ("security_invoker"='true') AS
 SELECT "c"."id" AS "chip_id",
    "c"."evolution_config_id",
    "ec"."instance_name",
    "c"."numero_whatsapp",
    "c"."status",
    "c"."data_inicio",
    ((CURRENT_DATE - "c"."data_inicio") + 1) AS "dia_aquecimento",
    "c"."consecutive_errors",
    COALESCE("j"."total_enviados", (0)::bigint) AS "total_enviados",
    COALESCE("j"."total_entregues_ou_lidos", (0)::bigint) AS "total_entregues",
    COALESCE("j"."total_lidos", (0)::bigint) AS "total_lidos",
    COALESCE("j"."total_falhas", (0)::bigint) AS "total_falhas",
    "round"((("j"."total_entregues_ou_lidos")::numeric / (NULLIF("j"."total_enviados", 0))::numeric), 2) AS "taxa_entrega",
    "round"((("j"."total_lidos")::numeric / (NULLIF("j"."total_entregues_ou_lidos", 0))::numeric), 2) AS "taxa_leitura",
    COALESCE("x"."desconexoes_7d", (0)::bigint) AS "desconexoes_7d",
    "x"."estado_atual",
        CASE
            WHEN ("c"."consecutive_errors" >= 3) THEN 'risco'::"text"
            WHEN (COALESCE("x"."desconexoes_7d", (0)::bigint) > "cfg"."saude_max_desconexoes_7d") THEN 'risco'::"text"
            WHEN ((COALESCE("j"."total_enviados", (0)::bigint) >= 5) AND ((("j"."total_entregues_ou_lidos")::numeric / (NULLIF("j"."total_enviados", 0))::numeric) < "cfg"."saude_taxa_entrega_min")) THEN 'atencao'::"text"
            WHEN ((((CURRENT_DATE - "c"."data_inicio") + 1) >= "cfg"."saude_dias_min_pronto") AND (COALESCE("x"."desconexoes_7d", (0)::bigint) = 0)) THEN 'pronto'::"text"
            ELSE 'atencao'::"text"
        END AS "classificacao"
   FROM (((("public"."aquecimento_chips" "c"
     JOIN "public"."evolution_config" "ec" ON (("ec"."id" = "c"."evolution_config_id")))
     CROSS JOIN "public"."aquecimento_config" "cfg")
     LEFT JOIN LATERAL ( SELECT "count"(*) FILTER (WHERE ("aquecimento_jobs"."status" = 'enviado'::"text")) AS "total_enviados",
            "count"(*) FILTER (WHERE (("aquecimento_jobs"."status" = 'enviado'::"text") AND ("aquecimento_jobs"."ack_status" = ANY (ARRAY['entregue'::"text", 'lido'::"text"])))) AS "total_entregues_ou_lidos",
            "count"(*) FILTER (WHERE (("aquecimento_jobs"."status" = 'enviado'::"text") AND ("aquecimento_jobs"."ack_status" = 'lido'::"text"))) AS "total_lidos",
            "count"(*) FILTER (WHERE ("aquecimento_jobs"."status" = 'erro'::"text")) AS "total_falhas"
           FROM "public"."aquecimento_jobs"
          WHERE (("aquecimento_jobs"."chip_origem_id" = "c"."id") AND ("aquecimento_jobs"."created_at" >= ("now"() - '14 days'::interval)))) "j" ON (true))
     LEFT JOIN LATERAL ( SELECT "count"(*) FILTER (WHERE (("e"."state" = 'close'::"text") AND ("e"."created_at" >= ("now"() - '7 days'::interval)))) AS "desconexoes_7d",
            ("array_agg"("e"."state" ORDER BY "e"."created_at" DESC))[1] AS "estado_atual"
           FROM "public"."evolution_conexao_eventos" "e"
          WHERE ("e"."instance_name" = "ec"."instance_name")) "x" ON (true));


ALTER VIEW "public"."aquecimento_saude_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "target_id" "text",
    "details" "jsonb",
    "ip_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_logs" IS 'So admin le. Escrita e exclusiva de service_role (trigger/edge function) — nao existe policy de insert de proposito.';



CREATE TABLE IF NOT EXISTS "public"."aula_secreta_eventos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "data_evento" "date",
    "status" "text" DEFAULT 'planejamento'::"text",
    "sheets_id" "text",
    "descricao" "text",
    "meta_matriculas" integer DEFAULT 0,
    "local" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "ativo" boolean DEFAULT false,
    CONSTRAINT "aula_secreta_eventos_status_check" CHECK (("status" = ANY (ARRAY['em_andamento'::"text", 'finalizado'::"text", 'planejamento'::"text"])))
);


ALTER TABLE "public"."aula_secreta_eventos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aula_secreta_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "aula_secreta_evento_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "email" "text",
    "whatsapp" "text",
    "data_entrada" timestamp with time zone DEFAULT "now"(),
    "fase" "text" DEFAULT 'novo'::"text" NOT NULL,
    "ingresso_pago" boolean DEFAULT false,
    "presente_evento" boolean DEFAULT false,
    "closer" boolean DEFAULT false,
    "follow_up_01" boolean DEFAULT false,
    "follow_up_02" boolean DEFAULT false,
    "follow_up_03" boolean DEFAULT false,
    "matriculado" boolean DEFAULT false,
    "valor_ingresso" numeric DEFAULT 10.00,
    "valor_matricula" numeric DEFAULT 397.00,
    "erro" "text",
    "responsavel_id" "uuid",
    "observacoes" "text",
    "ultima_atividade" timestamp with time zone DEFAULT "now"(),
    "sheets_row_index" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."aula_secreta_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aula_secreta_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "aula_secreta_evento_id" "uuid",
    "evento" "text" NOT NULL,
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."aula_secreta_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."balanco_config" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "taxas" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "socios" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "parametros_cfo" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."balanco_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."balanco_itens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "descricao" "text" NOT NULL,
    "valor" numeric NOT NULL,
    "tipo" "text" NOT NULL,
    "categoria" "text" NOT NULL,
    "produto" "text" DEFAULT 'geral'::"text" NOT NULL,
    "mes_referencia" "text" NOT NULL,
    "recorrente" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "retorno_realizado" numeric DEFAULT 0,
    "empresa" "text" DEFAULT 'onze_digital'::"text" NOT NULL,
    CONSTRAINT "balanco_itens_categoria_check" CHECK (("categoria" = ANY (ARRAY['matricula'::"text", 'outro_entrada'::"text", 'custo_fixo'::"text", 'custo_variavel'::"text", 'ads'::"text", 'alocacao'::"text", 'outro_saida'::"text"]))),
    CONSTRAINT "balanco_itens_produto_check" CHECK (("produto" = ANY (ARRAY['npa'::"text", 'psicanalise'::"text", 'geral'::"text"]))),
    CONSTRAINT "balanco_itens_tipo_check" CHECK (("tipo" = ANY (ARRAY['entrada'::"text", 'saida'::"text"]))),
    CONSTRAINT "balanco_itens_valor_check" CHECK (("valor" > (0)::numeric))
);


ALTER TABLE "public"."balanco_itens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."boas_vindas_agendados" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lancamento_id" "uuid",
    "lead_id" "uuid" NOT NULL,
    "lead_tabela" "text" DEFAULT 'lancamento_leads'::"text" NOT NULL,
    "funnel_name" "text" NOT NULL,
    "nome" "text",
    "whatsapp" "text" NOT NULL,
    "mensagem" "text" NOT NULL,
    "agendado_para" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "enviado_em" timestamp with time zone,
    "erro_msg" "text",
    "criado_em" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "bv_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'enviado'::"text", 'erro'::"text"])))
);


ALTER TABLE "public"."boas_vindas_agendados" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."boas_vindas_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "funnel_name" "text" NOT NULL,
    "ativo" boolean DEFAULT false NOT NULL,
    "wpp_ativo" boolean DEFAULT true NOT NULL,
    "wpp_instance_name" "text",
    "wpp_mensagem" "text" DEFAULT ''::"text" NOT NULL,
    "email_ativo" boolean DEFAULT false NOT NULL,
    "email_assunto" "text" DEFAULT ''::"text" NOT NULL,
    "email_corpo" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "wpp_mensagem_tarde" "text",
    "wpp_message_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "wpp_media_url" "text",
    "delay_minutos" integer DEFAULT 0 NOT NULL,
    "delay_min_s" integer DEFAULT 20 NOT NULL,
    "delay_max_s" integer DEFAULT 60 NOT NULL,
    "daily_limit" integer DEFAULT 150 NOT NULL,
    "safe_hour_start" integer DEFAULT 8 NOT NULL,
    "safe_hour_end" integer DEFAULT 21 NOT NULL,
    "max_errors_seq" integer DEFAULT 3 NOT NULL,
    "enviados_hoje" integer DEFAULT 0 NOT NULL,
    "dia_contagem" "date" DEFAULT CURRENT_DATE NOT NULL,
    "erros_seq" integer DEFAULT 0 NOT NULL,
    "pausado_por_erro" boolean DEFAULT false NOT NULL,
    "auto_agendar" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."boas_vindas_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."boas_vindas_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "funnel_name" "text" NOT NULL,
    "nome" "text",
    "whatsapp" "text",
    "email" "text",
    "wpp_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "email_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "wpp_error" "text",
    "email_error" "text",
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "respondeu_em" timestamp with time zone,
    "ultima_resposta" "text"
);


ALTER TABLE "public"."boas_vindas_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bonus_tipos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bonus_tipos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bonus_turmas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bonus_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bonus_turmas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."canais_cobranca" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."canais_cobranca" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_leituras" (
    "user_id" "uuid" NOT NULL,
    "telefone" "text" NOT NULL,
    "lida_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chat_leituras" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cobranca_config" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "ativo" boolean DEFAULT false NOT NULL,
    "horario_envio" time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    "dias_pre_vencimento" integer[] DEFAULT '{3,1}'::integer[] NOT NULL,
    "enviar_pre_vencimento" boolean DEFAULT true NOT NULL,
    "enviar_no_vencimento" boolean DEFAULT true NOT NULL,
    "dias_pos_vencimento" integer[] DEFAULT '{1,3,7,15}'::integer[] NOT NULL,
    "enviar_pos_vencimento" boolean DEFAULT true NOT NULL,
    "enviar_apenas_dias_uteis" boolean DEFAULT true NOT NULL,
    "pausar_fins_semana" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "horario_fim_envio" "text" DEFAULT '18:00'::"text",
    "horario_inicio_envio" "text" DEFAULT '09:00'::"text",
    "produto_slug" "text",
    "delay_min_s" integer DEFAULT 20 NOT NULL,
    "delay_max_s" integer DEFAULT 60 NOT NULL,
    "daily_limit" integer DEFAULT 150 NOT NULL,
    "max_errors_seq" integer DEFAULT 3 NOT NULL,
    "evolution_config_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "enviados_hoje" integer DEFAULT 0 NOT NULL,
    "dia_contagem" "date" DEFAULT CURRENT_DATE NOT NULL,
    "erros_seq" integer DEFAULT 0 NOT NULL,
    "ultimo_envio_em" timestamp with time zone,
    "pausado_por_erro" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."cobranca_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cobranca_ia_conversas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "aluno_id" "uuid" NOT NULL,
    "pagamento_id" "uuid",
    "aluno_nome" "text" DEFAULT ''::"text" NOT NULL,
    "telefone" "text" NOT NULL,
    "evolution_instance" "text" NOT NULL,
    "cobranca_log_id" "uuid",
    "status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "data_prometida" "date",
    "resumo_ia" "text",
    "motivo_handoff" "text",
    "turnos_ia" integer DEFAULT 0 NOT NULL,
    "ultima_mensagem_em" timestamp with time zone,
    "resolvido_por" "uuid",
    "resolvido_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cobranca_ia_conversas_motivo_handoff_check" CHECK ((("motivo_handoff" IS NULL) OR ("motivo_handoff" = ANY (ARRAY['dado_coletado'::"text", 'fora_de_escopo'::"text", 'pedido_negociacao'::"text", 'reclamacao'::"text", 'baixa_confianca'::"text", 'erro_ia'::"text", 'limite_turnos'::"text", 'pedido_cancelamento'::"text"])))),
    CONSTRAINT "cobranca_ia_conversas_status_check" CHECK (("status" = ANY (ARRAY['ativo'::"text", 'dado_coletado'::"text", 'aguardando_humano'::"text", 'encerrado'::"text"])))
);


ALTER TABLE "public"."cobranca_ia_conversas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cobranca_ia_mensagens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversa_id" "uuid" NOT NULL,
    "papel" "text" NOT NULL,
    "conteudo" "text" NOT NULL,
    "meta" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cobranca_ia_mensagens_papel_check" CHECK (("papel" = ANY (ARRAY['lead'::"text", 'agente'::"text"])))
);


ALTER TABLE "public"."cobranca_ia_mensagens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cobranca_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "aluno_id" "uuid",
    "pagamento_id" "uuid",
    "aluno_nome" "text" DEFAULT ''::"text" NOT NULL,
    "telefone" "text" NOT NULL,
    "mensagem" "text" NOT NULL,
    "template_nome" "text",
    "template_tipo" "text",
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "erro_msg" "text",
    "agendado_para" timestamp with time zone,
    "enviado_em" timestamp with time zone,
    "enviado_por" "uuid",
    "manual" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "template_id" "uuid",
    "respondeu_em" timestamp with time zone,
    "ultima_resposta" "text",
    "grupo_envio_id" "uuid",
    CONSTRAINT "cobranca_logs_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'enviado'::"text", 'erro'::"text", 'cancelado'::"text"])))
);


ALTER TABLE "public"."cobranca_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."cobranca_logs"."grupo_envio_id" IS 'Agrupa as linhas de log geradas por um mesmo envio consolidado (1 mensagem cobrindo várias parcelas do mesmo aluno).';



CREATE TABLE IF NOT EXISTS "public"."cobranca_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "dias_offset" integer DEFAULT 0 NOT NULL,
    "mensagem" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dias_offset_fim" integer,
    CONSTRAINT "cobranca_templates_tipo_check" CHECK (("tipo" = ANY (ARRAY['pre_vencimento'::"text", 'vencimento'::"text", 'pos_vencimento'::"text", 'quitacao'::"text", 'aviso_cancelamento'::"text", 'promessa_vencida'::"text"])))
);


ALTER TABLE "public"."cobranca_templates" OWNER TO "postgres";


COMMENT ON COLUMN "public"."cobranca_templates"."dias_offset_fim" IS 'Fim da faixa de dias (fase) para templates pos_vencimento. NULL = sem limite superior (fase aberta). Pra pre_vencimento/vencimento, igual a dias_offset (evento de dia único).';



CREATE TABLE IF NOT EXISTS "public"."cobranca_turmas_ativas" (
    "turma_id" "uuid" NOT NULL,
    "ativado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cobranca_turmas_ativas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conteudo_calendario" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "titulo" "text" NOT NULL,
    "plataforma" "text",
    "formato" "text",
    "responsavel" "uuid",
    "status" "text" DEFAULT 'ideia'::"text",
    "data_publicacao" "date",
    "legenda" "text",
    "link" "text",
    "observacoes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "tipo_conteudo" "text" DEFAULT 'organico'::"text",
    "produto_slug" "text",
    "evento_id" "uuid",
    "angulo" "text",
    "hook" "text",
    "texto_peca" "text",
    "cta_texto" "text",
    "prompt_imagem" "text",
    "imagem_url" "text",
    "formato_1x1" boolean DEFAULT true,
    "formato_4x5" boolean DEFAULT true,
    "formato_9x16" boolean DEFAULT false,
    "nota_auditoria" numeric,
    "gerado_por" "text" DEFAULT 'manual'::"text",
    "aprovado" boolean DEFAULT false,
    "aprovado_em" timestamp with time zone,
    "slack_message_ts" "text",
    "cliente_id" "uuid",
    CONSTRAINT "conteudo_calendario_formato_check" CHECK (("formato" = ANY (ARRAY['reels'::"text", 'feed'::"text", 'stories'::"text", 'carrossel'::"text", 'video'::"text", 'short'::"text"]))),
    CONSTRAINT "conteudo_calendario_plataforma_check" CHECK (("plataforma" = ANY (ARRAY['instagram'::"text", 'youtube'::"text", 'tiktok'::"text", 'linkedin'::"text"]))),
    CONSTRAINT "conteudo_calendario_status_check" CHECK (("status" = ANY (ARRAY['ideia'::"text", 'roteiro'::"text", 'gravando'::"text", 'editando'::"text", 'agendado'::"text", 'publicado'::"text"]))),
    CONSTRAINT "conteudo_calendario_tipo_conteudo_check" CHECK (("tipo_conteudo" = ANY (ARRAY['organico'::"text", 'pago'::"text", 'ambos'::"text"])))
);


ALTER TABLE "public"."conteudo_calendario" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conteudo_clientes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" character varying(50) NOT NULL,
    "nome" character varying(255) NOT NULL,
    "nicho" character varying(255),
    "publico_alvo" "text",
    "tom_de_voz" "text",
    "cor_primaria" character varying(7),
    "cor_secundaria" character varying(7),
    "logo_url" "text",
    "hashtags_fixas" "text"[] DEFAULT '{}'::"text"[],
    "cta_padrao" "text",
    "temas_evitar" "text"[] DEFAULT '{}'::"text"[],
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "pilares_conteudo" "text"[] DEFAULT '{}'::"text"[],
    "estilo_visual" character varying(20) DEFAULT 'manchete'::character varying NOT NULL,
    "formula_headline" "text",
    "arquetipos_visuais_preferidos" "text"[] DEFAULT '{}'::"text"[],
    "arquetipos_visuais_evitar" "text"[] DEFAULT '{}'::"text"[],
    "fundos_fixos" "text"[] DEFAULT '{}'::"text"[],
    "instagram_handle" "text",
    CONSTRAINT "conteudo_clientes_estilo_visual_check" CHECK ((("estilo_visual")::"text" = ANY ((ARRAY['manchete'::character varying, 'editorial'::character varying])::"text"[])))
);


ALTER TABLE "public"."conteudo_clientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conteudo_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "data_post" "date" DEFAULT CURRENT_DATE NOT NULL,
    "tema" character varying(255),
    "tema_fonte" "text",
    "legenda" "text",
    "imagem_feed_url" "text",
    "imagem_stories_url" "text",
    "status" character varying(20) DEFAULT 'rascunho'::character varying,
    "aprovado_por" "uuid",
    "aprovado_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "pilar" "text",
    "arquetipo_visual" "text",
    "blueprint_id" "uuid",
    "blueprint_versao" integer,
    "qa_visual" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "qa_visual_status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "formato" "text",
    "reaproveitavel" boolean DEFAULT false NOT NULL,
    "vezes_reaproveitado" integer DEFAULT 0 NOT NULL,
    "headline" "text",
    CONSTRAINT "conteudo_posts_formato_check" CHECK (("formato" = ANY (ARRAY['tipografico'::"text", 'fotografico'::"text"]))),
    CONSTRAINT "conteudo_posts_qa_visual_status_check" CHECK (("qa_visual_status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'reprovado'::"text"]))),
    CONSTRAINT "conteudo_posts_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['rascunho'::character varying, 'aprovado'::character varying, 'publicado'::character varying, 'rejeitado'::character varying])::"text"[])))
);


ALTER TABLE "public"."conteudo_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chave" "text",
    "valor" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cursos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cursos" OWNER TO "postgres";


COMMENT ON TABLE "public"."cursos" IS 'Catalogo de cursos. Camada D: logado le, admin escreve.';



CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "whatsapp" "text",
    "email" "text",
    "origem" "text",
    "turma_id" "uuid",
    "status" "text" DEFAULT 'Novo Lead'::"text",
    "responsavel_id" "uuid",
    "observacoes" "text",
    "criado_em" timestamp with time zone DEFAULT "now"(),
    "produto" "text" DEFAULT 'direto'::"text",
    "ultima_atividade" timestamp with time zone DEFAULT "now"(),
    "valor_potencial" numeric DEFAULT 109.90,
    "telefone" "text",
    "lancamento_id" "uuid",
    "primeiro_contato_agendado_em" timestamp with time zone,
    "primeiro_contato_enviado_em" timestamp with time zone,
    "primeiro_contato_erro" "text",
    "matriculado_em" timestamp with time zone,
    "mensagem_lead" "text",
    "mensagem_ia" "text",
    "engajamento" "text",
    "objetivo_principal" "text",
    "tempo_interesse" "text",
    "vendedor" "text",
    "canal" "text",
    "interesse_produto" "text",
    "cidade" "text",
    "campanha_id" "uuid",
    "pessoa_id" "uuid",
    CONSTRAINT "leads_produto_check" CHECK (("produto" = ANY (ARRAY['direto'::"text", 'lancamento'::"text", 'npa'::"text", 'time_comercial'::"text"])))
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."leads" IS 'Pool comum por decisao do dono: quem tem Pipeline ou Time Comercial enxerga os leads sem vendedor e pode pegar. Fora isso, so o dono do lead e gestor/admin.';



COMMENT ON COLUMN "public"."leads"."primeiro_contato_agendado_em" IS 'Quando a mensagem automatica de qualificacao deve sair (3-5 min apos a entrada). Nulo = nao agendado.';



COMMENT ON COLUMN "public"."leads"."primeiro_contato_enviado_em" IS 'Quando a mensagem automatica saiu de fato. Nao-nulo = nao reenviar.';



COMMENT ON COLUMN "public"."leads"."canal" IS 'Canal de aquisicao do lead dentro do funil Time Comercial (SDD, Direto, Webinario, Workshop, Retorno/Base, Organico). Nao confundir com origem, que distingue Leads Diretos de Time Comercial.';



COMMENT ON COLUMN "public"."leads"."interesse_produto" IS 'Produto/curso de interesse do lead em texto livre (ex: Psicanálise) -- só usado pelo funil Time Comercial. Diferente de `produto`, que é categórico (direto/lancamento/npa/time_comercial) e reflete a origem.';



CREATE OR REPLACE VIEW "public"."dashboard_metricas" WITH ("security_invoker"='true') AS
 SELECT "count"(*) FILTER (WHERE (("produto" = 'direto'::"text") AND ("status" <> 'matricula'::"text"))) AS "leads_direto",
    "count"(*) FILTER (WHERE (("produto" = 'lancamento'::"text") AND ("status" <> 'matricula'::"text"))) AS "leads_lancamento",
    "count"(*) FILTER (WHERE (("produto" = 'npa'::"text") AND ("status" <> 'matricula'::"text"))) AS "leads_npa",
    "count"(*) FILTER (WHERE (("status" = ANY (ARRAY['closer'::"text", 'follow_up_01'::"text", 'follow_up_02'::"text", 'follow_up_03'::"text"])) AND ("ultima_atividade" < ("now"() - '3 days'::interval)))) AS "leads_em_risco",
    "sum"("valor_potencial") FILTER (WHERE (("status" = ANY (ARRAY['closer'::"text", 'follow_up_01'::"text", 'follow_up_02'::"text", 'follow_up_03'::"text"])) AND ("ultima_atividade" < ("now"() - '3 days'::interval)))) AS "valor_em_risco",
    "sum"("valor_potencial") FILTER (WHERE ("status" <> 'matricula'::"text")) AS "receita_potencial_funil"
   FROM "public"."leads";


ALTER VIEW "public"."dashboard_metricas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ddd_regioes" (
    "ddd" integer NOT NULL,
    "cidade" "text" NOT NULL,
    "estado" "text" NOT NULL,
    "uf" "text" NOT NULL
);


ALTER TABLE "public"."ddd_regioes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."disparo_campanhas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "descricao" "text",
    "template" "text",
    "status" "text" DEFAULT 'rascunho'::"text" NOT NULL,
    "leads_total" integer DEFAULT 0 NOT NULL,
    "leads_sent" integer DEFAULT 0 NOT NULL,
    "leads_error" integer DEFAULT 0 NOT NULL,
    "leads_skipped" integer DEFAULT 0 NOT NULL,
    "delay_min_s" integer DEFAULT 5 NOT NULL,
    "delay_max_s" integer DEFAULT 15 NOT NULL,
    "daily_limit" integer DEFAULT 200 NOT NULL,
    "safe_hour_start" integer DEFAULT 8 NOT NULL,
    "safe_hour_end" integer DEFAULT 21 NOT NULL,
    "max_errors_seq" integer DEFAULT 3 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "message_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "media_url" "text",
    "evolution_config_id" "text" DEFAULT 'default'::"text" NOT NULL,
    "next_send_at" timestamp with time zone DEFAULT "now"(),
    "consecutive_errors" integer DEFAULT 0 NOT NULL,
    "callback_url" "text",
    "email_contato" "text",
    "mention_everyone" boolean DEFAULT false,
    "evolution_config_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "disparo_campanhas_message_type_check" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'image'::"text", 'video'::"text", 'audio'::"text"]))),
    CONSTRAINT "disparo_campanhas_status_check" CHECK (("status" = ANY (ARRAY['rascunho'::"text", 'ativo'::"text", 'pausado'::"text", 'concluido'::"text", 'erro'::"text"])))
);


ALTER TABLE "public"."disparo_campanhas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."disparo_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campanha_id" "uuid" NOT NULL,
    "nome" "text",
    "phone" "text" NOT NULL,
    "variaveis" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "error_msg" "text",
    "ordem" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "temperatura" "text" DEFAULT 'frio'::"text" NOT NULL,
    "email" "text",
    "instance_id" "text",
    "respondeu_em" timestamp with time zone,
    "ultima_resposta" "text",
    "evolution_message_id" "text",
    "ack_status" "text",
    "entregue_em" timestamp with time zone,
    "lido_em" timestamp with time zone,
    "reenviado_apos_falha" boolean DEFAULT false NOT NULL,
    "pessoa_id" "uuid",
    CONSTRAINT "disparo_leads_ack_status_check" CHECK (("ack_status" = ANY (ARRAY['entregue'::"text", 'lido'::"text", 'falhou'::"text"]))),
    CONSTRAINT "disparo_leads_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'enviando'::"text", 'enviado'::"text", 'erro'::"text", 'pulado'::"text"]))),
    CONSTRAINT "disparo_leads_temperatura_check" CHECK (("temperatura" = ANY (ARRAY['quente'::"text", 'morno'::"text", 'frio'::"text"])))
);


ALTER TABLE "public"."disparo_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "provider" "text" DEFAULT 'resend'::"text" NOT NULL,
    "api_key" "text" DEFAULT ''::"text" NOT NULL,
    "from_name" "text" DEFAULT ''::"text" NOT NULL,
    "from_email" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipe" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "email" "text",
    "cargo" "text",
    "cor" "text" DEFAULT '#2563EB'::"text",
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."equipe" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipe_11ds_agentes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "time_id" "uuid" NOT NULL,
    "nome" character varying(255) NOT NULL,
    "cargo" character varying(255),
    "avatar_url" "text",
    "ordem" integer DEFAULT 0,
    "status" character varying(20) DEFAULT 'livre'::character varying,
    "status_texto" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "executor_function" "text" DEFAULT 'equipe-11ds-executar'::"text" NOT NULL,
    "slug" "text",
    "responsabilidade" "text",
    "regras" "text"[] DEFAULT '{}'::"text"[],
    "aplica" "text"[] DEFAULT '{}'::"text"[],
    CONSTRAINT "equipe_11ds_agentes_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['livre'::character varying, 'trabalhando'::character varying, 'erro'::character varying])::"text"[])))
);


ALTER TABLE "public"."equipe_11ds_agentes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipe_11ds_blueprints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "versao" integer NOT NULL,
    "status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "referencia_url" "text",
    "base_visual_url" "text",
    "spec" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "criado_por" "uuid",
    "substitui_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "equipe_11ds_blueprints_status_check" CHECK (("status" = ANY (ARRAY['ativo'::"text", 'substituido'::"text", 'arquivado'::"text"]))),
    CONSTRAINT "equipe_11ds_blueprints_tipo_check" CHECK (("tipo" = ANY (ARRAY['tipografico'::"text", 'fotografico'::"text"]))),
    CONSTRAINT "equipe_11ds_blueprints_versao_check" CHECK (("versao" > 0))
);


ALTER TABLE "public"."equipe_11ds_blueprints" OWNER TO "postgres";


COMMENT ON TABLE "public"."equipe_11ds_blueprints" IS 'Contratos geométricos e visuais versionados usados pelo compositor da Equipe 11DS.';



CREATE TABLE IF NOT EXISTS "public"."equipe_11ds_chat_acoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agente_id" "uuid" NOT NULL,
    "solicitante_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "estado" "text" DEFAULT 'proposta'::"text" NOT NULL,
    "resumo" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resultado" "jsonb",
    "erro_mensagem" "text",
    "confirmado_em" timestamp with time zone,
    "concluido_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "equipe_11ds_chat_acoes_estado_check" CHECK (("estado" = ANY (ARRAY['proposta'::"text", 'confirmada'::"text", 'cancelada'::"text", 'concluida'::"text", 'erro'::"text"]))),
    CONSTRAINT "equipe_11ds_chat_acoes_tipo_check" CHECK (("tipo" = ANY (ARRAY['executar_tarefa'::"text", 'gerar_proximo_post'::"text", 'gerar_calendario'::"text"])))
);


ALTER TABLE "public"."equipe_11ds_chat_acoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipe_11ds_chat_mensagens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agente_id" "uuid" NOT NULL,
    "solicitante_id" "uuid" NOT NULL,
    "papel" "text" NOT NULL,
    "conteudo" "text" NOT NULL,
    "acao_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plano_id" "uuid",
    CONSTRAINT "equipe_11ds_chat_mensagens_papel_check" CHECK (("papel" = ANY (ARRAY['usuario'::"text", 'agente'::"text", 'sistema'::"text"])))
);


ALTER TABLE "public"."equipe_11ds_chat_mensagens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipe_11ds_ferramenta_chamadas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plano_id" "uuid" NOT NULL,
    "etapa_id" "uuid" NOT NULL,
    "ferramenta" "text" NOT NULL,
    "entrada_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'executando'::"text" NOT NULL,
    "resultado" "jsonb",
    "evidencia" "text",
    "erro_mensagem" "text",
    "duracao_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "concluido_em" timestamp with time zone,
    CONSTRAINT "equipe_11ds_ferramenta_chamadas_duracao_ms_check" CHECK ((("duracao_ms" IS NULL) OR ("duracao_ms" >= 0))),
    CONSTRAINT "equipe_11ds_ferramenta_chamadas_status_check" CHECK (("status" = ANY (ARRAY['executando'::"text", 'concluida'::"text", 'erro'::"text"])))
);


ALTER TABLE "public"."equipe_11ds_ferramenta_chamadas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipe_11ds_memorias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "solicitante_id" "uuid" NOT NULL,
    "plano_id" "uuid",
    "agente_id" "uuid",
    "tipo" "text" NOT NULL,
    "escopo" "text" NOT NULL,
    "caminho_obsidian" "text",
    "resumo" "text" NOT NULL,
    "conteudo_hash" "text" NOT NULL,
    "confianca" numeric(3,2) DEFAULT 0.80 NOT NULL,
    "status" "text" DEFAULT 'ativa'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "invalidada_em" timestamp with time zone,
    "origem" "text" DEFAULT 'agente'::"text" NOT NULL,
    "cliente_id" "uuid",
    "regra" "text",
    "evidencia" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "agentes_consumidores" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "prioridade" smallint DEFAULT 50 NOT NULL,
    "substitui_id" "uuid",
    "github_sha" "text",
    "tentativas_sync" smallint DEFAULT 0 NOT NULL,
    "proxima_tentativa_em" timestamp with time zone,
    "sincronizada_em" timestamp with time zone,
    "erro_sync" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "equipe_11ds_memorias_confianca_check" CHECK ((("confianca" >= (0)::numeric) AND ("confianca" <= (1)::numeric))),
    CONSTRAINT "equipe_11ds_memorias_origem_check" CHECK (("origem" = ANY (ARRAY['usuario'::"text", 'agente'::"text"]))),
    CONSTRAINT "equipe_11ds_memorias_prioridade_check" CHECK ((("prioridade" >= 0) AND ("prioridade" <= 100))),
    CONSTRAINT "equipe_11ds_memorias_status_check" CHECK (("status" = ANY (ARRAY['pendente_sincronizacao'::"text", 'ativa'::"text", 'substituida'::"text", 'arquivada'::"text"]))),
    CONSTRAINT "equipe_11ds_memorias_tentativas_sync_check" CHECK ((("tentativas_sync" >= 0) AND ("tentativas_sync" <= 10))),
    CONSTRAINT "equipe_11ds_memorias_tipo_check" CHECK (("tipo" = ANY (ARRAY['empresa'::"text", 'cliente'::"text", 'agente'::"text", 'procedimento'::"text", 'campanha'::"text", 'identidade_visual'::"text", 'aprendizado'::"text", 'decisao'::"text"])))
);


ALTER TABLE "public"."equipe_11ds_memorias" OWNER TO "postgres";


COMMENT ON COLUMN "public"."equipe_11ds_memorias"."status" IS 'Memória confirmada localmente pode aguardar sincronização com o cofre GitHub/Obsidian.';



COMMENT ON COLUMN "public"."equipe_11ds_memorias"."origem" IS 'Diretivas do usuário não passam pelo veto do Curador; inferências de agente passam pela régua de relevância.';



CREATE TABLE IF NOT EXISTS "public"."equipe_11ds_mensagens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tarefa_id" "uuid" NOT NULL,
    "agente_id" "uuid" NOT NULL,
    "tipo" "text" DEFAULT 'mensagem'::"text" NOT NULL,
    "conteudo" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "equipe_11ds_mensagens_tipo_check" CHECK (("tipo" = ANY (ARRAY['mensagem'::"text", 'alerta'::"text", 'aprovacao'::"text"])))
);


ALTER TABLE "public"."equipe_11ds_mensagens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipe_11ds_plano_etapas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plano_id" "uuid" NOT NULL,
    "chave" "text" NOT NULL,
    "ordem" smallint NOT NULL,
    "agente_id" "uuid",
    "agente_slug" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "descricao" "text" NOT NULL,
    "ferramenta" "text" NOT NULL,
    "parametros" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "depende_de" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "text" DEFAULT 'planejada'::"text" NOT NULL,
    "resultado" "jsonb",
    "evidencia" "text",
    "erro_mensagem" "text",
    "tentativas" smallint DEFAULT 0 NOT NULL,
    "iniciado_em" timestamp with time zone,
    "concluido_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "equipe_11ds_plano_etapas_ordem_check" CHECK (("ordem" > 0)),
    CONSTRAINT "equipe_11ds_plano_etapas_status_check" CHECK (("status" = ANY (ARRAY['planejada'::"text", 'aguardando'::"text", 'executando'::"text", 'corrigindo'::"text", 'concluida'::"text", 'erro'::"text", 'cancelada'::"text"]))),
    CONSTRAINT "equipe_11ds_plano_etapas_tentativas_check" CHECK ((("tentativas" >= 0) AND ("tentativas" <= 2)))
);


ALTER TABLE "public"."equipe_11ds_plano_etapas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipe_11ds_planos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "solicitante_id" "uuid" NOT NULL,
    "agente_responsavel_id" "uuid" NOT NULL,
    "objetivo" "text" NOT NULL,
    "resumo" "text" NOT NULL,
    "status" "text" DEFAULT 'aguardando_confirmacao'::"text" NOT NULL,
    "contexto" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "alteracoes_previstas" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "efeitos_externos" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "versao_hash" "text" NOT NULL,
    "resultado_resumo" "text",
    "erro_mensagem" "text",
    "confirmado_em" timestamp with time zone,
    "iniciado_em" timestamp with time zone,
    "concluido_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "equipe_11ds_planos_status_check" CHECK (("status" = ANY (ARRAY['planejada'::"text", 'aguardando_confirmacao'::"text", 'executando'::"text", 'concluida'::"text", 'erro'::"text", 'cancelada'::"text"])))
);


ALTER TABLE "public"."equipe_11ds_planos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipe_11ds_recorrentes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agente_id" "uuid" NOT NULL,
    "tipo" character varying(20) DEFAULT 'avulso'::character varying NOT NULL,
    "cliente_id" "uuid",
    "ordem_texto" "text" NOT NULL,
    "ativo" boolean DEFAULT true,
    "criado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "equipe_11ds_recorrentes_tipo_check" CHECK ((("tipo")::"text" = ANY ((ARRAY['post_cliente'::character varying, 'avulso'::character varying])::"text"[])))
);


ALTER TABLE "public"."equipe_11ds_recorrentes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipe_11ds_tarefas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agente_id" "uuid" NOT NULL,
    "criado_por" "uuid",
    "tipo" character varying(20) DEFAULT 'avulso'::character varying NOT NULL,
    "cliente_id" "uuid",
    "ordem_texto" "text" NOT NULL,
    "status" character varying(20) DEFAULT 'pendente'::character varying,
    "resposta_texto" "text",
    "anexos" "jsonb" DEFAULT '[]'::"jsonb",
    "conteudo_post_id" "uuid",
    "erro_mensagem" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "iniciado_em" timestamp with time zone,
    "concluido_em" timestamp with time zone,
    "recorrente_id" "uuid",
    "dados" "jsonb",
    CONSTRAINT "equipe_11ds_tarefas_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pendente'::character varying, 'em_andamento'::character varying, 'aguardando_aprovacao'::character varying, 'concluido'::character varying, 'erro'::character varying])::"text"[]))),
    CONSTRAINT "equipe_11ds_tarefas_tipo_check" CHECK ((("tipo")::"text" = ANY ((ARRAY['post_cliente'::character varying, 'avulso'::character varying, 'video_roteiro'::character varying])::"text"[])))
);


ALTER TABLE "public"."equipe_11ds_tarefas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipe_11ds_times" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" character varying(255) NOT NULL,
    "slug" character varying(50) NOT NULL,
    "emoji" character varying(10),
    "ordem" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."equipe_11ds_times" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."eventos_calendario" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "titulo" "text" NOT NULL,
    "descricao" "text",
    "data_inicio" timestamp with time zone NOT NULL,
    "data_fim" timestamp with time zone,
    "cor" "text" DEFAULT '#DC2626'::"text",
    "tipo" "text" DEFAULT 'avulso'::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."eventos_calendario" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."evolution_task_config" (
    "task" "text" NOT NULL,
    "instance_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "evolution_task_config_task_check" CHECK (("task" = ANY (ARRAY['cobranca'::"text", 'funil'::"text", 'disparo'::"text", 'boas_vindas'::"text"])))
);


ALTER TABLE "public"."evolution_task_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fechamentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "periodo_tipo" "text" NOT NULL,
    "periodo_key" "text" NOT NULL,
    "periodo_inicio" "date" NOT NULL,
    "periodo_fim" "date" NOT NULL,
    "status" "text" DEFAULT 'aberto'::"text" NOT NULL,
    "bruto" numeric DEFAULT 0 NOT NULL,
    "taxas" numeric DEFAULT 0 NOT NULL,
    "liquido" numeric DEFAULT 0 NOT NULL,
    "repasses" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "saldo_idm" numeric DEFAULT 0 NOT NULL,
    "saidas_operacionais" numeric DEFAULT 0 NOT NULL,
    "saldo_final" numeric DEFAULT 0 NOT NULL,
    "total_pagamentos" integer DEFAULT 0 NOT NULL,
    "fechado_em" timestamp with time zone,
    "fechado_por" "text",
    "reaberto_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fechamentos_periodo_tipo_check" CHECK (("periodo_tipo" = ANY (ARRAY['dia'::"text", 'semana'::"text", 'mes'::"text", 'trimestre'::"text", 'semestre'::"text", 'ano'::"text"]))),
    CONSTRAINT "fechamentos_status_check" CHECK (("status" = ANY (ARRAY['aberto'::"text", 'fechado'::"text"])))
);


ALTER TABLE "public"."fechamentos" OWNER TO "postgres";


COMMENT ON TABLE "public"."fechamentos" IS 'Snapshot travado de um período de fechamento (dia/semana/mes/trimestre/semestre/ano) da página Balanço. Uma vez status=fechado, os valores não são mais recalculados a partir de pagamentos — servem de registro histórico protegido contra edição retroativa.';



CREATE TABLE IF NOT EXISTS "public"."pagamentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "aluno_id" "uuid",
    "mes_referencia" "date" NOT NULL,
    "data_pagamento" "date",
    "valor" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'pendente'::"text",
    "turma_id" "uuid",
    "produto" "text" DEFAULT 'psicanalise'::"text",
    "data_vencimento" "date",
    "numero_parcela" integer DEFAULT 1,
    "observacoes" "text",
    "cobranca_contatado_em" timestamp with time zone,
    "canal_cobranca" "text",
    "conferido_em" timestamp with time zone,
    "conferido_por" "text",
    "data_prevista_pagamento" "date",
    "taxa_valor" numeric,
    CONSTRAINT "pagamentos_produto_check" CHECK (("produto" = ANY (ARRAY['psicanalise'::"text", 'numerologia'::"text"]))),
    CONSTRAINT "pagamentos_status_check" CHECK (("status" = ANY (ARRAY['pago'::"text", 'pendente'::"text", 'atrasado'::"text", 'isento'::"text"])))
);

ALTER TABLE ONLY "public"."pagamentos" REPLICA IDENTITY FULL;


ALTER TABLE "public"."pagamentos" OWNER TO "postgres";


COMMENT ON TABLE "public"."pagamentos" IS 'Camada A + escopo por turma: precisa de `financeiro/ver`, e quem nao tem `financeiro/ver_todos` so alcanca as turmas de allowed_financeiro_turma_ids.';



COMMENT ON COLUMN "public"."pagamentos"."canal_cobranca" IS 'Nome do canal (public.canais_cobranca) que coletou esta transação específica — escolhido ao dar baixa. Usado para calcular a taxa exata de gateway por pagamento.';



COMMENT ON COLUMN "public"."pagamentos"."conferido_em" IS 'Marcado quando o pagamento é conferido/confirmado na tela de Fechamento da Balanço (revisão do período).';



COMMENT ON COLUMN "public"."pagamentos"."taxa_valor" IS 'Taxa de gateway (R$) travada no momento da confirmação do pagamento, calculada via payment_method_rates usando o canal_cobranca escolhido naquele instante. NULL = ainda não confirmado (calcular ao vivo).';



CREATE TABLE IF NOT EXISTS "public"."turmas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "data_inicio" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "produto" "text" DEFAULT 'psicanalise'::"text",
    "data_fim" "date",
    "vagas" integer DEFAULT 30,
    "valor_mensalidade" numeric DEFAULT 109.90,
    "total_mensalidades" integer DEFAULT 15,
    "dia_vencimento" integer DEFAULT 10,
    "descricao" "text",
    "responsavel_id" "uuid",
    CONSTRAINT "turmas_dia_vencimento_check" CHECK (("dia_vencimento" = ANY (ARRAY[10, 20]))),
    CONSTRAINT "turmas_produto_check" CHECK (("produto" = ANY (ARRAY['psicanalise'::"text", 'numerologia'::"text"])))
);


ALTER TABLE "public"."turmas" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."financeiro_resumo" WITH ("security_invoker"='true') AS
 SELECT "t"."produto",
    "t"."id" AS "turma_id",
    "t"."nome" AS "turma_nome",
    "t"."data_inicio",
    "t"."data_fim",
    "t"."dia_vencimento",
    "t"."valor_mensalidade",
    "t"."total_mensalidades",
    "count"(DISTINCT "a"."id") AS "total_alunos",
    "count"(DISTINCT "a"."id") FILTER (WHERE ("a"."status" = 'ativo'::"text")) AS "alunos_ativos",
    "count"(DISTINCT "a"."id") FILTER (WHERE ("a"."status" = 'inadimplente'::"text")) AS "alunos_inadimplentes",
    "count"(DISTINCT "a"."id") FILTER (WHERE ("a"."status" = 'cancelado'::"text")) AS "alunos_cancelados",
    "count"(DISTINCT "a"."id") FILTER (WHERE ("a"."status" = 'concluido'::"text")) AS "alunos_concluidos",
    COALESCE("sum"("p"."valor") FILTER (WHERE (("p"."status" = 'pago'::"text") AND ("date_trunc"('month'::"text", ("p"."data_pagamento")::timestamp with time zone) = "date_trunc"('month'::"text", (CURRENT_DATE)::timestamp with time zone)))), (0)::numeric) AS "receita_mes_atual",
    COALESCE("sum"("p"."valor") FILTER (WHERE ("date_trunc"('month'::"text", ("p"."data_vencimento")::timestamp with time zone) = "date_trunc"('month'::"text", (CURRENT_DATE)::timestamp with time zone))), (0)::numeric) AS "previsao_mes_atual",
    COALESCE("sum"("p"."valor") FILTER (WHERE ("p"."status" = ANY (ARRAY['pendente'::"text", 'atrasado'::"text"]))), (0)::numeric) AS "total_em_aberto",
    COALESCE("sum"("p"."valor") FILTER (WHERE ("p"."status" = 'atrasado'::"text")), (0)::numeric) AS "total_atrasado",
    COALESCE("sum"("p"."valor") FILTER (WHERE ("p"."status" = 'pago'::"text")), (0)::numeric) AS "total_recebido"
   FROM (("public"."turmas" "t"
     LEFT JOIN "public"."alunos" "a" ON (("a"."turma_id" = "t"."id")))
     LEFT JOIN "public"."pagamentos" "p" ON (("p"."aluno_id" = "a"."id")))
  GROUP BY "t"."id", "t"."produto", "t"."nome", "t"."data_inicio", "t"."data_fim", "t"."dia_vencimento", "t"."valor_mensalidade", "t"."total_mensalidades";


ALTER VIEW "public"."financeiro_resumo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fontes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."fontes" OWNER TO "postgres";


COMMENT ON TABLE "public"."fontes" IS 'Catalogo de fontes de lead. Camada D: logado le, admin escreve.';



CREATE TABLE IF NOT EXISTS "public"."franquia_campanha" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "data" "date" DEFAULT CURRENT_DATE NOT NULL,
    "gasto" numeric(12,2) DEFAULT 0 NOT NULL,
    "impressoes" integer DEFAULT 0 NOT NULL,
    "cliques" integer DEFAULT 0 NOT NULL,
    "leads_count" integer DEFAULT 0 NOT NULL,
    "cpl" numeric(12,2) GENERATED ALWAYS AS (
CASE
    WHEN ("leads_count" > 0) THEN ("gasto" / ("leads_count")::numeric)
    ELSE (0)::numeric
END) STORED,
    "ctr" numeric(6,2) GENERATED ALWAYS AS (
CASE
    WHEN ("impressoes" > 0) THEN ((("cliques")::numeric / ("impressoes")::numeric) * (100)::numeric)
    ELSE (0)::numeric
END) STORED,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."franquia_campanha" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."franquia_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "whatsapp" "text",
    "email" "text",
    "cidade" "text",
    "estado" "text",
    "fase" "text" DEFAULT 'novo'::"text" NOT NULL,
    "vendedor_id" "uuid",
    "observacoes" "text",
    "dados_extras" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pessoa_id" "uuid",
    CONSTRAINT "franquia_leads_fase_check" CHECK (("fase" = ANY (ARRAY['novo'::"text", 'contatado'::"text", 'reuniao_agendada'::"text", 'fechado'::"text", 'perdido'::"text"])))
);


ALTER TABLE "public"."franquia_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."funnel_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "funnel_name" "text" NOT NULL,
    "grupo_1_id" "text" DEFAULT ''::"text" NOT NULL,
    "grupo_2_id" "text" DEFAULT ''::"text" NOT NULL,
    "imagem_manha" "text" DEFAULT ''::"text" NOT NULL,
    "imagem_tarde" "text" DEFAULT ''::"text" NOT NULL,
    "imagem_noite" "text" DEFAULT ''::"text" NOT NULL,
    "variaveis" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "imagens" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."funnel_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."funnel_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "funnel_name" "text" NOT NULL,
    "day_number" integer NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "recipient_type" "public"."funnel_recipient_type" NOT NULL,
    "recipient_id" "text" NOT NULL,
    "message_text" "text" NOT NULL,
    "status" "public"."funnel_message_status" DEFAULT 'draft'::"public"."funnel_message_status" NOT NULL,
    "sent_at" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "message_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "media_url" "text",
    "poll_name" "text",
    "poll_options" "jsonb",
    "poll_selectable_count" integer DEFAULT 1 NOT NULL,
    "link_preview" boolean DEFAULT false NOT NULL,
    "mention_everyone" boolean DEFAULT false NOT NULL,
    "send_header_image" boolean DEFAULT true NOT NULL,
    "subtipo" "text",
    "update_group_picture" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."funnel_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."funnel_poll_respostas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "funnel_message_id" "uuid",
    "funnel_name" "text",
    "group_jid" "text" NOT NULL,
    "poll_creation_message_id" "text",
    "poll_name" "text",
    "voter_jid" "text",
    "voter_phone" "text",
    "evolution_instance" "text",
    "event_type" "text" NOT NULL,
    "selected_options_hash" "jsonb",
    "selected_option_text" "text",
    "raw_payload" "jsonb" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."funnel_poll_respostas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."grupo_add_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lancamento_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "done_at" timestamp with time zone,
    "result" "text",
    "result_detail" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "action" "text" DEFAULT 'add_grupo'::"text" NOT NULL
);


ALTER TABLE "public"."grupo_add_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."idm_criativos_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "evento_tipo" "text",
    "evento_id" "uuid",
    "produto_slug" "text",
    "status" "text" DEFAULT 'iniciado'::"text",
    "erro_msg" "text",
    "n8n_execution_id" "text",
    "criativos_gerados" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "idm_criativos_log_evento_tipo_check" CHECK (("evento_tipo" = ANY (ARRAY['npa'::"text", 'lancamento'::"text", 'turma'::"text", 'produto'::"text"]))),
    CONSTRAINT "idm_criativos_log_status_check" CHECK (("status" = ANY (ARRAY['iniciado'::"text", 'copy_gerado'::"text", 'imagem_gerada'::"text", 'salvo'::"text", 'enviado_slack'::"text", 'erro'::"text"])))
);


ALTER TABLE "public"."idm_criativos_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."idm_criativos_log" IS 'Log de criativos IDM, sem consumidor no app. Somente service_role. RLS sem policy e proposital.';



CREATE TABLE IF NOT EXISTS "public"."idm_quiz_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text",
    "phone_number" "text",
    "mae_nome" "text",
    "filho_nome" "text",
    "filho_nascimento" "date",
    "perfil_numero" smallint,
    "perfil_nome" "text",
    "pontuacao" integer,
    "desconto_pct" "text",
    "resp_q4" "text",
    "resp_q5" "text"[],
    "resp_q6" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "utm_term" "text",
    "page_referrer" "text",
    "user_agent" "text",
    "checkout_clicked" boolean DEFAULT false NOT NULL,
    "lead_popup_submitted" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."idm_quiz_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kanban_colunas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lancamento_id" "uuid",
    "npa_evento_id" "uuid",
    "aula_secreta_evento_id" "uuid",
    "fase_id" "text",
    "nome" "text" NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "cor" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "leads_quadro_id" "uuid",
    "meta_leads" integer,
    "tipo_regra" "text" DEFAULT 'normal'::"text",
    CONSTRAINT "kanban_colunas_single_module" CHECK ((((((("lancamento_id" IS NOT NULL))::integer + (("npa_evento_id" IS NOT NULL))::integer) + (("aula_secreta_evento_id" IS NOT NULL))::integer) + (("leads_quadro_id" IS NOT NULL))::integer) = 1))
);


ALTER TABLE "public"."kanban_colunas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lancamento_campanhas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lancamento_id" "uuid" NOT NULL,
    "nome" "text" DEFAULT 'Campanha 1'::"text" NOT NULL,
    "meta_campaign_id" "text",
    "meta_ad_account_id" "text",
    "meta_access_token" "text",
    "ordem" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lancamento_campanhas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lancamento_eventos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lancamento_id" "uuid",
    "evento" "text" NOT NULL,
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lancamento_eventos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lancamento_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lancamento_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "email" "text",
    "whatsapp" "text",
    "data_entrada" timestamp with time zone DEFAULT "now"(),
    "fase" "text" DEFAULT 'planilha'::"text" NOT NULL,
    "enviado" boolean DEFAULT false,
    "disparo" boolean DEFAULT false,
    "no_grupo" boolean DEFAULT false,
    "grupo_oferta" boolean DEFAULT false,
    "follow_up_01" boolean DEFAULT false,
    "follow_up_02" boolean DEFAULT false,
    "follow_up_03" boolean DEFAULT false,
    "matriculado" boolean DEFAULT false,
    "erro" "text",
    "responsavel_id" "uuid",
    "observacoes" "text",
    "ultima_atividade" timestamp with time zone DEFAULT "now"(),
    "sheets_row_index" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "crm" boolean DEFAULT false,
    "bv_enviado" boolean DEFAULT false,
    "bv_enviado_em" timestamp with time zone,
    "ultima_resposta_at" timestamp with time zone,
    "ultima_resposta" "text",
    "cidade" "text",
    "pessoa_id" "uuid"
);


ALTER TABLE "public"."lancamento_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lancamentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "data_live" "date",
    "status" "text" DEFAULT 'ativo'::"text",
    "meta_leads" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "sheets_id" "text",
    "descricao" "text",
    "meta_matriculas" integer DEFAULT 0,
    "ativo" boolean DEFAULT false,
    "valor_matricula" numeric DEFAULT 109.90,
    "meta_faturamento" numeric DEFAULT 0,
    "meta_campaign_id" "text",
    "meta_ad_account_id" "text",
    "meta_access_token" "text",
    "grupo_lancamento_jid" "text",
    "grupo_oferta_jid" "text",
    "turma_destino_id" "uuid",
    "responsavel_id" "uuid",
    "produto_destino" "text",
    "valor_mensalidade_destino" numeric,
    "dia_vencimento_destino" integer,
    "total_mensalidades_destino" integer,
    "slogan" "text" DEFAULT 'Excelente'::"text",
    "professor_convidado" "text",
    CONSTRAINT "lancamentos_status_check" CHECK (("status" = ANY (ARRAY['em_andamento'::"text", 'finalizado'::"text", 'planejamento'::"text", 'ativo'::"text", 'inativo'::"text"])))
);


ALTER TABLE "public"."lancamentos" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."lancamento_kanban" WITH ("security_invoker"='true') AS
 SELECT "ll"."id",
    "ll"."lancamento_id",
    "ll"."nome",
    "ll"."email",
    "ll"."whatsapp",
    "ll"."data_entrada",
    "ll"."fase",
    "ll"."enviado",
    "ll"."disparo",
    "ll"."no_grupo",
    "ll"."grupo_oferta",
    "ll"."follow_up_01",
    "ll"."follow_up_02",
    "ll"."follow_up_03",
    "ll"."matriculado",
    "ll"."erro",
    "ll"."responsavel_id",
    "ll"."observacoes",
    "ll"."ultima_atividade",
    "ll"."sheets_row_index",
    "ll"."created_at",
    "ll"."updated_at",
    "ll"."crm",
    "kc"."nome" AS "coluna_nome",
    "kc"."ordem" AS "coluna_ordem",
    "l"."nome" AS "lancamento_nome",
    "l"."status" AS "lancamento_status",
    "l"."ativo" AS "lancamento_ativo"
   FROM (("public"."lancamento_leads" "ll"
     LEFT JOIN "public"."kanban_colunas" "kc" ON (((("kc"."id")::"text" = "ll"."fase") AND ("kc"."lancamento_id" = "ll"."lancamento_id"))))
     LEFT JOIN "public"."lancamentos" "l" ON (("l"."id" = "ll"."lancamento_id")));


ALTER VIEW "public"."lancamento_kanban" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_aquecimento_campanhas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "criado_por" "uuid",
    "leads_total" integer DEFAULT 0 NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_aquecimento_campanhas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_aquecimento_config" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "isca_message_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "isca_texto" "text" DEFAULT ''::"text" NOT NULL,
    "isca_media_url" "text",
    "isca_delay_min_min" integer DEFAULT 5 NOT NULL,
    "isca_delay_max_min" integer DEFAULT 30 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lead_aquecimento_config_isca_message_type_check" CHECK (("isca_message_type" = ANY (ARRAY['text'::"text", 'image'::"text", 'audio'::"text", 'video'::"text", 'document'::"text"])))
);


ALTER TABLE "public"."lead_aquecimento_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_aquecimento_fases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fase_numero" integer NOT NULL,
    "nome" "text" NOT NULL,
    "message_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "mensagem_texto" "text" DEFAULT ''::"text" NOT NULL,
    "media_url" "text",
    "ativo" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lead_aquecimento_fases_fase_numero_check" CHECK ((("fase_numero" >= 1) AND ("fase_numero" <= 4))),
    CONSTRAINT "lead_aquecimento_fases_message_type_check" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'image'::"text", 'audio'::"text", 'video'::"text", 'document'::"text"])))
);


ALTER TABLE "public"."lead_aquecimento_fases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_aquecimento_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campanha_id" "uuid" NOT NULL,
    "nome" "text",
    "phone" "text" NOT NULL,
    "origem_tabela" "text",
    "origem_id" "text",
    "fase_atual" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'aguardando_envio_fase'::"text" NOT NULL,
    "evolution_config_id_envio" "text",
    "fase_enviada_em" timestamp with time zone,
    "respondeu_fase_em" timestamp with time zone,
    "isca_agendada_para" timestamp with time zone,
    "isca_enviada_em" timestamp with time zone,
    "vendedor_id" "uuid",
    "error_msg" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "produto" "text",
    CONSTRAINT "lead_aquecimento_leads_fase_atual_check" CHECK ((("fase_atual" >= 1) AND ("fase_atual" <= 4))),
    CONSTRAINT "lead_aquecimento_leads_status_check" CHECK (("status" = ANY (ARRAY['aguardando_envio_fase'::"text", 'aguardando_engajamento'::"text", 'aguardando_isca'::"text", 'isca_enviada'::"text", 'erro'::"text"])))
);


ALTER TABLE "public"."lead_aquecimento_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_aquecimento_vendedores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "evolution_config_id" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_aquecimento_vendedores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_cartas_usadas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "carta_id" "uuid" NOT NULL,
    "usado_por" "uuid",
    "usado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_cartas_usadas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_respostas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "lancamento_id" "uuid",
    "phone" "text" NOT NULL,
    "mensagem" "text",
    "mensagem_tipo" "text" DEFAULT 'text'::"text",
    "evolution_instance" "text",
    "lida" boolean DEFAULT false NOT NULL,
    "recebido_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_respostas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads_cartas_negociacao" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "titulo" "text" NOT NULL,
    "descricao" "text" DEFAULT ''::"text" NOT NULL,
    "tipo" "text" DEFAULT 'outro'::"text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "leads_cartas_negociacao_tipo_check" CHECK (("tipo" = ANY (ARRAY['desconto'::"text", 'parcelamento'::"text", 'bonus'::"text", 'outro'::"text"])))
);


ALTER TABLE "public"."leads_cartas_negociacao" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads_diretos_config" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "meta_matriculas_mes" integer DEFAULT 40 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."leads_diretos_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads_historico_fase" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "fase_anterior" "text",
    "fase_nova" "text" NOT NULL,
    "vendedor" "text",
    "origem_mudanca" "text" DEFAULT 'atualizacao'::"text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atendeu" boolean,
    "resumo" "text"
);


ALTER TABLE "public"."leads_historico_fase" OWNER TO "postgres";


COMMENT ON TABLE "public"."leads_historico_fase" IS 'Trajetória de fase de cada lead do Time Comercial (SDD) — uma linha por troca de status. Preenchida automaticamente pelo trigger trg_leads_historico_fase. Ver TimeComercial.tsx.';



CREATE TABLE IF NOT EXISTS "public"."leads_ia_config" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."leads_ia_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads_ia_conhecimento" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pergunta_exemplo" "text" NOT NULL,
    "resposta" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "origem_sugestao_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."leads_ia_conhecimento" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads_ia_conhecimento_sugestoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversa_id" "uuid",
    "lead_id" "uuid",
    "pergunta" "text" NOT NULL,
    "resposta_humano" "text" NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "revisado_por" "uuid",
    "revisado_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "leads_ia_conhecimento_sugestoes_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'rejeitado'::"text"])))
);


ALTER TABLE "public"."leads_ia_conhecimento_sugestoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads_ia_conversas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "lead_nome" "text" DEFAULT ''::"text" NOT NULL,
    "telefone" "text" NOT NULL,
    "evolution_instance" "text" NOT NULL,
    "status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "engajamento" "text",
    "objetivo_principal" "text",
    "tempo_interesse" "text",
    "resumo_ia" "text",
    "motivo_handoff" "text",
    "duvida_nao_respondida" "text",
    "sugestao_capturada" boolean DEFAULT false NOT NULL,
    "turnos_ia" integer DEFAULT 0 NOT NULL,
    "ultima_mensagem_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "midias_enviadas" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "followup_proximo_em" timestamp with time zone,
    "followups_enviados" integer DEFAULT 0 NOT NULL,
    "handoff_em" timestamp with time zone,
    "humano_assumiu_em" timestamp with time zone,
    "lembrete_time_enviado_em" timestamp with time zone,
    CONSTRAINT "leads_ia_conversas_motivo_handoff_check" CHECK ((("motivo_handoff" IS NULL) OR ("motivo_handoff" = ANY (ARRAY['lead_qualificado'::"text", 'pedido_direto_avancar'::"text", 'duvida_sem_resposta'::"text", 'fora_de_escopo'::"text", 'reclamacao'::"text", 'baixa_confianca'::"text", 'erro_ia'::"text", 'limite_turnos'::"text"])))),
    CONSTRAINT "leads_ia_conversas_status_check" CHECK (("status" = ANY (ARRAY['ativo'::"text", 'aguardando_humano'::"text", 'encerrado'::"text"])))
);


ALTER TABLE "public"."leads_ia_conversas" OWNER TO "postgres";


COMMENT ON COLUMN "public"."leads_ia_conversas"."followup_proximo_em" IS 'Quando a próxima cutucada automática deve disparar (null = nenhuma agendada). Setado pelo leads-ia-responder a cada turno e pelo leads-ia-followup a cada tentativa.';



COMMENT ON COLUMN "public"."leads_ia_conversas"."followups_enviados" IS 'Quantas cutucadas de silêncio já foram mandadas na leva atual (reseta pra 0 sempre que o lead responde de novo). Máximo 3.';



COMMENT ON COLUMN "public"."leads_ia_conversas"."handoff_em" IS 'Quando a conversa entrou em aguardando_humano pela última vez -- usado pra medir demora do time e disparar lembrete.';



COMMENT ON COLUMN "public"."leads_ia_conversas"."humano_assumiu_em" IS 'Quando um humano respondeu manualmente pela primeira vez depois do handoff -- setado pelo evo-resposta (fromMe=true). Presença disso cancela o lembrete de demora.';



COMMENT ON COLUMN "public"."leads_ia_conversas"."lembrete_time_enviado_em" IS 'Quando o lembrete de "handoff parado" foi mandado pro time -- só manda uma vez por handoff, não fica repetindo.';



CREATE TABLE IF NOT EXISTS "public"."leads_ia_debounce" (
    "telefone" "text" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "evolution_instance" "text" NOT NULL,
    "mensagens" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "marcador" "text" NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "em_processamento" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."leads_ia_debounce" OWNER TO "postgres";


COMMENT ON TABLE "public"."leads_ia_debounce" IS 'Fila de debounce do SDR de IA. Somente service_role (edge function evo-resposta). RLS sem policy e proposital.';



CREATE TABLE IF NOT EXISTS "public"."leads_ia_mensagens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversa_id" "uuid" NOT NULL,
    "papel" "text" NOT NULL,
    "conteudo" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "leads_ia_mensagens_papel_check" CHECK (("papel" = ANY (ARRAY['lead'::"text", 'agente'::"text"])))
);


ALTER TABLE "public"."leads_ia_mensagens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads_ia_oferta_ativa" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "preco_avista" numeric(10,2) NOT NULL,
    "cartao_parcelas" integer NOT NULL,
    "cartao_valor_parcela" numeric(10,2) NOT NULL,
    "boleto_entrada" numeric(10,2) NOT NULL,
    "boleto_parcelas" integer NOT NULL,
    "boleto_valor_parcela" numeric(10,2) NOT NULL,
    "valor_total_bonus" numeric(10,2),
    "bonus" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "observacoes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."leads_ia_oferta_ativa" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads_produtos_valores" (
    "slug" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "valor_ticket" numeric,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "materiais" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "datas_importantes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "leads_produtos_valores_slug_check" CHECK (("slug" = ANY (ARRAY['psicanalise'::"text", 'pnl'::"text", 'numerologia'::"text", 'outro'::"text"])))
);


ALTER TABLE "public"."leads_produtos_valores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads_quadro_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quadro_id" "uuid" NOT NULL,
    "origem_tabela" "text" NOT NULL,
    "origem_id" "uuid" NOT NULL,
    "coluna_id" "uuid",
    "observacoes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."leads_quadro_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads_quadros" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "filtro" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."leads_quadros" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."npa_evento_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "npa_evento_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "email" "text",
    "whatsapp" "text",
    "data_entrada" timestamp with time zone DEFAULT "now"(),
    "fase" "text" DEFAULT 'novo'::"text" NOT NULL,
    "ingresso_pago" boolean DEFAULT false,
    "presente_evento" boolean DEFAULT false,
    "closer" boolean DEFAULT false,
    "follow_up_01" boolean DEFAULT false,
    "follow_up_02" boolean DEFAULT false,
    "follow_up_03" boolean DEFAULT false,
    "matriculado" boolean DEFAULT false,
    "valor_ingresso" numeric DEFAULT 10.00,
    "valor_matricula" numeric DEFAULT 397.00,
    "erro" "text",
    "responsavel_id" "uuid",
    "observacoes" "text",
    "ultima_atividade" timestamp with time zone DEFAULT "now"(),
    "sheets_row_index" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "turma" "text" DEFAULT 'unica'::"text",
    "esteve_no_evento" boolean DEFAULT false,
    "no_grupo" boolean DEFAULT false,
    "comprou_material" boolean DEFAULT false,
    "valor_material" numeric DEFAULT 97.00,
    "pix_enviado" boolean DEFAULT false,
    "pix_codigo" "text",
    "pix_enviado_em" timestamp with time zone,
    "bv_enviado" boolean DEFAULT false,
    "bv_enviado_em" timestamp with time zone,
    "material_entregue_em" timestamp with time zone,
    "ingressos_comprados" integer DEFAULT 1 NOT NULL,
    "aguardando_dados_convidado" boolean DEFAULT false NOT NULL,
    "convidado_nome" "text",
    "convidado_whatsapp" "text",
    "pessoa_id" "uuid",
    CONSTRAINT "npa_evento_leads_fase_check" CHECK (("fase" = ANY (ARRAY['novo'::"text", 'ingresso_pago'::"text", 'no_grupo'::"text", 'confirmado'::"text", 'evento'::"text", 'closer'::"text", 'follow_up_01'::"text", 'follow_up_02'::"text", 'follow_up_03'::"text", 'matricula'::"text"]))),
    CONSTRAINT "npa_evento_leads_turma_check" CHECK (("turma" = ANY (ARRAY['manha'::"text", 'tarde'::"text", 'unica'::"text"]))),
    CONSTRAINT "npa_leads_fase_check" CHECK (("fase" = ANY (ARRAY['novo'::"text", 'ingresso_pago'::"text", 'no_grupo'::"text", 'confirmado'::"text", 'evento'::"text", 'closer'::"text", 'follow_up_01'::"text", 'follow_up_02'::"text", 'follow_up_03'::"text", 'matricula'::"text"])))
);


ALTER TABLE "public"."npa_evento_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."npa_eventos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "data_evento" "date",
    "status" "text" DEFAULT 'planejamento'::"text",
    "sheets_id" "text",
    "descricao" "text",
    "meta_matriculas" integer DEFAULT 0,
    "local" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "ativo" boolean DEFAULT false,
    "valor_ingresso" numeric DEFAULT 10.00,
    "meta_faturamento" numeric DEFAULT 0,
    "meta_presentes" integer DEFAULT 0,
    "meta_ingressos" integer DEFAULT 0,
    "valor_material_padrao" numeric DEFAULT 97,
    "turma_destino_id" "uuid",
    "responsavel_id" "uuid",
    "vega_produto_id" "text",
    "pix_mensagem_template" "text",
    "vega_produto_tarde" "text",
    "slogan" "text" DEFAULT 'Excelente'::"text",
    "professor_convidado" "text",
    "slug" "text",
    "ebook_url" "text",
    "telas_url" "text",
    "telas_liberado" boolean DEFAULT false NOT NULL,
    "telas_liberado_em" timestamp with time zone,
    CONSTRAINT "npa_eventos_status_check" CHECK (("status" = ANY (ARRAY['em_andamento'::"text", 'finalizado'::"text", 'planejamento'::"text"])))
);


ALTER TABLE "public"."npa_eventos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."npa_eventos"."vega_produto_id" IS 'Nome exato do produto Vega para a turma Manhã (usado para matching do webhook)';



COMMENT ON COLUMN "public"."npa_eventos"."vega_produto_tarde" IS 'Nome exato do produto Vega para a turma Tarde (usado para matching do webhook)';



CREATE TABLE IF NOT EXISTS "public"."seu_numerologo_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "produto" "text" DEFAULT 'Mapa Numerológico Pitagórico Aplicado - SN'::"text" NOT NULL,
    "nome" "text" NOT NULL,
    "email" "text" NOT NULL,
    "data_nascimento" "text" NOT NULL,
    "alma" integer,
    "imagem" integer,
    "expressao" integer,
    "talento" integer,
    "psiquico" integer,
    "destino" integer,
    "ano_pessoal" integer,
    "status" "text" DEFAULT 'lead'::"text" NOT NULL,
    "mapa_enviado" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "comprou_at" timestamp with time zone,
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "pago_at" timestamp with time zone,
    "whatsapp" "text",
    "link_mapa" "text",
    "utm_term" "text",
    "utm_content" "text",
    "utm_landing_page" "text",
    "fbc" "text",
    "fbp" "text",
    "calculou_at" timestamp with time zone,
    "referrer" "text",
    "pdf_path" "text",
    "language" "text" DEFAULT 'pt'::"text" NOT NULL,
    "pessoa_id" "uuid",
    CONSTRAINT "seu_numerologo_leads_language_check" CHECK (("language" = ANY (ARRAY['pt'::"text", 'en'::"text", 'es'::"text"])))
);


ALTER TABLE "public"."seu_numerologo_leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."seu_numerologo_leads" IS 'Leads do funil Seu Numerologo. Acesso: usuario logado (escopo por dono entra na sprint 1.3).';



CREATE OR REPLACE VIEW "public"."leads_unificados" WITH ("security_invoker"='true') AS
 WITH "base" AS (
         SELECT 'lancamento_leads'::"text" AS "origem_tabela",
            "ll"."id" AS "origem_id",
            ('Lançamento: '::"text" || COALESCE("l"."nome", '(sem lançamento)'::"text")) AS "origem",
            "ll"."nome",
            "ll"."whatsapp" AS "telefone",
            "ll"."email",
            COALESCE("kc"."nome", '(sem fase)'::"text") AS "fase",
                CASE
                    WHEN (("kc"."nome" ~~* '%matríc%'::"text") OR ("kc"."nome" ~~* '%matric%'::"text")) THEN 'quente'::"text"
                    WHEN (("kc"."nome" ~~* '%oferta%'::"text") OR ("kc"."nome" ~~* '%negocia%'::"text")) THEN 'morno'::"text"
                    ELSE 'frio'::"text"
                END AS "temperatura",
            COALESCE("ll"."bv_enviado", false) AS "bv_enviado",
            COALESCE("l"."produto_destino", 'Semana do Despertar'::"text") AS "produto",
            "ll"."created_at" AS "criado_em"
           FROM (("public"."lancamento_leads" "ll"
             LEFT JOIN "public"."lancamentos" "l" ON (("l"."id" = "ll"."lancamento_id")))
             LEFT JOIN "public"."kanban_colunas" "kc" ON (("kc"."id" = (NULLIF("ll"."fase", ''::"text"))::"uuid")))
        UNION ALL
         SELECT 'npa_evento_leads'::"text",
            "nel"."id",
            ('Evento NPA: '::"text" || COALESCE("ne"."nome", '(sem evento)'::"text")),
            "nel"."nome",
            "nel"."whatsapp",
            "nel"."email",
            COALESCE("nel"."fase", '(sem fase)'::"text") AS "coalesce",
                CASE
                    WHEN ("nel"."fase" = 'matricula'::"text") THEN 'quente'::"text"
                    WHEN ("nel"."fase" = ANY (ARRAY['ingresso_pago'::"text", 'confirmado'::"text", 'evento'::"text"])) THEN 'morno'::"text"
                    ELSE 'frio'::"text"
                END AS "case",
            COALESCE("nel"."bv_enviado", false) AS "coalesce",
            'IDM Pelo Brasil'::"text",
            "nel"."created_at"
           FROM ("public"."npa_evento_leads" "nel"
             LEFT JOIN "public"."npa_eventos" "ne" ON (("ne"."id" = "nel"."npa_evento_id")))
        UNION ALL
         SELECT 'alunos'::"text",
            "a"."id",
            ('Aluno: '::"text" || COALESCE("t"."nome", '(sem turma)'::"text")),
            "a"."nome",
            "a"."whatsapp",
            "a"."email",
            "a"."status",
            'quente'::"text",
            (EXISTS ( SELECT 1
                   FROM "public"."boas_vindas_logs" "bvl"
                  WHERE (("bvl"."whatsapp" = "a"."whatsapp") AND ("bvl"."wpp_status" = 'sent'::"text")))) AS "exists",
            COALESCE("a"."produto", '(sem produto)'::"text") AS "coalesce",
            "a"."created_at"
           FROM ("public"."alunos" "a"
             LEFT JOIN "public"."turmas" "t" ON (("t"."id" = "a"."turma_id")))
        UNION ALL
         SELECT 'seu_numerologo_leads'::"text",
            "snl"."id",
            'Numerólogo'::"text",
            "snl"."nome",
            "snl"."whatsapp",
            "snl"."email",
                CASE
                    WHEN ("snl"."pago_at" IS NOT NULL) THEN 'comprou'::"text"
                    WHEN ("snl"."comprou_at" IS NOT NULL) THEN 'comprando'::"text"
                    WHEN ("snl"."calculou_at" IS NOT NULL) THEN 'calculou'::"text"
                    ELSE 'novo'::"text"
                END AS "case",
                CASE
                    WHEN ("snl"."pago_at" IS NOT NULL) THEN 'quente'::"text"
                    WHEN (("snl"."comprou_at" IS NOT NULL) OR ("snl"."calculou_at" IS NOT NULL)) THEN 'morno'::"text"
                    ELSE 'frio'::"text"
                END AS "case",
            (EXISTS ( SELECT 1
                   FROM "public"."boas_vindas_logs" "bvl"
                  WHERE (("bvl"."whatsapp" = "snl"."whatsapp") AND ("bvl"."wpp_status" = 'sent'::"text")))) AS "exists",
            COALESCE("snl"."produto", 'Seu Numerólogo'::"text") AS "coalesce",
            "snl"."created_at"
           FROM "public"."seu_numerologo_leads" "snl"
        ), "com_ddd" AS (
         SELECT "b"."origem_tabela",
            "b"."origem_id",
            "b"."origem",
            "b"."nome",
            "b"."telefone",
            "b"."email",
            "b"."fase",
            "b"."temperatura",
            "b"."bv_enviado",
            "b"."produto",
            "b"."criado_em",
                CASE
                    WHEN ("regexp_replace"(COALESCE("b"."telefone", ''::"text"), '\D'::"text", ''::"text", 'g'::"text") ~ '^55\d{10,11}$'::"text") THEN (SUBSTRING("regexp_replace"("b"."telefone", '\D'::"text", ''::"text", 'g'::"text") FROM 3 FOR 2))::integer
                    WHEN ("length"("regexp_replace"(COALESCE("b"."telefone", ''::"text"), '\D'::"text", ''::"text", 'g'::"text")) = ANY (ARRAY[10, 11])) THEN (SUBSTRING("regexp_replace"("b"."telefone", '\D'::"text", ''::"text", 'g'::"text") FROM 1 FOR 2))::integer
                    ELSE NULL::integer
                END AS "ddd_raw"
           FROM "base" "b"
        )
 SELECT "cd"."origem_tabela",
    "cd"."origem_id",
    "cd"."origem",
    "cd"."nome",
    "cd"."telefone",
    "cd"."email",
    "cd"."fase",
    "cd"."temperatura",
    "cd"."bv_enviado",
    "cd"."produto",
    "cd"."criado_em",
    "r"."ddd",
    "r"."cidade",
    "r"."estado"
   FROM ("com_ddd" "cd"
     LEFT JOIN "public"."ddd_regioes" "r" ON (("r"."ddd" = "cd"."ddd_raw")));


ALTER VIEW "public"."leads_unificados" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lista_espera_cidades" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "whatsapp" "text" NOT NULL,
    "email" "text",
    "cidade" "text" NOT NULL,
    "origem" "text" DEFAULT 'hub-turmas'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lista_espera_cidades" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."midia_imagens_reaproveitaveis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid",
    "image_url" "text" NOT NULL,
    "image_prompt" "text",
    "arquetipo_visual" "text",
    "origem" "text" NOT NULL,
    "vezes_reaproveitado" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "midia_imagens_reaproveitaveis_origem_check" CHECK (("origem" = ANY (ARRAY['video_reels'::"text", 'post_fotografico'::"text"])))
);


ALTER TABLE "public"."midia_imagens_reaproveitaveis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mind_map_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "origem_id" "uuid",
    "destino_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "cor" "text" DEFAULT '#A93356'::"text",
    "label" "text" DEFAULT ''::"text",
    "no_origem_id" "uuid",
    "no_destino_id" "uuid",
    "tipo" "text" DEFAULT 'default'::"text",
    "animado" boolean DEFAULT false,
    "tipo_linha" "text" DEFAULT 'default'::"text",
    "espessura" integer DEFAULT 2,
    "marcador_inicio" "text" DEFAULT 'none'::"text",
    "marcador_fim" "text" DEFAULT 'arrow'::"text",
    "user_id" "uuid",
    "estilo" "text" DEFAULT 'solida'::"text",
    "workspace" "text" DEFAULT 'empresa'::"text"
);


ALTER TABLE "public"."mind_map_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mind_map_nodes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text",
    "type" "text",
    "position_x" double precision DEFAULT 0,
    "position_y" double precision DEFAULT 0,
    "color" "text",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "cor" "text" DEFAULT '#A93356'::"text",
    "tipo" "text" DEFAULT 'Empresa/Produto'::"text",
    "titulo" "text" DEFAULT ''::"text",
    "posicao_x" double precision DEFAULT 0,
    "posicao_y" double precision DEFAULT 0,
    "pai_id" "uuid",
    "x" double precision DEFAULT 0,
    "y" double precision DEFAULT 0,
    "width" double precision DEFAULT 200,
    "height" double precision DEFAULT 100,
    "sublabel" "text",
    "emoji" "text",
    "cor_texto" "text" DEFAULT '#ffffff'::"text",
    "cor_borda" "text" DEFAULT 'rgba(0,0,0,0.25)'::"text",
    "espessura_borda" integer DEFAULT 2,
    "tamanho" "text" DEFAULT 'medio'::"text",
    "formato" "text" DEFAULT 'redondo'::"text",
    "font_size" integer DEFAULT 13,
    "font_weight" "text" DEFAULT '700'::"text",
    "font_style" "text" DEFAULT 'normal'::"text",
    "largura" double precision DEFAULT 150,
    "altura" double precision DEFAULT 70,
    "workspace" "text" DEFAULT 'empresa'::"text",
    "descricao" "text",
    "notas" "text",
    "fase" "text" DEFAULT 'nenhuma'::"text",
    "responsavel_id" "uuid",
    "responsavel_nome" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "meta_alvo" double precision,
    "meta_atual" double precision,
    "meta_unidade" "text" DEFAULT ''::"text"
);


ALTER TABLE "public"."mind_map_nodes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mind_map_pages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "nome" "text" NOT NULL,
    "emoji" "text" DEFAULT '🧠'::"text",
    "cor" "text" DEFAULT '#AC1131'::"text",
    "descricao" "text",
    "tipo" "text" DEFAULT 'mapa'::"text",
    "ordem" integer DEFAULT 0,
    "criado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "mind_map_pages_tipo_check" CHECK (("tipo" = ANY (ARRAY['mapa'::"text", 'funil'::"text", 'metas'::"text", 'livre'::"text"])))
);


ALTER TABLE "public"."mind_map_pages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "descricao" "text",
    "link" "text",
    "lida" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."npa_eventos_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "npa_evento_id" "uuid",
    "evento" "text" NOT NULL,
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."npa_eventos_log" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."npa_kanban" WITH ("security_invoker"='true') AS
 SELECT "ne"."id" AS "npa_evento_id",
    "ne"."nome" AS "evento_nome",
    "ne"."status" AS "evento_status",
    "nl"."fase",
    "count"(*) AS "total",
    "sum"(
        CASE
            WHEN "nl"."ingresso_pago" THEN "nl"."valor_ingresso"
            ELSE (0)::numeric
        END) AS "receita_ingressos",
    "sum"(
        CASE
            WHEN "nl"."matriculado" THEN "nl"."valor_matricula"
            ELSE (0)::numeric
        END) AS "receita_matriculas"
   FROM ("public"."npa_eventos" "ne"
     LEFT JOIN "public"."npa_evento_leads" "nl" ON (("nl"."npa_evento_id" = "ne"."id")))
  GROUP BY "ne"."id", "ne"."nome", "ne"."status", "nl"."fase";


ALTER VIEW "public"."npa_kanban" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parceiros" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" character varying(255) NOT NULL,
    "whatsapp" character varying(20),
    "email" character varying(255),
    "status_contrato" character varying(20) DEFAULT 'pendente'::character varying,
    "pix_chave" "text",
    "observacoes" "text",
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "mp_user_id" bigint,
    "mp_access_token" "text",
    "mp_refresh_token" "text",
    "mp_public_key" "text",
    "mp_connected_at" timestamp with time zone,
    CONSTRAINT "parceiros_status_contrato_check" CHECK ((("status_contrato")::"text" = ANY ((ARRAY['pendente'::character varying, 'assinado'::character varying])::"text"[])))
);


ALTER TABLE "public"."parceiros" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parceiros_cliques" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "link_id" "uuid" NOT NULL,
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "referrer" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."parceiros_cliques" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parceiros_cupons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "produto_id" "uuid" NOT NULL,
    "parceiro_afiliado_id" "uuid" NOT NULL,
    "codigo" character varying(50) NOT NULL,
    "comissao_pct" numeric(5,2),
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "desconto_pct" numeric
);


ALTER TABLE "public"."parceiros_cupons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parceiros_entregas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parceiro_id" "uuid" NOT NULL,
    "produto_id" "uuid",
    "titulo" character varying(255) NOT NULL,
    "tipo" character varying(10) NOT NULL,
    "destinos" "text"[] DEFAULT '{}'::"text"[],
    "roteiro" "text",
    "status" character varying(20) DEFAULT 'conteudo_novo'::character varying NOT NULL,
    "criado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "parceiros_entregas_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['conteudo_novo'::character varying, 'em_producao'::character varying, 'em_revisao'::character varying, 'publicado'::character varying])::"text"[]))),
    CONSTRAINT "parceiros_entregas_tipo_check" CHECK ((("tipo")::"text" = ANY ((ARRAY['audio'::character varying, 'video'::character varying])::"text"[])))
);


ALTER TABLE "public"."parceiros_entregas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parceiros_entregas_arquivos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entrega_id" "uuid" NOT NULL,
    "nome" character varying(255),
    "url" "text" NOT NULL,
    "enviado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."parceiros_entregas_arquivos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parceiros_entregas_comentarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entrega_id" "uuid" NOT NULL,
    "autor_id" "uuid",
    "mensagem" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."parceiros_entregas_comentarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parceiros_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parceiro_id" "uuid" NOT NULL,
    "produto_id" "uuid",
    "slug" character varying(80) NOT NULL,
    "titulo" character varying(255),
    "destino_url" "text" NOT NULL,
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "parceira_nome" "text",
    "produto_nome" "text"
);


ALTER TABLE "public"."parceiros_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parceiros_metas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parceiro_id" "uuid" NOT NULL,
    "produto_id" "uuid",
    "tipo" character varying(20) NOT NULL,
    "valor_meta" numeric(12,2) NOT NULL,
    "periodo_mes" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "parceiros_metas_tipo_check" CHECK ((("tipo")::"text" = ANY ((ARRAY['vendas'::character varying, 'videos_instagram'::character varying, 'videos_youtube'::character varying])::"text"[])))
);


ALTER TABLE "public"."parceiros_metas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parceiros_produtos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parceiro_id" "uuid" NOT NULL,
    "nome" character varying(255) NOT NULL,
    "descricao" "text",
    "preco" numeric(10,2),
    "status" character varying(20) DEFAULT 'em_analise'::character varying,
    "comissao_idm_pct" numeric(5,2),
    "comissao_parceiro_pct" numeric(5,2),
    "comissao_afiliado_padrao_pct" numeric(5,2),
    "material_url" "text",
    "aprovado_por" "uuid",
    "aprovado_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "meta_campaign_id" character varying(50),
    "meta_ad_account_id" character varying(50),
    "meta_access_token" "text",
    "bump_ativo" boolean DEFAULT false NOT NULL,
    "bump_nome" character varying,
    "bump_descricao" "text",
    "bump_preco" numeric,
    "integra_seu_numerologo" boolean DEFAULT false NOT NULL,
    "checkout_link_syncpay" "text",
    "syncpay_product_token" "text",
    "syncpay_checkout_url" "text",
    "pagina_vendas_url" "text",
    "syncpay_taxa_fixa" numeric DEFAULT 0,
    CONSTRAINT "parceiros_produtos_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['em_analise'::character varying, 'aprovado'::character varying, 'ativo'::character varying, 'pausado'::character varying, 'reprovado'::character varying])::"text"[])))
);


ALTER TABLE "public"."parceiros_produtos" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."parceiros_produtos_checkout" AS
 SELECT "pp"."id",
    "pp"."nome",
    "pp"."descricao",
    "pp"."preco",
    "pp"."parceiro_id",
    "p"."mp_public_key",
    "pp"."bump_ativo",
    "pp"."bump_nome",
    "pp"."bump_descricao",
    "pp"."bump_preco"
   FROM ("public"."parceiros_produtos" "pp"
     JOIN "public"."parceiros" "p" ON (("p"."id" = "pp"."parceiro_id")))
  WHERE (("pp"."status")::"text" = 'ativo'::"text");


ALTER VIEW "public"."parceiros_produtos_checkout" OWNER TO "postgres";


COMMENT ON VIEW "public"."parceiros_produtos_checkout" IS 'SECURITY DEFINER de proposito: lida pela pagina publica /comprar/:produtoId com a chave anonima.';



CREATE TABLE IF NOT EXISTS "public"."parceiros_vendas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "produto_id" "uuid" NOT NULL,
    "cupom_id" "uuid",
    "comprador_nome" character varying(255),
    "comprador_email" character varying(255),
    "comprador_whatsapp" character varying(20),
    "valor_bruto" numeric(10,2) NOT NULL,
    "valor_liquido" numeric(10,2),
    "comissao_idm" numeric(10,2),
    "comissao_afiliado" numeric(10,2),
    "mp_payment_id" character varying(50),
    "status" character varying(20) DEFAULT 'pendente'::character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "comissao_afiliado_paga" boolean DEFAULT false,
    "comissao_afiliado_paga_em" timestamp with time zone,
    "bump_incluido" boolean DEFAULT false NOT NULL,
    "acesso_liberado" boolean DEFAULT false NOT NULL,
    "acesso_liberado_em" timestamp with time zone,
    "syncpay_transaction_id" "text",
    "origem" character varying(20) DEFAULT 'checkout_idm'::character varying NOT NULL,
    "raw_payload" "jsonb",
    CONSTRAINT "parceiros_vendas_origem_check" CHECK ((("origem")::"text" = ANY ((ARRAY['checkout_idm'::character varying, 'syncpay'::character varying])::"text"[]))),
    CONSTRAINT "parceiros_vendas_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pendente'::character varying, 'aprovado'::character varying, 'recusado'::character varying, 'estornado'::character varying])::"text"[])))
);


ALTER TABLE "public"."parceiros_vendas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parceiros_video_metricas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parceiro_id" "uuid" NOT NULL,
    "produto_id" "uuid",
    "plataforma" character varying(20) NOT NULL,
    "views" bigint DEFAULT 0,
    "data_post" "date" DEFAULT CURRENT_DATE NOT NULL,
    "url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "parceiros_video_metricas_plataforma_check" CHECK ((("plataforma")::"text" = ANY ((ARRAY['instagram'::character varying, 'youtube'::character varying])::"text"[])))
);


ALTER TABLE "public"."parceiros_video_metricas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_method_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "produto_slug" "text" NOT NULL,
    "forma_pagamento" "text" NOT NULL,
    "gateway" "text" DEFAULT 'asaas'::"text" NOT NULL,
    "percentual" numeric(6,4) DEFAULT 0 NOT NULL,
    "fixo_por_transacao" numeric(8,2) DEFAULT 0 NOT NULL,
    "faixa_min" numeric(10,2) DEFAULT 0 NOT NULL,
    "faixa_max" numeric(10,2) DEFAULT 999999.99 NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "observacao" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payment_method_rates" OWNER TO "postgres";


COMMENT ON COLUMN "public"."payment_method_rates"."gateway" IS 'Canal de cobrança (public.canais_cobranca.nome) ao qual esta taxa se aplica, ou ''*'' para qualquer canal. Regra mais específica (produto+forma+canal) prevalece sobre curingas.';



CREATE TABLE IF NOT EXISTS "public"."pessoa_identificadores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pessoa_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "valor" "text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pessoa_identificadores_tipo_check" CHECK (("tipo" = ANY (ARRAY['telefone'::"text", 'email'::"text", 'cpf'::"text"])))
);


ALTER TABLE "public"."pessoa_identificadores" OWNER TO "postgres";


COMMENT ON TABLE "public"."pessoa_identificadores" IS 'Telefone/email/cpf -> pessoa. Visivel apenas para quem enxerga a pessoa dona da chave (o EXISTS herda a RLS de `pessoas`).';



CREATE TABLE IF NOT EXISTS "public"."pessoas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text",
    "telefone" "text",
    "email" "text",
    "cpf" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mesclada_em" "uuid"
);


ALTER TABLE "public"."pessoas" OWNER TO "postgres";


COMMENT ON TABLE "public"."pessoas" IS 'Um ser humano, uma linha. Leitura escopada: sem `alunos/ver_todos`, pipeline ou time_comercial, so as pessoas das turmas em allowed_financeiro_turma_ids.';



CREATE TABLE IF NOT EXISTS "public"."whatsapp_mensagens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "telefone" "text" NOT NULL,
    "direcao" "text" NOT NULL,
    "conteudo" "text" NOT NULL,
    "tipo" "text" DEFAULT 'text'::"text" NOT NULL,
    "origem" "text" NOT NULL,
    "evolution_instance" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "evolution_message_id" "text",
    CONSTRAINT "whatsapp_mensagens_direcao_check" CHECK (("direcao" = ANY (ARRAY['recebida'::"text", 'enviada'::"text"]))),
    CONSTRAINT "whatsapp_mensagens_origem_check" CHECK (("origem" = ANY (ARRAY['inbound'::"text", 'disparo'::"text", 'boas_vindas'::"text", 'cobranca'::"text", 'funil'::"text", 'manual'::"text", 'leads_ia'::"text"])))
);


ALTER TABLE "public"."whatsapp_mensagens" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."pessoa_timeline" WITH ("security_invoker"='true') AS
 SELECT "l"."pessoa_id",
    "l"."criado_em" AS "quando",
    'lead_criado'::"text" AS "tipo",
    COALESCE(('Entrou como lead'::"text" || COALESCE((' — '::"text" || "l"."origem"), ''::"text")), 'Entrou como lead'::"text") AS "titulo",
    "l"."vendedor" AS "detalhe",
    'leads'::"text" AS "origem_tabela",
    ("l"."id")::"text" AS "origem_id"
   FROM "public"."leads" "l"
  WHERE ("l"."pessoa_id" IS NOT NULL)
UNION ALL
 SELECT "l"."pessoa_id",
    "h"."criado_em" AS "quando",
    'fase_mudou'::"text" AS "tipo",
    ((('Fase: '::"text" || COALESCE("h"."fase_anterior", '—'::"text")) || ' -> '::"text") || "h"."fase_nova") AS "titulo",
    COALESCE("h"."vendedor", "h"."origem_mudanca") AS "detalhe",
    'leads_historico_fase'::"text" AS "origem_tabela",
    ("h"."id")::"text" AS "origem_id"
   FROM ("public"."leads_historico_fase" "h"
     JOIN "public"."leads" "l" ON (("l"."id" = "h"."lead_id")))
  WHERE ("l"."pessoa_id" IS NOT NULL)
UNION ALL
 SELECT "a"."pessoa_id",
    COALESCE(("a"."data_matricula")::timestamp with time zone, "a"."created_at") AS "quando",
    'matricula'::"text" AS "tipo",
    ('Matriculado'::"text" || COALESCE((' em '::"text" || "t"."nome"), ''::"text")) AS "titulo",
    "a"."produto" AS "detalhe",
    'alunos'::"text" AS "origem_tabela",
    ("a"."id")::"text" AS "origem_id"
   FROM ("public"."alunos" "a"
     LEFT JOIN "public"."turmas" "t" ON (("t"."id" = "a"."turma_id")))
  WHERE ("a"."pessoa_id" IS NOT NULL)
UNION ALL
 SELECT "a"."pessoa_id",
    COALESCE(("p"."data_pagamento")::timestamp with time zone, "p"."created_at") AS "quando",
    'pagamento'::"text" AS "tipo",
    ('Pagamento de R$ '::"text" || "to_char"("p"."valor", 'FM999G999D00'::"text")) AS "titulo",
    "p"."status" AS "detalhe",
    'pagamentos'::"text" AS "origem_tabela",
    ("p"."id")::"text" AS "origem_id"
   FROM ("public"."pagamentos" "p"
     JOIN "public"."alunos" "a" ON (("a"."id" = "p"."aluno_id")))
  WHERE (("a"."pessoa_id" IS NOT NULL) AND ("p"."status" = ANY (ARRAY['pago'::"text", 'confirmado'::"text"])))
UNION ALL
 SELECT "pe"."id" AS "pessoa_id",
    "w"."created_at" AS "quando",
    'mensagem'::"text" AS "tipo",
        CASE
            WHEN ("w"."direcao" = 'enviada'::"text") THEN 'Mensagem enviada'::"text"
            ELSE 'Mensagem recebida'::"text"
        END AS "titulo",
    "left"("w"."conteudo", 140) AS "detalhe",
    'whatsapp_mensagens'::"text" AS "origem_tabela",
    ("w"."id")::"text" AS "origem_id"
   FROM ("public"."whatsapp_mensagens" "w"
     JOIN "public"."pessoas" "pe" ON (("pe"."telefone" = "public"."normalizar_telefone"("w"."telefone"))))
UNION ALL
 SELECT "n"."pessoa_id",
    "n"."created_at" AS "quando",
    'evento_npa'::"text" AS "tipo",
    ('Inscrito no evento'::"text" || COALESCE((' '::"text" || "e"."nome"), ''::"text")) AS "titulo",
    "n"."fase" AS "detalhe",
    'npa_evento_leads'::"text" AS "origem_tabela",
    ("n"."id")::"text" AS "origem_id"
   FROM ("public"."npa_evento_leads" "n"
     LEFT JOIN "public"."npa_eventos" "e" ON (("e"."id" = "n"."npa_evento_id")))
  WHERE ("n"."pessoa_id" IS NOT NULL);


ALTER VIEW "public"."pessoa_timeline" OWNER TO "postgres";


COMMENT ON VIEW "public"."pessoa_timeline" IS 'Jornada completa de cada pessoa. security_invoker: respeita a RLS de quem consulta.';



CREATE TABLE IF NOT EXISTS "public"."pessoa_vinculos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pessoa_id" "uuid" NOT NULL,
    "papel" "text" NOT NULL,
    "origem_tabela" "text" NOT NULL,
    "origem_id" "text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pessoa_vinculos_papel_check" CHECK (("papel" = ANY (ARRAY['lead'::"text", 'aluno'::"text", 'parceiro'::"text", 'convidado'::"text", 'investidor'::"text", 'colaborador'::"text"])))
);


ALTER TABLE "public"."pessoa_vinculos" OWNER TO "postgres";


COMMENT ON TABLE "public"."pessoa_vinculos" IS 'Uma linha por registro de origem. Visivel apenas para quem enxerga a pessoa (o EXISTS herda a RLS de `pessoas`).';



CREATE TABLE IF NOT EXISTS "public"."produtos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "cor" "text" DEFAULT '#6366f1'::"text" NOT NULL,
    "descricao" "text",
    "ativo" boolean DEFAULT true NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."produtos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "email" "text" NOT NULL,
    "cor" "text" DEFAULT '#A93356'::"text" NOT NULL,
    "avatar" "text",
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text" DEFAULT 'viewer'::"text",
    "cargo" "text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'viewer'::"text", 'editor'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."cargo" IS 'Título/cargo exibido do colaborador (ex: Diretor IDM, Investidora) — independente do tipo de acesso (role) que controla permissões.';



CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quick_sends" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_type" "public"."funnel_recipient_type" NOT NULL,
    "recipient_id" "text" NOT NULL,
    "message_text" "text" NOT NULL,
    "status" "public"."quick_send_status" DEFAULT 'sent'::"public"."quick_send_status" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "error_message" "text"
);


ALTER TABLE "public"."quick_sends" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."responsaveis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "email" "text",
    "ativo" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."responsaveis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissoes" (
    "papel" "public"."app_role" NOT NULL,
    "recurso" "text" NOT NULL,
    "acao" "text" NOT NULL,
    CONSTRAINT "role_permissoes_acao_check" CHECK (("acao" = ANY (ARRAY['ver'::"text", 'editar'::"text", 'excluir'::"text", 'ver_todos'::"text"])))
);


ALTER TABLE "public"."role_permissoes" OWNER TO "postgres";


COMMENT ON TABLE "public"."role_permissoes" IS 'O que cada papel pode por padrao. `parceiro` nao tem nenhuma linha de proposito: parceiro usa o ParceiroPortal, nao o CRM.';



CREATE TABLE IF NOT EXISTS "public"."seu_numerologo_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mensagem_pix_template" "text" DEFAULT 'Olá {{nome}}! 👋

Seu PIX para o Mapa 7 Esperas foi gerado com sucesso.

✔ O pagamento é 100% seguro
✔ Seu mapa é liberado automaticamente após a confirmação

Segue o código PIX logo abaixo:'::"text" NOT NULL,
    "mensagem_compra_template" "text" DEFAULT 'Olá {{nome}}! 🎉

Seu Mapa 7 Esperas foi confirmado com sucesso!

Estou preparando seu mapa numerológico personalizado e enviarei em breve. ✨

Fique de olho nas próximas mensagens!'::"text" NOT NULL,
    "mensagem_envio_mapa" "text" DEFAULT 'Olá {{nome}}! 🌟

Seu Mapa 7 Esperas está pronto!

Seus 7 números:
🔮 Alma: {{alma}}
👁 Imagem: {{imagem}}
✨ Expressão: {{expressao}}
🎯 Talento: {{talento}}
🧠 Psíquico: {{psiquico}}
⭐ Destino: {{destino}}
📅 Ano Pessoal: {{ano_pessoal}}'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seu_numerologo_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sheet_leads_33" (
    "row_id" bigint NOT NULL,
    "Nome" "text",
    "E-mail" "text",
    "Whatsapp" "text",
    "Data" "text",
    "Enviado" "text",
    "Disparo" "text",
    "No Grupo?" "text",
    "CRM" "text",
    "Grupo de Oferta" "text",
    "Follow Up 01" "text",
    "Follow Up 02" "text",
    "Follow Up 03" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "utm_term" "text"
);


ALTER TABLE "public"."sheet_leads_33" OWNER TO "postgres";


COMMENT ON TABLE "public"."sheet_leads_33" IS 'Espelho bruto de planilha, sem consumidor no app. Somente service_role. RLS sem policy e proposital.';



CREATE SEQUENCE IF NOT EXISTS "public"."sheet_leads_33_row_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."sheet_leads_33_row_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."sheet_leads_33_row_id_seq" OWNED BY "public"."sheet_leads_33"."row_id";



CREATE TABLE IF NOT EXISTS "public"."sheet_leads_36" (
    "row_id" bigint NOT NULL,
    "Nome" "text",
    "E-mail" "text",
    "Whatsapp" "text",
    "Data" "text",
    "Enviado" "text",
    "Disparo" "text",
    "No Grupo?" "text",
    "CRM" "text",
    "Grupo de Oferta" "text",
    "Follow Up 01" "text",
    "Follow Up 02" "text",
    "Follow Up 03" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "utm_term" "text"
);


ALTER TABLE "public"."sheet_leads_36" OWNER TO "postgres";


ALTER TABLE "public"."sheet_leads_36" ALTER COLUMN "row_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."sheet_leads_36_row_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."sheet_leads_37" (
    "row_id" bigint NOT NULL,
    "Nome" "text",
    "E-mail" "text",
    "Whatsapp" "text",
    "Data" "text",
    "Enviado" "text",
    "Disparo" "text",
    "No Grupo?" "text",
    "CRM" "text",
    "Grupo de Oferta" "text",
    "Follow Up 01" "text",
    "Follow Up 02" "text",
    "Follow Up 03" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "utm_term" "text"
);


ALTER TABLE "public"."sheet_leads_37" OWNER TO "postgres";


ALTER TABLE "public"."sheet_leads_37" ALTER COLUMN "row_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."sheet_leads_37_row_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."sheet_leads_38" (
    "row_id" bigint NOT NULL,
    "Nome" "text",
    "E-mail" "text",
    "Whatsapp" "text",
    "Data" "text",
    "Enviado" "text",
    "Disparo" "text",
    "No Grupo?" "text",
    "CRM" "text",
    "Grupo de Oferta" "text",
    "Follow Up 01" "text",
    "Follow Up 02" "text",
    "Follow Up 03" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "utm_term" "text",
    "Cidade" "text"
);


ALTER TABLE "public"."sheet_leads_38" OWNER TO "postgres";


ALTER TABLE "public"."sheet_leads_38" ALTER COLUMN "row_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."sheet_leads_38_row_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."sheet_leads_39" (
    "row_id" bigint NOT NULL,
    "Nome" "text",
    "E-mail" "text",
    "Whatsapp" "text",
    "Data" "text",
    "Enviado" "text",
    "Disparo" "text",
    "No Grupo?" "text",
    "CRM" "text",
    "Grupo de Oferta" "text",
    "Follow Up 01" "text",
    "Follow Up 02" "text",
    "Follow Up 03" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "utm_term" "text",
    "Cidade" "text"
);


ALTER TABLE "public"."sheet_leads_39" OWNER TO "postgres";


ALTER TABLE "public"."sheet_leads_39" ALTER COLUMN "row_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."sheet_leads_39_row_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."sheet_leads_40" (
    "row_id" bigint NOT NULL,
    "Nome" "text",
    "E-mail" "text",
    "Whatsapp" "text",
    "Data" "text",
    "Enviado" "text",
    "Disparo" "text",
    "No Grupo?" "text",
    "CRM" "text",
    "Grupo de Oferta" "text",
    "Follow Up 01" "text",
    "Follow Up 02" "text",
    "Follow Up 03" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "utm_term" "text",
    "Cidade" "text"
);


ALTER TABLE "public"."sheet_leads_40" OWNER TO "postgres";


ALTER TABLE "public"."sheet_leads_40" ALTER COLUMN "row_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."sheet_leads_40_row_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."sheet_leads_41" (
    "row_id" bigint NOT NULL,
    "Nome" "text",
    "E-mail" "text",
    "Whatsapp" "text",
    "Data" "text",
    "Enviado" "text",
    "Disparo" "text",
    "No Grupo?" "text",
    "CRM" "text",
    "Grupo de Oferta" "text",
    "Follow Up 01" "text",
    "Follow Up 02" "text",
    "Follow Up 03" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "utm_term" "text",
    "Cidade" "text"
);


ALTER TABLE "public"."sheet_leads_41" OWNER TO "postgres";


ALTER TABLE "public"."sheet_leads_41" ALTER COLUMN "row_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."sheet_leads_41_row_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."sheet_leads_42" (
    "row_id" bigint NOT NULL,
    "Nome" "text",
    "E-mail" "text",
    "Whatsapp" "text",
    "Data" "text",
    "Enviado" "text",
    "Disparo" "text",
    "No Grupo?" "text",
    "CRM" "text",
    "Grupo de Oferta" "text",
    "Follow Up 01" "text",
    "Follow Up 02" "text",
    "Follow Up 03" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "utm_term" "text",
    "Cidade" "text"
);


ALTER TABLE "public"."sheet_leads_42" OWNER TO "postgres";


ALTER TABLE "public"."sheet_leads_42" ALTER COLUMN "row_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."sheet_leads_42_row_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."sheet_leads_43" (
    "row_id" bigint NOT NULL,
    "Nome" "text",
    "E-mail" "text",
    "Whatsapp" "text",
    "Data" "text",
    "Enviado" "text",
    "Disparo" "text",
    "No Grupo?" "text",
    "CRM" "text",
    "Grupo de Oferta" "text",
    "Follow Up 01" "text",
    "Follow Up 02" "text",
    "Follow Up 03" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "utm_term" "text",
    "Cidade" "text"
);


ALTER TABLE "public"."sheet_leads_43" OWNER TO "postgres";


ALTER TABLE "public"."sheet_leads_43" ALTER COLUMN "row_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."sheet_leads_43_row_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."sheet_leads_44" (
    "row_id" bigint NOT NULL,
    "Nome" "text",
    "E-mail" "text",
    "Whatsapp" "text",
    "Data" "text",
    "Enviado" "text",
    "Disparo" "text",
    "No Grupo?" "text",
    "CRM" "text",
    "Grupo de Oferta" "text",
    "Follow Up 01" "text",
    "Follow Up 02" "text",
    "Follow Up 03" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "utm_term" "text",
    "Cidade" "text"
);


ALTER TABLE "public"."sheet_leads_44" OWNER TO "postgres";


ALTER TABLE "public"."sheet_leads_44" ALTER COLUMN "row_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."sheet_leads_44_row_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."sheet_leads_45" (
    "row_id" bigint NOT NULL,
    "Nome" "text",
    "E-mail" "text",
    "Whatsapp" "text",
    "Data" "text",
    "Enviado" "text",
    "Disparo" "text",
    "No Grupo?" "text",
    "CRM" "text",
    "Grupo de Oferta" "text",
    "Follow Up 01" "text",
    "Follow Up 02" "text",
    "Follow Up 03" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "utm_term" "text",
    "Cidade" "text"
);


ALTER TABLE "public"."sheet_leads_45" OWNER TO "postgres";


ALTER TABLE "public"."sheet_leads_45" ALTER COLUMN "row_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."sheet_leads_45_row_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."sheet_leads_46" (
    "row_id" bigint NOT NULL,
    "Nome" "text",
    "E-mail" "text",
    "Whatsapp" "text",
    "Data" "text",
    "Enviado" "text",
    "Disparo" "text",
    "No Grupo?" "text",
    "CRM" "text",
    "Grupo de Oferta" "text",
    "Follow Up 01" "text",
    "Follow Up 02" "text",
    "Follow Up 03" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "utm_term" "text",
    "Cidade" "text"
);


ALTER TABLE "public"."sheet_leads_46" OWNER TO "postgres";


ALTER TABLE "public"."sheet_leads_46" ALTER COLUMN "row_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."sheet_leads_46_row_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."sheet_leads_47" (
    "row_id" bigint NOT NULL,
    "Nome" "text",
    "E-mail" "text",
    "Whatsapp" "text",
    "Data" "text",
    "Enviado" "text",
    "Disparo" "text",
    "No Grupo?" "text",
    "CRM" "text",
    "Grupo de Oferta" "text",
    "Follow Up 01" "text",
    "Follow Up 02" "text",
    "Follow Up 03" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "utm_term" "text",
    "Cidade" "text"
);


ALTER TABLE "public"."sheet_leads_47" OWNER TO "postgres";


ALTER TABLE "public"."sheet_leads_47" ALTER COLUMN "row_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."sheet_leads_47_row_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."subtarefas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tarefa_id" "uuid",
    "titulo" "text" NOT NULL,
    "concluida" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subtarefas" OWNER TO "postgres";


COMMENT ON TABLE "public"."subtarefas" IS 'Tabela vazia e sem consumidor no codigo. Somente service_role ate ser adotada ou removida (sprint 6).';



CREATE TABLE IF NOT EXISTS "public"."sv_app_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sv_app_config" OWNER TO "postgres";


COMMENT ON TABLE "public"."sv_app_config" IS 'Modulo "Seu Vendedor" sem nenhum consumidor no codigo. Trancada em admin ate a limpeza da sprint 6.';



CREATE TABLE IF NOT EXISTS "public"."sv_campanhas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "descricao" "text",
    "evolution_id" "uuid",
    "template_msg1" "text" DEFAULT ''::"text" NOT NULL,
    "template_fu1" "text" DEFAULT ''::"text" NOT NULL,
    "delay_fu1_dias" integer DEFAULT 1 NOT NULL,
    "template_fu2" "text" DEFAULT ''::"text" NOT NULL,
    "delay_fu2_dias" integer DEFAULT 3 NOT NULL,
    "template_fu3" "text" DEFAULT ''::"text" NOT NULL,
    "delay_fu3_dias" integer DEFAULT 7 NOT NULL,
    "safe_hour_start" integer DEFAULT 8 NOT NULL,
    "safe_hour_end" integer DEFAULT 20 NOT NULL,
    "delay_min_s" integer DEFAULT 15 NOT NULL,
    "delay_max_s" integer DEFAULT 45 NOT NULL,
    "status" "text" DEFAULT 'rascunho'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sv_campanhas_status_check" CHECK (("status" = ANY (ARRAY['rascunho'::"text", 'ativo'::"text", 'pausado'::"text", 'concluido'::"text"])))
);


ALTER TABLE "public"."sv_campanhas" OWNER TO "postgres";


COMMENT ON TABLE "public"."sv_campanhas" IS 'Modulo "Seu Vendedor" sem nenhum consumidor no codigo. Trancada em admin ate a limpeza da sprint 6.';



CREATE TABLE IF NOT EXISTS "public"."sv_evolution_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instance_name" "text" NOT NULL,
    "api_url" "text" NOT NULL,
    "api_key" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "prioridade" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sv_evolution_configs" OWNER TO "postgres";


COMMENT ON TABLE "public"."sv_evolution_configs" IS 'Modulo "Seu Vendedor" sem nenhum consumidor no codigo. Trancada em admin ate a limpeza da sprint 6.';



CREATE TABLE IF NOT EXISTS "public"."sv_lead_mensagens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "campanha_id" "uuid" NOT NULL,
    "numero_msg" integer NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "enviado_em" timestamp with time zone,
    "proximo_envio" timestamp with time zone,
    "error_msg" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sv_lead_mensagens_numero_msg_check" CHECK ((("numero_msg" >= 0) AND ("numero_msg" <= 3))),
    CONSTRAINT "sv_lead_mensagens_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'enviado'::"text", 'erro'::"text", 'respondeu'::"text"])))
);


ALTER TABLE "public"."sv_lead_mensagens" OWNER TO "postgres";


COMMENT ON TABLE "public"."sv_lead_mensagens" IS 'Modulo "Seu Vendedor" sem nenhum consumidor no codigo. Trancada em admin ate a limpeza da sprint 6.';



CREATE TABLE IF NOT EXISTS "public"."sv_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "empresa" "text" NOT NULL,
    "nicho" "text" DEFAULT ''::"text" NOT NULL,
    "site_url" "text" DEFAULT ''::"text" NOT NULL,
    "telefone" "text" DEFAULT ''::"text" NOT NULL,
    "score" integer DEFAULT 50 NOT NULL,
    "tipo" "text" DEFAULT 'frio'::"text" NOT NULL,
    "status_kanban" "text" DEFAULT 'novo'::"text" NOT NULL,
    "status_whatsapp" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "contexto" "jsonb" DEFAULT '{"melhorias": [], "problemas": [], "argumentos": []}'::"jsonb" NOT NULL,
    "anotacoes" "text",
    "campanha_id" "uuid",
    "sem_resposta_wpp" boolean DEFAULT false NOT NULL,
    "prioridade" "text",
    "oferta_recomendada" "text",
    CONSTRAINT "sv_leads_score_check" CHECK ((("score" >= 0) AND ("score" <= 100))),
    CONSTRAINT "sv_leads_status_kanban_check" CHECK (("status_kanban" = ANY (ARRAY['novo'::"text", 'ligacao_agendada'::"text", 'proposta_enviada'::"text", 'negociacao'::"text", 'fechado'::"text", 'perdido'::"text"]))),
    CONSTRAINT "sv_leads_status_whatsapp_check" CHECK (("status_whatsapp" = ANY (ARRAY['pendente'::"text", 'msg1_enviada'::"text", 'fu1'::"text", 'fu2'::"text", 'fu3'::"text", 'sem_resposta'::"text", 'respondeu'::"text"]))),
    CONSTRAINT "sv_leads_tipo_check" CHECK (("tipo" = ANY (ARRAY['quente'::"text", 'frio'::"text"])))
);


ALTER TABLE "public"."sv_leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."sv_leads" IS 'Modulo "Seu Vendedor" sem nenhum consumidor no codigo. Trancada em admin ate a limpeza da sprint 6.';



CREATE TABLE IF NOT EXISTS "public"."sv_reunioes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "titulo" "text" NOT NULL,
    "empresa" "text",
    "data" "date" NOT NULL,
    "horario" time without time zone NOT NULL,
    "tipo" "text" DEFAULT 'ligacao'::"text" NOT NULL,
    "link" "text",
    "notas" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sv_reunioes_tipo_check" CHECK (("tipo" = ANY (ARRAY['ligacao'::"text", 'video'::"text", 'presencial'::"text"])))
);


ALTER TABLE "public"."sv_reunioes" OWNER TO "postgres";


COMMENT ON TABLE "public"."sv_reunioes" IS 'Modulo "Seu Vendedor" sem nenhum consumidor no codigo. Trancada em admin ate a limpeza da sprint 6.';



CREATE TABLE IF NOT EXISTS "public"."sv_scripts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nicho" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "template" "text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sv_scripts" OWNER TO "postgres";


COMMENT ON TABLE "public"."sv_scripts" IS 'Modulo "Seu Vendedor" sem nenhum consumidor no codigo. Trancada em admin ate a limpeza da sprint 6.';



CREATE TABLE IF NOT EXISTS "public"."sv_tarefas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "texto" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "feita" boolean DEFAULT false NOT NULL,
    "feita_em" "date",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sv_tarefas_tipo_check" CHECK (("tipo" = ANY (ARRAY['diaria'::"text", 'avulsa'::"text"])))
);


ALTER TABLE "public"."sv_tarefas" OWNER TO "postgres";


COMMENT ON TABLE "public"."sv_tarefas" IS 'Modulo "Seu Vendedor" sem nenhum consumidor no codigo. Trancada em admin ate a limpeza da sprint 6.';



CREATE TABLE IF NOT EXISTS "public"."tarefas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "titulo" "text" NOT NULL,
    "descricao" "text",
    "status" "text" DEFAULT 'a_fazer'::"text",
    "prioridade" "text" DEFAULT 'media'::"text",
    "responsavel_id" "uuid",
    "prazo" "date",
    "categoria" "text",
    "pagina" "text" DEFAULT 'produtividade'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "responsaveis" "uuid"[] DEFAULT '{}'::"uuid"[],
    "created_by" "uuid",
    "data_inicio" "date",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "tipo" "text" DEFAULT 'unitaria'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "criado_por_id" "uuid",
    "video_url" "text",
    CONSTRAINT "tarefas_status_check" CHECK (("status" = ANY (ARRAY['a_fazer'::"text", 'em_andamento'::"text", 'em_revisao'::"text", 'concluido'::"text", 'bloqueado'::"text"]))),
    CONSTRAINT "tarefas_tipo_check" CHECK (("tipo" = ANY (ARRAY['unitaria'::"text", 'sequencial'::"text"])))
);

ALTER TABLE ONLY "public"."tarefas" REPLICA IDENTITY FULL;


ALTER TABLE "public"."tarefas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tarefas_checklists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tarefa_id" "uuid",
    "texto" "text" NOT NULL,
    "concluido" boolean DEFAULT false,
    "ordem" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tarefas_checklists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tarefas_comentarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tarefa_id" "uuid",
    "autor_id" "uuid",
    "texto" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tarefas_comentarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tarefas_etapas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tarefa_id" "uuid",
    "ordem" integer NOT NULL,
    "titulo" "text" NOT NULL,
    "descricao" "text",
    "responsavel" "uuid",
    "prazo" "date",
    "status" "text" DEFAULT 'pendente'::"text",
    "desbloqueada" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "tarefas_etapas_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'em_andamento'::"text", 'concluido'::"text"])))
);


ALTER TABLE "public"."tarefas_etapas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."time_comercial_campanhas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "canal" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "condicoes" "text",
    "ativa" boolean DEFAULT true NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tipo" "text" DEFAULT 'novo'::"text" NOT NULL,
    CONSTRAINT "time_comercial_campanhas_tipo_check" CHECK (("tipo" = ANY (ARRAY['novo'::"text", 'retorno'::"text"])))
);


ALTER TABLE "public"."time_comercial_campanhas" OWNER TO "postgres";


COMMENT ON TABLE "public"."time_comercial_campanhas" IS 'Sub-campanhas por canal de aquisição do funil Time Comercial (ex: canal Direto com campanhas "Instagram Out/26", "Campanha Black Friday" etc, cada uma com sua condição). Ver TimeComercial.tsx.';



COMMENT ON COLUMN "public"."time_comercial_campanhas"."tipo" IS 'novo = contato inédito (etapa inicial Novo). retorno = lead que já existia no sistema (etapa inicial Retorno, não Novo).';



CREATE TABLE IF NOT EXISTS "public"."turma_disparo_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "turma_id" "text" NOT NULL,
    "template" "text" DEFAULT ''::"text" NOT NULL,
    "link_grupo" "text" DEFAULT ''::"text" NOT NULL,
    "link_aula_1" "text" DEFAULT ''::"text" NOT NULL,
    "link_aula_2" "text" DEFAULT ''::"text" NOT NULL,
    "link_aula_3" "text" DEFAULT ''::"text" NOT NULL,
    "delay_min_s" integer DEFAULT 8 NOT NULL,
    "delay_max_s" integer DEFAULT 20 NOT NULL,
    "typing_delay_s" integer DEFAULT 3 NOT NULL,
    "instance_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."turma_disparo_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."turma_responsaveis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "turma_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "nome_ref" "text",
    "percentual" numeric(5,2) DEFAULT 100.00 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "turma_responsaveis_percentual_check" CHECK ((("percentual" > (0)::numeric) AND ("percentual" <= (100)::numeric)))
);


ALTER TABLE "public"."turma_responsaveis" OWNER TO "postgres";


COMMENT ON COLUMN "public"."turma_responsaveis"."user_id" IS 'FK para responsaveis(id) — o responsável/investidor real dessa fatia da turma. nome_ref continua guardando o nome como snapshot de exibição.';



CREATE TABLE IF NOT EXISTS "public"."user_access_permissions" (
    "user_id" "uuid" NOT NULL,
    "can_view_dashboard" boolean DEFAULT true NOT NULL,
    "can_view_pipeline" boolean DEFAULT true NOT NULL,
    "can_view_lancamentos" boolean DEFAULT true NOT NULL,
    "can_view_all_lancamentos" boolean DEFAULT true NOT NULL,
    "allowed_lancamento_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "can_view_npa" boolean DEFAULT true NOT NULL,
    "can_view_aula_secreta" boolean DEFAULT true NOT NULL,
    "can_view_financeiro" boolean DEFAULT true NOT NULL,
    "can_view_balanco" boolean DEFAULT true NOT NULL,
    "can_view_operacoes" boolean DEFAULT true NOT NULL,
    "can_view_mapa_mental" boolean DEFAULT true NOT NULL,
    "can_view_rodrygo" boolean DEFAULT true NOT NULL,
    "can_view_team" boolean DEFAULT false NOT NULL,
    "can_view_settings" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "can_view_all_financeiro_turmas" boolean DEFAULT true NOT NULL,
    "allowed_financeiro_turma_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "can_view_financeiro_cfo" boolean DEFAULT false NOT NULL,
    "can_view_cobranca" boolean DEFAULT false NOT NULL,
    "can_view_time_comercial" boolean DEFAULT true NOT NULL,
    "can_view_franquia_psi" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."user_access_permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_access_permissions" IS 'Legado: so as listas allowed_lancamento_ids / allowed_financeiro_turma_ids ainda valem. Permissao de tela agora e a matriz (app_recursos / role_permissoes / user_permissao_override).';



CREATE TABLE IF NOT EXISTS "public"."user_permissao_override" (
    "user_id" "uuid" NOT NULL,
    "recurso" "text" NOT NULL,
    "acao" "text" NOT NULL,
    "permitido" boolean NOT NULL,
    "definido_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_permissao_override_acao_check" CHECK (("acao" = ANY (ARRAY['ver'::"text", 'editar'::"text", 'excluir'::"text", 'ver_todos'::"text"])))
);


ALTER TABLE "public"."user_permissao_override" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_permissao_override" IS 'Excecao por pessoa. Vence o padrao do papel, para os dois lados.';



CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" DEFAULT 'vendedor'::"public"."app_role" NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_pipeline_contratos" WITH ("security_invoker"='true') AS
 SELECT "id",
    "nome",
    "email",
    "whatsapp",
    "cpf",
    "produto",
    "origem_lead",
    "status",
    "turma_id",
    "dia_vencimento",
    "valor_mensalidade",
    "forma_pagamento",
    "dia_vencimento_contrato",
    "forms_respondido",
    "forms_respondido_em",
    "contrato_enviado",
    "contrato_enviado_em",
    "contrato_assinado",
    "contrato_assinado_em",
    "autentique_documento_id",
    "autentique_link_assinatura",
        CASE
            WHEN ("contrato_assinado" = true) THEN 'contrato_assinado'::"text"
            WHEN ("contrato_enviado" = true) THEN 'contrato_enviado'::"text"
            WHEN ("forms_respondido" = true) THEN 'forms_respondido'::"text"
            ELSE 'aguardando_forms'::"text"
        END AS "etapa_contrato",
    "created_at",
    "updated_at"
   FROM "public"."alunos"
  ORDER BY
        CASE
            WHEN ("contrato_assinado" = true) THEN 3
            WHEN ("contrato_enviado" = true) THEN 2
            WHEN ("forms_respondido" = true) THEN 1
            ELSE 0
        END DESC, "created_at" DESC;


ALTER VIEW "public"."v_pipeline_contratos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid",
    "asset_type" "text" NOT NULL,
    "block_order" integer,
    "storage_url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "video_assets_asset_type_check" CHECK (("asset_type" = ANY (ARRAY['narration_audio'::"text", 'scene_image'::"text", 'transcript_json'::"text", 'scene_clip'::"text"])))
);


ALTER TABLE "public"."video_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mode" "text" NOT NULL,
    "script_id" "uuid",
    "raw_video_url" "text",
    "manual_emphasis_points" "jsonb",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "error_message" "text",
    "final_video_url" "text",
    "criado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "processing_lock_at" timestamp with time zone,
    "music_track_url" "text",
    CONSTRAINT "video_jobs_mode_check" CHECK (("mode" = ANY (ARRAY['ai_generated'::"text", 'own_footage'::"text"]))),
    CONSTRAINT "video_jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'generating_audio'::"text", 'transcribing'::"text", 'generating_scenes'::"text", 'rendering'::"text", 'ready_for_review'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."video_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_scripts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "full_narration_text" "text" NOT NULL,
    "blocks" "jsonb" NOT NULL,
    "criado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "cliente_id" "uuid",
    "aprovado" boolean DEFAULT false NOT NULL,
    "tarefa_id" "uuid",
    "concept_word" "text"
);


ALTER TABLE "public"."video_scripts" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_alunos_financeiro" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"text" AS "nome",
    NULL::"text" AS "status",
    NULL::"uuid" AS "turma_id",
    NULL::"text" AS "produto",
    NULL::"text" AS "forma_pagamento",
    NULL::boolean AS "contrato_enviado",
    NULL::boolean AS "contrato_assinado",
    NULL::"date" AS "data_matricula",
    NULL::"date" AS "data_inicio",
    NULL::integer AS "mensalidades_pagas",
    NULL::integer AS "total_mensalidades",
    NULL::numeric AS "valor_efetivo",
    NULL::"text" AS "turma_nome",
    NULL::bigint AS "parcelas_pagas",
    NULL::bigint AS "parcelas_atrasadas",
    NULL::bigint AS "parcelas_pendentes",
    NULL::numeric AS "total_recebido",
    NULL::numeric AS "total_em_atraso",
    NULL::numeric AS "total_em_aberto",
    NULL::integer AS "dias_em_atraso",
    NULL::"date" AS "proxima_vencimento";


ALTER VIEW "public"."vw_alunos_financeiro" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_cfo_turmas" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"text" AS "nome",
    NULL::"text" AS "produto",
    NULL::integer AS "dia_vencimento",
    NULL::integer AS "total_mensalidades",
    NULL::numeric AS "valor_padrao",
    NULL::numeric AS "mrr_real",
    NULL::numeric AS "mrr_efetivo",
    NULL::bigint AS "alunos_ativos",
    NULL::bigint AS "alunos_cancelados",
    NULL::bigint AS "alunos_concluidos",
    NULL::numeric AS "parcelas_pagas_media",
    NULL::numeric AS "ticket_medio";


ALTER VIEW "public"."vw_cfo_turmas" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_receita_por_fonte" WITH ("security_invoker"='true') AS
 SELECT "p"."id",
    "p"."aluno_id",
    "p"."turma_id",
    "p"."valor",
    "p"."status",
    "p"."data_pagamento",
    "p"."mes_referencia",
    "p"."numero_parcela",
    "p"."produto",
    COALESCE("a"."forma_pagamento", 'boleto'::"text") AS "forma_pagamento",
        CASE "p"."produto"
            WHEN 'psicanalise'::"text" THEN 'PSI'::"text"
            WHEN 'npa'::"text" THEN 'NPA'::"text"
            WHEN 'numerologia'::"text" THEN 'NPA'::"text"
            ELSE COALESCE("pr"."nome", COALESCE("p"."produto", 'Outro'::"text"))
        END AS "produto_label",
    "p"."canal_cobranca",
    "a"."nome" AS "aluno_nome",
    "p"."conferido_em",
    "p"."conferido_por",
    "p"."taxa_valor"
   FROM (("public"."pagamentos" "p"
     LEFT JOIN "public"."alunos" "a" ON (("a"."id" = "p"."aluno_id")))
     LEFT JOIN "public"."produtos" "pr" ON (("pr"."slug" = "p"."produto")))
  WHERE (("p"."status" = 'pago'::"text") AND ("p"."data_pagamento" IS NOT NULL));


ALTER VIEW "public"."vw_receita_por_fonte" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_opt_out" (
    "telefone" "text" NOT NULL,
    "origem" "text" NOT NULL,
    "gatilho" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."whatsapp_opt_out" OWNER TO "postgres";


COMMENT ON TABLE "public"."whatsapp_opt_out" IS 'Telefones que pediram pra parar de receber mensagem (qualquer canal). Checado antes de enviar em disparo-runner, funil-processar e enviar-cobranca. Gravado por evo-resposta ao detectar palavra-chave de parada numa mensagem inbound.';



ALTER TABLE ONLY "public"."anon_insert_watch" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."anon_insert_watch_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."sheet_leads_33" ALTER COLUMN "row_id" SET DEFAULT "nextval"('"public"."sheet_leads_33_row_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."aluno_bonus_eventos"
    ADD CONSTRAINT "aluno_bonus_eventos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aluno_observacoes"
    ADD CONSTRAINT "aluno_observacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alunos"
    ADD CONSTRAINT "alunos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anon_insert_watch"
    ADD CONSTRAINT "anon_insert_watch_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_recursos"
    ADD CONSTRAINT "app_recursos_pkey" PRIMARY KEY ("chave");



ALTER TABLE ONLY "public"."aquecimento_chips"
    ADD CONSTRAINT "aquecimento_chips_evolution_config_id_key" UNIQUE ("evolution_config_id");



ALTER TABLE ONLY "public"."aquecimento_chips"
    ADD CONSTRAINT "aquecimento_chips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aquecimento_config"
    ADD CONSTRAINT "aquecimento_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aquecimento_grupos"
    ADD CONSTRAINT "aquecimento_grupos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aquecimento_jobs"
    ADD CONSTRAINT "aquecimento_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aquecimento_mensagens"
    ADD CONSTRAINT "aquecimento_mensagens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aquecimento_roteiro_mensagens"
    ADD CONSTRAINT "aquecimento_roteiro_mensagens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aquecimento_roteiro_mensagens"
    ADD CONSTRAINT "aquecimento_roteiro_mensagens_roteiro_id_ordem_key" UNIQUE ("roteiro_id", "ordem");



ALTER TABLE ONLY "public"."aquecimento_roteiros_dm"
    ADD CONSTRAINT "aquecimento_roteiros_dm_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aula_secreta_eventos"
    ADD CONSTRAINT "aula_secreta_eventos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aula_secreta_leads"
    ADD CONSTRAINT "aula_secreta_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aula_secreta_log"
    ADD CONSTRAINT "aula_secreta_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."balanco_config"
    ADD CONSTRAINT "balanco_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."balanco_itens"
    ADD CONSTRAINT "balanco_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."boas_vindas_agendados"
    ADD CONSTRAINT "boas_vindas_agendados_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."boas_vindas_config"
    ADD CONSTRAINT "boas_vindas_config_funnel_name_key" UNIQUE ("funnel_name");



ALTER TABLE ONLY "public"."boas_vindas_config"
    ADD CONSTRAINT "boas_vindas_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."boas_vindas_logs"
    ADD CONSTRAINT "boas_vindas_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bonus_tipos"
    ADD CONSTRAINT "bonus_tipos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bonus_turmas"
    ADD CONSTRAINT "bonus_turmas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."canais_cobranca"
    ADD CONSTRAINT "canais_cobranca_nome_key" UNIQUE ("nome");



ALTER TABLE ONLY "public"."canais_cobranca"
    ADD CONSTRAINT "canais_cobranca_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_leituras"
    ADD CONSTRAINT "chat_leituras_pkey" PRIMARY KEY ("user_id", "telefone");



ALTER TABLE ONLY "public"."cobranca_config"
    ADD CONSTRAINT "cobranca_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cobranca_ia_conversas"
    ADD CONSTRAINT "cobranca_ia_conversas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cobranca_ia_mensagens"
    ADD CONSTRAINT "cobranca_ia_mensagens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cobranca_logs"
    ADD CONSTRAINT "cobranca_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cobranca_templates"
    ADD CONSTRAINT "cobranca_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cobranca_turmas_ativas"
    ADD CONSTRAINT "cobranca_turmas_ativas_pkey" PRIMARY KEY ("turma_id");



ALTER TABLE ONLY "public"."conteudo_calendario"
    ADD CONSTRAINT "conteudo_calendario_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conteudo_clientes"
    ADD CONSTRAINT "conteudo_clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conteudo_clientes"
    ADD CONSTRAINT "conteudo_clientes_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."conteudo_posts"
    ADD CONSTRAINT "conteudo_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_config"
    ADD CONSTRAINT "crm_config_chave_key" UNIQUE ("chave");



ALTER TABLE ONLY "public"."crm_config"
    ADD CONSTRAINT "crm_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cursos"
    ADD CONSTRAINT "cursos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ddd_regioes"
    ADD CONSTRAINT "ddd_regioes_pkey" PRIMARY KEY ("ddd");



ALTER TABLE ONLY "public"."disparo_campanhas"
    ADD CONSTRAINT "disparo_campanhas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."disparo_leads"
    ADD CONSTRAINT "disparo_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_config"
    ADD CONSTRAINT "email_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipe_11ds_agentes"
    ADD CONSTRAINT "equipe_11ds_agentes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipe_11ds_blueprints"
    ADD CONSTRAINT "equipe_11ds_blueprints_cliente_id_tipo_versao_key" UNIQUE ("cliente_id", "tipo", "versao");



ALTER TABLE ONLY "public"."equipe_11ds_blueprints"
    ADD CONSTRAINT "equipe_11ds_blueprints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipe_11ds_chat_acoes"
    ADD CONSTRAINT "equipe_11ds_chat_acoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipe_11ds_chat_mensagens"
    ADD CONSTRAINT "equipe_11ds_chat_mensagens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipe_11ds_ferramenta_chamadas"
    ADD CONSTRAINT "equipe_11ds_ferramenta_chamadas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipe_11ds_memorias"
    ADD CONSTRAINT "equipe_11ds_memorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipe_11ds_mensagens"
    ADD CONSTRAINT "equipe_11ds_mensagens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipe_11ds_plano_etapas"
    ADD CONSTRAINT "equipe_11ds_plano_etapas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipe_11ds_plano_etapas"
    ADD CONSTRAINT "equipe_11ds_plano_etapas_plano_id_chave_key" UNIQUE ("plano_id", "chave");



ALTER TABLE ONLY "public"."equipe_11ds_plano_etapas"
    ADD CONSTRAINT "equipe_11ds_plano_etapas_plano_id_ordem_key" UNIQUE ("plano_id", "ordem");



ALTER TABLE ONLY "public"."equipe_11ds_planos"
    ADD CONSTRAINT "equipe_11ds_planos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipe_11ds_recorrentes"
    ADD CONSTRAINT "equipe_11ds_recorrentes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipe_11ds_tarefas"
    ADD CONSTRAINT "equipe_11ds_tarefas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipe_11ds_times"
    ADD CONSTRAINT "equipe_11ds_times_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipe_11ds_times"
    ADD CONSTRAINT "equipe_11ds_times_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."equipe"
    ADD CONSTRAINT "equipe_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."eventos_calendario"
    ADD CONSTRAINT "eventos_calendario_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evolution_conexao_eventos"
    ADD CONSTRAINT "evolution_conexao_eventos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evolution_config"
    ADD CONSTRAINT "evolution_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evolution_task_config"
    ADD CONSTRAINT "evolution_task_config_pkey" PRIMARY KEY ("task");



ALTER TABLE ONLY "public"."fechamentos"
    ADD CONSTRAINT "fechamentos_periodo_tipo_periodo_key_key" UNIQUE ("periodo_tipo", "periodo_key");



ALTER TABLE ONLY "public"."fechamentos"
    ADD CONSTRAINT "fechamentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fontes"
    ADD CONSTRAINT "fontes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."franquia_campanha"
    ADD CONSTRAINT "franquia_campanha_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."franquia_leads"
    ADD CONSTRAINT "franquia_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."funnel_configs"
    ADD CONSTRAINT "funnel_configs_funnel_name_key" UNIQUE ("funnel_name");



ALTER TABLE ONLY "public"."funnel_configs"
    ADD CONSTRAINT "funnel_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."funnel_messages"
    ADD CONSTRAINT "funnel_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."funnel_poll_respostas"
    ADD CONSTRAINT "funnel_poll_respostas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."grupo_add_jobs"
    ADD CONSTRAINT "grupo_add_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."idm_criativos_log"
    ADD CONSTRAINT "idm_criativos_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."idm_quiz_leads"
    ADD CONSTRAINT "idm_quiz_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kanban_colunas"
    ADD CONSTRAINT "kanban_colunas_lancamento_nome_unique" UNIQUE ("lancamento_id", "nome");



ALTER TABLE ONLY "public"."kanban_colunas"
    ADD CONSTRAINT "kanban_colunas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lancamento_campanhas"
    ADD CONSTRAINT "lancamento_campanhas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lancamento_eventos"
    ADD CONSTRAINT "lancamento_eventos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lancamento_leads"
    ADD CONSTRAINT "lancamento_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lancamentos"
    ADD CONSTRAINT "lancamentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_aquecimento_campanhas"
    ADD CONSTRAINT "lead_aquecimento_campanhas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_aquecimento_config"
    ADD CONSTRAINT "lead_aquecimento_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_aquecimento_fases"
    ADD CONSTRAINT "lead_aquecimento_fases_fase_numero_key" UNIQUE ("fase_numero");



ALTER TABLE ONLY "public"."lead_aquecimento_fases"
    ADD CONSTRAINT "lead_aquecimento_fases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_aquecimento_leads"
    ADD CONSTRAINT "lead_aquecimento_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_aquecimento_vendedores"
    ADD CONSTRAINT "lead_aquecimento_vendedores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_aquecimento_vendedores"
    ADD CONSTRAINT "lead_aquecimento_vendedores_usuario_id_key" UNIQUE ("usuario_id");



ALTER TABLE ONLY "public"."lead_cartas_usadas"
    ADD CONSTRAINT "lead_cartas_usadas_lead_id_carta_id_key" UNIQUE ("lead_id", "carta_id");



ALTER TABLE ONLY "public"."lead_cartas_usadas"
    ADD CONSTRAINT "lead_cartas_usadas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_respostas"
    ADD CONSTRAINT "lead_respostas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads_cartas_negociacao"
    ADD CONSTRAINT "leads_cartas_negociacao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads_diretos_config"
    ADD CONSTRAINT "leads_diretos_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads_historico_fase"
    ADD CONSTRAINT "leads_historico_fase_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads_ia_config"
    ADD CONSTRAINT "leads_ia_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads_ia_conhecimento"
    ADD CONSTRAINT "leads_ia_conhecimento_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads_ia_conhecimento_sugestoes"
    ADD CONSTRAINT "leads_ia_conhecimento_sugestoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads_ia_conversas"
    ADD CONSTRAINT "leads_ia_conversas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads_ia_debounce"
    ADD CONSTRAINT "leads_ia_debounce_pkey" PRIMARY KEY ("telefone");



ALTER TABLE ONLY "public"."leads_ia_mensagens"
    ADD CONSTRAINT "leads_ia_mensagens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads_ia_oferta_ativa"
    ADD CONSTRAINT "leads_ia_oferta_ativa_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads_produtos_valores"
    ADD CONSTRAINT "leads_produtos_valores_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "public"."leads_quadro_cards"
    ADD CONSTRAINT "leads_quadro_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads_quadro_cards"
    ADD CONSTRAINT "leads_quadro_cards_quadro_id_origem_tabela_origem_id_key" UNIQUE ("quadro_id", "origem_tabela", "origem_id");



ALTER TABLE ONLY "public"."leads_quadros"
    ADD CONSTRAINT "leads_quadros_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lista_espera_cidades"
    ADD CONSTRAINT "lista_espera_cidades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."midia_imagens_reaproveitaveis"
    ADD CONSTRAINT "midia_imagens_reaproveitaveis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mind_map_connections"
    ADD CONSTRAINT "mind_map_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mind_map_nodes"
    ADD CONSTRAINT "mind_map_nodes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mind_map_pages"
    ADD CONSTRAINT "mind_map_pages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mind_map_pages"
    ADD CONSTRAINT "mind_map_pages_workspace_key" UNIQUE ("workspace");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."npa_eventos_log"
    ADD CONSTRAINT "npa_eventos_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."npa_eventos"
    ADD CONSTRAINT "npa_eventos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."npa_eventos"
    ADD CONSTRAINT "npa_eventos_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."npa_evento_leads"
    ADD CONSTRAINT "npa_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pagamentos"
    ADD CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parceiros_cliques"
    ADD CONSTRAINT "parceiros_cliques_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parceiros_cupons"
    ADD CONSTRAINT "parceiros_cupons_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."parceiros_cupons"
    ADD CONSTRAINT "parceiros_cupons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parceiros_entregas_arquivos"
    ADD CONSTRAINT "parceiros_entregas_arquivos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parceiros_entregas_comentarios"
    ADD CONSTRAINT "parceiros_entregas_comentarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parceiros_entregas"
    ADD CONSTRAINT "parceiros_entregas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parceiros_links"
    ADD CONSTRAINT "parceiros_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parceiros_links"
    ADD CONSTRAINT "parceiros_links_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."parceiros_metas"
    ADD CONSTRAINT "parceiros_metas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parceiros"
    ADD CONSTRAINT "parceiros_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parceiros_produtos"
    ADD CONSTRAINT "parceiros_produtos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parceiros_vendas"
    ADD CONSTRAINT "parceiros_vendas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parceiros_video_metricas"
    ADD CONSTRAINT "parceiros_video_metricas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_method_rates"
    ADD CONSTRAINT "payment_method_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_method_rates"
    ADD CONSTRAINT "payment_method_rates_produto_slug_forma_pagamento_gateway_f_key" UNIQUE ("produto_slug", "forma_pagamento", "gateway", "faixa_min");



ALTER TABLE ONLY "public"."pessoa_identificadores"
    ADD CONSTRAINT "pessoa_identificadores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pessoa_identificadores"
    ADD CONSTRAINT "pessoa_identificadores_tipo_valor_key" UNIQUE ("tipo", "valor");



ALTER TABLE ONLY "public"."pessoa_vinculos"
    ADD CONSTRAINT "pessoa_vinculos_origem_tabela_origem_id_key" UNIQUE ("origem_tabela", "origem_id");



ALTER TABLE ONLY "public"."pessoa_vinculos"
    ADD CONSTRAINT "pessoa_vinculos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pessoas"
    ADD CONSTRAINT "pessoas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."produtos"
    ADD CONSTRAINT "produtos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."produtos"
    ADD CONSTRAINT "produtos_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."quick_sends"
    ADD CONSTRAINT "quick_sends_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."responsaveis"
    ADD CONSTRAINT "responsaveis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."responsaveis"
    ADD CONSTRAINT "responsaveis_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."role_permissoes"
    ADD CONSTRAINT "role_permissoes_pkey" PRIMARY KEY ("papel", "recurso", "acao");



ALTER TABLE ONLY "public"."seu_numerologo_config"
    ADD CONSTRAINT "seu_numerologo_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seu_numerologo_leads"
    ADD CONSTRAINT "seu_numerologo_leads_email_unique" UNIQUE ("email");



ALTER TABLE ONLY "public"."seu_numerologo_leads"
    ADD CONSTRAINT "seu_numerologo_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sheet_leads_33"
    ADD CONSTRAINT "sheet_leads_33_pkey" PRIMARY KEY ("row_id");



ALTER TABLE ONLY "public"."sheet_leads_36"
    ADD CONSTRAINT "sheet_leads_36_pkey" PRIMARY KEY ("row_id");



ALTER TABLE ONLY "public"."sheet_leads_37"
    ADD CONSTRAINT "sheet_leads_37_pkey" PRIMARY KEY ("row_id");



ALTER TABLE ONLY "public"."sheet_leads_38"
    ADD CONSTRAINT "sheet_leads_38_pkey" PRIMARY KEY ("row_id");



ALTER TABLE ONLY "public"."sheet_leads_39"
    ADD CONSTRAINT "sheet_leads_39_pkey" PRIMARY KEY ("row_id");



ALTER TABLE ONLY "public"."sheet_leads_40"
    ADD CONSTRAINT "sheet_leads_40_pkey" PRIMARY KEY ("row_id");



ALTER TABLE ONLY "public"."sheet_leads_41"
    ADD CONSTRAINT "sheet_leads_41_pkey" PRIMARY KEY ("row_id");



ALTER TABLE ONLY "public"."sheet_leads_42"
    ADD CONSTRAINT "sheet_leads_42_pkey" PRIMARY KEY ("row_id");



ALTER TABLE ONLY "public"."sheet_leads_43"
    ADD CONSTRAINT "sheet_leads_43_pkey" PRIMARY KEY ("row_id");



ALTER TABLE ONLY "public"."sheet_leads_44"
    ADD CONSTRAINT "sheet_leads_44_pkey" PRIMARY KEY ("row_id");



ALTER TABLE ONLY "public"."sheet_leads_45"
    ADD CONSTRAINT "sheet_leads_45_pkey" PRIMARY KEY ("row_id");



ALTER TABLE ONLY "public"."sheet_leads_46"
    ADD CONSTRAINT "sheet_leads_46_pkey" PRIMARY KEY ("row_id");



ALTER TABLE ONLY "public"."sheet_leads_47"
    ADD CONSTRAINT "sheet_leads_47_pkey" PRIMARY KEY ("row_id");



ALTER TABLE ONLY "public"."subtarefas"
    ADD CONSTRAINT "subtarefas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sv_app_config"
    ADD CONSTRAINT "sv_app_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."sv_campanhas"
    ADD CONSTRAINT "sv_campanhas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sv_evolution_configs"
    ADD CONSTRAINT "sv_evolution_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sv_lead_mensagens"
    ADD CONSTRAINT "sv_lead_mensagens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sv_leads"
    ADD CONSTRAINT "sv_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sv_reunioes"
    ADD CONSTRAINT "sv_reunioes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sv_scripts"
    ADD CONSTRAINT "sv_scripts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sv_tarefas"
    ADD CONSTRAINT "sv_tarefas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tarefas_checklists"
    ADD CONSTRAINT "tarefas_checklists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tarefas_comentarios"
    ADD CONSTRAINT "tarefas_comentarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tarefas_etapas"
    ADD CONSTRAINT "tarefas_etapas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."time_comercial_campanhas"
    ADD CONSTRAINT "time_comercial_campanhas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."turma_disparo_config"
    ADD CONSTRAINT "turma_disparo_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."turma_disparo_config"
    ADD CONSTRAINT "turma_disparo_config_turma_id_key" UNIQUE ("turma_id");



ALTER TABLE ONLY "public"."turma_responsaveis"
    ADD CONSTRAINT "turma_responsaveis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."turma_responsaveis"
    ADD CONSTRAINT "turma_responsaveis_turma_id_user_id_key" UNIQUE ("turma_id", "user_id");



ALTER TABLE ONLY "public"."turmas"
    ADD CONSTRAINT "turmas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_access_permissions"
    ADD CONSTRAINT "user_access_permissions_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_permissao_override"
    ADD CONSTRAINT "user_permissao_override_pkey" PRIMARY KEY ("user_id", "recurso", "acao");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."video_assets"
    ADD CONSTRAINT "video_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_jobs"
    ADD CONSTRAINT "video_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_scripts"
    ADD CONSTRAINT "video_scripts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_mensagens"
    ADD CONSTRAINT "whatsapp_mensagens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_opt_out"
    ADD CONSTRAINT "whatsapp_opt_out_pkey" PRIMARY KEY ("telefone");



CREATE UNIQUE INDEX "alunos_contrato_token_idx" ON "public"."alunos" USING "btree" ("contrato_token");



CREATE INDEX "boas_vindas_logs_funnel_idx" ON "public"."boas_vindas_logs" USING "btree" ("funnel_name");



CREATE INDEX "boas_vindas_logs_funnel_sent" ON "public"."boas_vindas_logs" USING "btree" ("funnel_name", "sent_at" DESC);



CREATE INDEX "boas_vindas_logs_sent_at_idx" ON "public"."boas_vindas_logs" USING "btree" ("sent_at" DESC);



CREATE INDEX "cobranca_ia_conversas_status_idx" ON "public"."cobranca_ia_conversas" USING "btree" ("status");



CREATE INDEX "cobranca_ia_conversas_ultima_msg_idx" ON "public"."cobranca_ia_conversas" USING "btree" ("ultima_mensagem_em" DESC);



CREATE INDEX "cobranca_ia_mensagens_conversa_idx" ON "public"."cobranca_ia_mensagens" USING "btree" ("conversa_id", "created_at");



CREATE INDEX "cobranca_logs_aluno_idx" ON "public"."cobranca_logs" USING "btree" ("aluno_id");



CREATE INDEX "cobranca_logs_created_idx" ON "public"."cobranca_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "cobranca_logs_status_idx" ON "public"."cobranca_logs" USING "btree" ("status");



CREATE UNIQUE INDEX "conteudo_calendario_cliente_data_key" ON "public"."conteudo_calendario" USING "btree" ("cliente_id", "data_publicacao");



CREATE INDEX "conteudo_posts_blueprint_idx" ON "public"."conteudo_posts" USING "btree" ("blueprint_id");



CREATE INDEX "conteudo_posts_qa_pendente_idx" ON "public"."conteudo_posts" USING "btree" ("created_at" DESC) WHERE ("qa_visual_status" <> 'aprovado'::"text");



CREATE UNIQUE INDEX "equipe_11ds_agentes_slug_key" ON "public"."equipe_11ds_agentes" USING "btree" ("slug") WHERE ("slug" IS NOT NULL);



CREATE UNIQUE INDEX "equipe_11ds_blueprints_ativo_cliente_tipo_idx" ON "public"."equipe_11ds_blueprints" USING "btree" ("cliente_id", "tipo") WHERE ("status" = 'ativo'::"text");



CREATE INDEX "equipe_11ds_blueprints_cliente_idx" ON "public"."equipe_11ds_blueprints" USING "btree" ("cliente_id", "created_at" DESC);



CREATE INDEX "equipe_11ds_blueprints_criado_por_idx" ON "public"."equipe_11ds_blueprints" USING "btree" ("criado_por");



CREATE INDEX "equipe_11ds_blueprints_substitui_idx" ON "public"."equipe_11ds_blueprints" USING "btree" ("substitui_id");



CREATE INDEX "equipe_11ds_chat_acoes_usuario_agente_idx" ON "public"."equipe_11ds_chat_acoes" USING "btree" ("solicitante_id", "agente_id", "created_at" DESC);



CREATE INDEX "equipe_11ds_chat_mensagens_plano_idx" ON "public"."equipe_11ds_chat_mensagens" USING "btree" ("plano_id");



CREATE INDEX "equipe_11ds_chat_mensagens_usuario_agente_idx" ON "public"."equipe_11ds_chat_mensagens" USING "btree" ("solicitante_id", "agente_id", "created_at" DESC);



CREATE INDEX "equipe_11ds_ferramenta_chamadas_etapa_idx" ON "public"."equipe_11ds_ferramenta_chamadas" USING "btree" ("etapa_id", "created_at" DESC);



CREATE INDEX "equipe_11ds_ferramenta_chamadas_plano_idx" ON "public"."equipe_11ds_ferramenta_chamadas" USING "btree" ("plano_id", "created_at" DESC);



CREATE INDEX "equipe_11ds_memorias_agente_idx" ON "public"."equipe_11ds_memorias" USING "btree" ("agente_id");



CREATE INDEX "equipe_11ds_memorias_cliente_status_idx" ON "public"."equipe_11ds_memorias" USING "btree" ("cliente_id", "tipo", "prioridade" DESC, "created_at" DESC) WHERE ("status" = ANY (ARRAY['ativa'::"text", 'pendente_sincronizacao'::"text"]));



CREATE UNIQUE INDEX "equipe_11ds_memorias_deduplicacao_idx" ON "public"."equipe_11ds_memorias" USING "btree" ("solicitante_id", "conteudo_hash") WHERE ("status" = ANY (ARRAY['ativa'::"text", 'pendente_sincronizacao'::"text"]));



CREATE INDEX "equipe_11ds_memorias_plano_idx" ON "public"."equipe_11ds_memorias" USING "btree" ("plano_id");



CREATE INDEX "equipe_11ds_memorias_substitui_idx" ON "public"."equipe_11ds_memorias" USING "btree" ("substitui_id");



CREATE INDEX "equipe_11ds_memorias_sync_pendente_idx" ON "public"."equipe_11ds_memorias" USING "btree" ("proxima_tentativa_em", "created_at") WHERE ("status" = 'pendente_sincronizacao'::"text");



CREATE INDEX "equipe_11ds_memorias_usuario_tipo_idx" ON "public"."equipe_11ds_memorias" USING "btree" ("solicitante_id", "tipo", "created_at" DESC);



CREATE INDEX "equipe_11ds_mensagens_tarefa_idx" ON "public"."equipe_11ds_mensagens" USING "btree" ("tarefa_id", "created_at");



CREATE INDEX "equipe_11ds_plano_etapas_agente_idx" ON "public"."equipe_11ds_plano_etapas" USING "btree" ("agente_id");



CREATE INDEX "equipe_11ds_plano_etapas_plano_status_idx" ON "public"."equipe_11ds_plano_etapas" USING "btree" ("plano_id", "status", "ordem");



CREATE UNIQUE INDEX "equipe_11ds_planos_abertos_usuario_agente_idx" ON "public"."equipe_11ds_planos" USING "btree" ("solicitante_id", "agente_responsavel_id") WHERE ("status" = ANY (ARRAY['aguardando_confirmacao'::"text", 'executando'::"text"]));



CREATE INDEX "equipe_11ds_planos_agente_idx" ON "public"."equipe_11ds_planos" USING "btree" ("agente_responsavel_id");



CREATE INDEX "equipe_11ds_planos_status_idx" ON "public"."equipe_11ds_planos" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "equipe_11ds_planos_usuario_agente_idx" ON "public"."equipe_11ds_planos" USING "btree" ("solicitante_id", "agente_responsavel_id", "created_at" DESC);



CREATE UNIQUE INDEX "equipe_11ds_tarefas_post_cliente_ativo_unique" ON "public"."equipe_11ds_tarefas" USING "btree" ("cliente_id") WHERE ((("tipo")::"text" = 'post_cliente'::"text") AND (("status")::"text" = ANY ((ARRAY['pendente'::character varying, 'em_andamento'::character varying])::"text"[])));



CREATE UNIQUE INDEX "equipe_11ds_tarefas_recorrente_ativo_unique" ON "public"."equipe_11ds_tarefas" USING "btree" ("recorrente_id") WHERE (("recorrente_id" IS NOT NULL) AND (("status")::"text" = ANY ((ARRAY['pendente'::character varying, 'em_andamento'::character varying])::"text"[])));



CREATE INDEX "funnel_poll_respostas_funnel_message_id_idx" ON "public"."funnel_poll_respostas" USING "btree" ("funnel_message_id");



CREATE INDEX "funnel_poll_respostas_group_jid_idx" ON "public"."funnel_poll_respostas" USING "btree" ("group_jid");



CREATE INDEX "funnel_poll_respostas_voter_phone_idx" ON "public"."funnel_poll_respostas" USING "btree" ("voter_phone");



CREATE INDEX "grupo_add_jobs_due" ON "public"."grupo_add_jobs" USING "btree" ("lancamento_id", "scheduled_at") WHERE ("done_at" IS NULL);



CREATE INDEX "idm_quiz_leads_created_at_idx" ON "public"."idm_quiz_leads" USING "btree" ("created_at" DESC);



CREATE INDEX "idm_quiz_leads_email_idx" ON "public"."idm_quiz_leads" USING "btree" ("email");



CREATE INDEX "idm_quiz_leads_pontuacao_idx" ON "public"."idm_quiz_leads" USING "btree" ("pontuacao" DESC);



CREATE INDEX "idx_aluno_bonus_eventos_aluno_id" ON "public"."aluno_bonus_eventos" USING "btree" ("aluno_id");



CREATE INDEX "idx_aluno_observacoes_aluno_id" ON "public"."aluno_observacoes" USING "btree" ("aluno_id");



CREATE INDEX "idx_alunos_autentique_id" ON "public"."alunos" USING "btree" ("autentique_documento_id");



CREATE INDEX "idx_alunos_contrato_assinado" ON "public"."alunos" USING "btree" ("contrato_assinado");



CREATE INDEX "idx_alunos_contrato_enviado" ON "public"."alunos" USING "btree" ("contrato_enviado");



CREATE INDEX "idx_alunos_email" ON "public"."alunos" USING "btree" ("email");



CREATE INDEX "idx_alunos_forms_respondido" ON "public"."alunos" USING "btree" ("forms_respondido");



CREATE INDEX "idx_alunos_lancamento_id" ON "public"."alunos" USING "btree" ("lancamento_id");



CREATE INDEX "idx_alunos_pessoa" ON "public"."alunos" USING "btree" ("pessoa_id");



CREATE INDEX "idx_alunos_status" ON "public"."alunos" USING "btree" ("status");



CREATE INDEX "idx_alunos_turma" ON "public"."alunos" USING "btree" ("turma_id");



CREATE INDEX "idx_alunos_whatsapp" ON "public"."alunos" USING "btree" ("whatsapp");



CREATE INDEX "idx_aquecimento_jobs_chip_origem" ON "public"."aquecimento_jobs" USING "btree" ("chip_origem_id", "created_at");



CREATE INDEX "idx_aquecimento_jobs_evolution_message_id" ON "public"."aquecimento_jobs" USING "btree" ("evolution_message_id") WHERE ("evolution_message_id" IS NOT NULL);



CREATE INDEX "idx_aquecimento_jobs_scheduled" ON "public"."aquecimento_jobs" USING "btree" ("status", "scheduled_at");



CREATE INDEX "idx_aquecimento_jobs_sessao" ON "public"."aquecimento_jobs" USING "btree" ("sessao_id") WHERE ("sessao_id" IS NOT NULL);



CREATE INDEX "idx_as_leads_evento" ON "public"."aula_secreta_leads" USING "btree" ("aula_secreta_evento_id");



CREATE INDEX "idx_audit_logs_action" ON "public"."audit_logs" USING "btree" ("action");



CREATE INDEX "idx_audit_logs_actor_id" ON "public"."audit_logs" USING "btree" ("actor_id");



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_balanco_empresa" ON "public"."balanco_itens" USING "btree" ("empresa");



CREATE INDEX "idx_bonus_turmas_bonus_id" ON "public"."bonus_turmas" USING "btree" ("bonus_id");



CREATE INDEX "idx_bv_agendados_lancamento" ON "public"."boas_vindas_agendados" USING "btree" ("lancamento_id");



CREATE INDEX "idx_bv_agendados_lead" ON "public"."boas_vindas_agendados" USING "btree" ("lead_id");



CREATE INDEX "idx_bv_agendados_status_hora" ON "public"."boas_vindas_agendados" USING "btree" ("status", "agendado_para") WHERE ("status" = 'pendente'::"text");



CREATE INDEX "idx_conteudo_posts_cliente_id" ON "public"."conteudo_posts" USING "btree" ("cliente_id");



CREATE INDEX "idx_conteudo_posts_data_post" ON "public"."conteudo_posts" USING "btree" ("data_post");



CREATE INDEX "idx_conteudo_posts_status" ON "public"."conteudo_posts" USING "btree" ("status");



CREATE INDEX "idx_disparo_campanhas_status" ON "public"."disparo_campanhas" USING "btree" ("status");



CREATE INDEX "idx_disparo_leads_campanha" ON "public"."disparo_leads" USING "btree" ("campanha_id");



CREATE INDEX "idx_disparo_leads_campanha_ordem" ON "public"."disparo_leads" USING "btree" ("campanha_id", "ordem");



CREATE INDEX "idx_disparo_leads_campanha_status" ON "public"."disparo_leads" USING "btree" ("campanha_id", "status");



CREATE INDEX "idx_disparo_leads_evolution_message_id" ON "public"."disparo_leads" USING "btree" ("evolution_message_id") WHERE ("evolution_message_id" IS NOT NULL);



CREATE INDEX "idx_disparo_leads_pessoa" ON "public"."disparo_leads" USING "btree" ("pessoa_id");



CREATE INDEX "idx_disparo_leads_sent_at" ON "public"."disparo_leads" USING "btree" ("campanha_id", "sent_at") WHERE ("status" = 'enviado'::"text");



CREATE INDEX "idx_disparo_leads_status" ON "public"."disparo_leads" USING "btree" ("campanha_id", "status");



CREATE INDEX "idx_disparo_leads_temperatura" ON "public"."disparo_leads" USING "btree" ("campanha_id", "temperatura");



CREATE INDEX "idx_equipe_11ds_agentes_time_id" ON "public"."equipe_11ds_agentes" USING "btree" ("time_id");



CREATE INDEX "idx_equipe_11ds_recorrentes_agente_id" ON "public"."equipe_11ds_recorrentes" USING "btree" ("agente_id");



CREATE INDEX "idx_equipe_11ds_tarefas_agente_id" ON "public"."equipe_11ds_tarefas" USING "btree" ("agente_id");



CREATE INDEX "idx_equipe_11ds_tarefas_recorrente_id" ON "public"."equipe_11ds_tarefas" USING "btree" ("recorrente_id");



CREATE INDEX "idx_equipe_11ds_tarefas_status" ON "public"."equipe_11ds_tarefas" USING "btree" ("status");



CREATE INDEX "idx_evolution_conexao_eventos_instance" ON "public"."evolution_conexao_eventos" USING "btree" ("instance_name", "created_at" DESC);



CREATE INDEX "idx_franquia_campanha_data" ON "public"."franquia_campanha" USING "btree" ("data");



CREATE INDEX "idx_franquia_leads_fase" ON "public"."franquia_leads" USING "btree" ("fase");



CREATE INDEX "idx_franquia_leads_pessoa" ON "public"."franquia_leads" USING "btree" ("pessoa_id");



CREATE INDEX "idx_franquia_leads_vendedor" ON "public"."franquia_leads" USING "btree" ("vendedor_id");



CREATE INDEX "idx_funnel_messages_funnel_name" ON "public"."funnel_messages" USING "btree" ("funnel_name");



CREATE INDEX "idx_funnel_messages_message_type" ON "public"."funnel_messages" USING "btree" ("message_type");



CREATE INDEX "idx_funnel_messages_scheduled_at" ON "public"."funnel_messages" USING "btree" ("scheduled_at");



CREATE INDEX "idx_funnel_messages_status" ON "public"."funnel_messages" USING "btree" ("status");



CREATE INDEX "idx_kanban_colunas_aula_secreta" ON "public"."kanban_colunas" USING "btree" ("aula_secreta_evento_id") WHERE ("aula_secreta_evento_id" IS NOT NULL);



CREATE INDEX "idx_kanban_colunas_lancamento" ON "public"."kanban_colunas" USING "btree" ("lancamento_id") WHERE ("lancamento_id" IS NOT NULL);



CREATE INDEX "idx_kanban_colunas_lancamento_id" ON "public"."kanban_colunas" USING "btree" ("lancamento_id", "ordem");



CREATE INDEX "idx_kanban_colunas_npa" ON "public"."kanban_colunas" USING "btree" ("npa_evento_id") WHERE ("npa_evento_id" IS NOT NULL);



CREATE INDEX "idx_lancamento_leads_atividade" ON "public"."lancamento_leads" USING "btree" ("ultima_atividade" DESC);



CREATE INDEX "idx_lancamento_leads_fase" ON "public"."lancamento_leads" USING "btree" ("fase");



CREATE INDEX "idx_lancamento_leads_lancamento" ON "public"."lancamento_leads" USING "btree" ("lancamento_id");



CREATE INDEX "idx_lancamento_leads_lancamento_id" ON "public"."lancamento_leads" USING "btree" ("lancamento_id");



CREATE INDEX "idx_lancamento_leads_pessoa" ON "public"."lancamento_leads" USING "btree" ("pessoa_id");



CREATE INDEX "idx_lancamento_leads_whatsapp" ON "public"."lancamento_leads" USING "btree" ("whatsapp");



CREATE INDEX "idx_lead_aquecimento_leads_campanha" ON "public"."lead_aquecimento_leads" USING "btree" ("campanha_id");



CREATE INDEX "idx_lead_aquecimento_leads_isca_agendada" ON "public"."lead_aquecimento_leads" USING "btree" ("status", "isca_agendada_para");



CREATE INDEX "idx_lead_aquecimento_leads_phone" ON "public"."lead_aquecimento_leads" USING "btree" ("phone");



CREATE INDEX "idx_lead_aquecimento_leads_status" ON "public"."lead_aquecimento_leads" USING "btree" ("status");



CREATE INDEX "idx_lead_cartas_usadas_lead" ON "public"."lead_cartas_usadas" USING "btree" ("lead_id");



CREATE INDEX "idx_lead_respostas_lead" ON "public"."lead_respostas" USING "btree" ("lead_id");



CREATE INDEX "idx_lead_respostas_nao_lida" ON "public"."lead_respostas" USING "btree" ("lida") WHERE (NOT "lida");



CREATE INDEX "idx_lead_respostas_recv" ON "public"."lead_respostas" USING "btree" ("recebido_em" DESC);



CREATE INDEX "idx_leads_historico_fase_lead" ON "public"."leads_historico_fase" USING "btree" ("lead_id");



CREATE INDEX "idx_leads_historico_fase_lead_id" ON "public"."leads_historico_fase" USING "btree" ("lead_id", "criado_em");



CREATE INDEX "idx_leads_lancamento" ON "public"."leads" USING "btree" ("lancamento_id");



CREATE INDEX "idx_leads_pessoa" ON "public"."leads" USING "btree" ("pessoa_id");



CREATE INDEX "idx_leads_primeiro_contato_pendente" ON "public"."leads" USING "btree" ("primeiro_contato_agendado_em") WHERE (("primeiro_contato_agendado_em" IS NOT NULL) AND ("primeiro_contato_enviado_em" IS NULL));



CREATE INDEX "idx_leads_responsavel" ON "public"."leads" USING "btree" ("responsavel_id");



CREATE INDEX "idx_leads_status" ON "public"."leads" USING "btree" ("status");



CREATE INDEX "idx_mind_conn_destino" ON "public"."mind_map_connections" USING "btree" ("no_destino_id");



CREATE INDEX "idx_mind_conn_origem" ON "public"."mind_map_connections" USING "btree" ("no_origem_id");



CREATE INDEX "idx_mind_map_connections_workspace" ON "public"."mind_map_connections" USING "btree" ("workspace");



CREATE INDEX "idx_mind_map_nodes_workspace" ON "public"."mind_map_nodes" USING "btree" ("workspace");



CREATE INDEX "idx_mind_nodes_fase" ON "public"."mind_map_nodes" USING "btree" ("fase");



CREATE INDEX "idx_mind_nodes_responsavel" ON "public"."mind_map_nodes" USING "btree" ("responsavel_id");



CREATE INDEX "idx_npa_evento_leads_pessoa" ON "public"."npa_evento_leads" USING "btree" ("pessoa_id");



CREATE INDEX "idx_npa_leads_evento" ON "public"."npa_evento_leads" USING "btree" ("npa_evento_id");



CREATE INDEX "idx_npa_leads_fase" ON "public"."npa_evento_leads" USING "btree" ("fase");



CREATE INDEX "idx_npa_leads_whatsapp" ON "public"."npa_evento_leads" USING "btree" ("whatsapp");



CREATE INDEX "idx_pagamentos_aluno" ON "public"."pagamentos" USING "btree" ("aluno_id");



CREATE INDEX "idx_pagamentos_pago_data_produto" ON "public"."pagamentos" USING "btree" ("data_pagamento", "produto", "status") WHERE ("status" = 'pago'::"text");



CREATE INDEX "idx_pagamentos_pago_mes" ON "public"."pagamentos" USING "btree" ("mes_referencia", "status") WHERE ("status" = 'pago'::"text");



CREATE INDEX "idx_pagamentos_status" ON "public"."pagamentos" USING "btree" ("status");



CREATE INDEX "idx_pagamentos_vencimento" ON "public"."pagamentos" USING "btree" ("data_vencimento");



CREATE INDEX "idx_parceiros_cliques_created" ON "public"."parceiros_cliques" USING "btree" ("created_at");



CREATE INDEX "idx_parceiros_cliques_link" ON "public"."parceiros_cliques" USING "btree" ("link_id");



CREATE INDEX "idx_parceiros_cupons_afiliado_id" ON "public"."parceiros_cupons" USING "btree" ("parceiro_afiliado_id");



CREATE INDEX "idx_parceiros_cupons_produto_id" ON "public"."parceiros_cupons" USING "btree" ("produto_id");



CREATE INDEX "idx_parceiros_entregas_arquivos_entrega" ON "public"."parceiros_entregas_arquivos" USING "btree" ("entrega_id");



CREATE INDEX "idx_parceiros_entregas_comentarios_entrega" ON "public"."parceiros_entregas_comentarios" USING "btree" ("entrega_id");



CREATE INDEX "idx_parceiros_entregas_parceiro" ON "public"."parceiros_entregas" USING "btree" ("parceiro_id");



CREATE INDEX "idx_parceiros_entregas_status" ON "public"."parceiros_entregas" USING "btree" ("status");



CREATE INDEX "idx_parceiros_links_parceiro" ON "public"."parceiros_links" USING "btree" ("parceiro_id");



CREATE INDEX "idx_parceiros_metas_parceiro" ON "public"."parceiros_metas" USING "btree" ("parceiro_id");



CREATE INDEX "idx_parceiros_metas_periodo" ON "public"."parceiros_metas" USING "btree" ("periodo_mes");



CREATE INDEX "idx_parceiros_produtos_parceiro_id" ON "public"."parceiros_produtos" USING "btree" ("parceiro_id");



CREATE INDEX "idx_parceiros_produtos_status" ON "public"."parceiros_produtos" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_parceiros_user_id" ON "public"."parceiros" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_parceiros_vendas_cupom" ON "public"."parceiros_vendas" USING "btree" ("cupom_id");



CREATE INDEX "idx_parceiros_vendas_mp_payment_id" ON "public"."parceiros_vendas" USING "btree" ("mp_payment_id");



CREATE INDEX "idx_parceiros_vendas_produto" ON "public"."parceiros_vendas" USING "btree" ("produto_id");



CREATE INDEX "idx_parceiros_vendas_status" ON "public"."parceiros_vendas" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_parceiros_vendas_syncpay_tx" ON "public"."parceiros_vendas" USING "btree" ("syncpay_transaction_id") WHERE ("syncpay_transaction_id" IS NOT NULL);



CREATE INDEX "idx_parceiros_video_metricas_data" ON "public"."parceiros_video_metricas" USING "btree" ("data_post");



CREATE INDEX "idx_parceiros_video_metricas_parceiro" ON "public"."parceiros_video_metricas" USING "btree" ("parceiro_id");



CREATE INDEX "idx_pessoa_identificadores_pessoa" ON "public"."pessoa_identificadores" USING "btree" ("pessoa_id");



CREATE INDEX "idx_pessoa_vinculos_papel" ON "public"."pessoa_vinculos" USING "btree" ("papel");



CREATE INDEX "idx_pessoa_vinculos_pessoa" ON "public"."pessoa_vinculos" USING "btree" ("pessoa_id");



CREATE INDEX "idx_pessoas_email" ON "public"."pessoas" USING "btree" ("lower"("email"));



CREATE INDEX "idx_pessoas_nome_trgm" ON "public"."pessoas" USING "gin" ("nome" "public"."gin_trgm_ops");



CREATE INDEX "idx_pessoas_telefone" ON "public"."pessoas" USING "btree" ("telefone");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_seu_numerologo_leads_pessoa" ON "public"."seu_numerologo_leads" USING "btree" ("pessoa_id");



CREATE INDEX "idx_sn_leads_status" ON "public"."seu_numerologo_leads" USING "btree" ("status");



CREATE INDEX "idx_snl_created" ON "public"."seu_numerologo_leads" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_snl_email" ON "public"."seu_numerologo_leads" USING "btree" ("email");



CREATE INDEX "idx_snl_status" ON "public"."seu_numerologo_leads" USING "btree" ("status");



CREATE INDEX "idx_tarefas_responsavel" ON "public"."tarefas" USING "btree" ("responsavel_id");



CREATE INDEX "idx_tarefas_status" ON "public"."tarefas" USING "btree" ("status");



CREATE INDEX "idx_time_comercial_campanhas_canal" ON "public"."time_comercial_campanhas" USING "btree" ("canal");



CREATE INDEX "idx_turmas_responsavel_id" ON "public"."turmas" USING "btree" ("responsavel_id");



CREATE UNIQUE INDEX "idx_whatsapp_mensagens_evolution_message_id" ON "public"."whatsapp_mensagens" USING "btree" ("evolution_message_id") WHERE ("evolution_message_id" IS NOT NULL);



CREATE INDEX "idx_whatsapp_mensagens_telefone_created" ON "public"."whatsapp_mensagens" USING "btree" ("telefone", "created_at" DESC);



CREATE INDEX "idx_whatsapp_mensagens_telefone_norm" ON "public"."whatsapp_mensagens" USING "btree" ("public"."normalizar_telefone"("telefone"));



CREATE INDEX "leads_ia_conhecimento_ativo_idx" ON "public"."leads_ia_conhecimento" USING "btree" ("ativo");



CREATE INDEX "leads_ia_conhecimento_sugestoes_status_idx" ON "public"."leads_ia_conhecimento_sugestoes" USING "btree" ("status");



CREATE INDEX "leads_ia_conversas_status_idx" ON "public"."leads_ia_conversas" USING "btree" ("status");



CREATE INDEX "leads_ia_conversas_telefone_idx" ON "public"."leads_ia_conversas" USING "btree" ("telefone");



CREATE INDEX "leads_ia_conversas_ultima_msg_idx" ON "public"."leads_ia_conversas" USING "btree" ("ultima_mensagem_em" DESC);



CREATE INDEX "leads_ia_mensagens_conversa_idx" ON "public"."leads_ia_mensagens" USING "btree" ("conversa_id", "created_at");



CREATE INDEX "leads_ia_oferta_ativa_ativo_idx" ON "public"."leads_ia_oferta_ativa" USING "btree" ("ativo");



CREATE INDEX "midia_imagens_reaproveitaveis_cliente_idx" ON "public"."midia_imagens_reaproveitaveis" USING "btree" ("cliente_id", "vezes_reaproveitado", "created_at");



CREATE INDEX "mind_map_connections_workspace_idx" ON "public"."mind_map_connections" USING "btree" ("workspace");



CREATE INDEX "mind_map_nodes_workspace_idx" ON "public"."mind_map_nodes" USING "btree" ("workspace");



CREATE INDEX "notifications_user_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "push_subscriptions_user_idx" ON "public"."push_subscriptions" USING "btree" ("user_id");



CREATE UNIQUE INDEX "ux_cobranca_ia_conversas_aluno_aberta" ON "public"."cobranca_ia_conversas" USING "btree" ("aluno_id") WHERE ("status" <> 'encerrado'::"text");



CREATE UNIQUE INDEX "ux_cobranca_logs_pagamento_template_ativo" ON "public"."cobranca_logs" USING "btree" ("pagamento_id", "template_id") WHERE ("status" = ANY (ARRAY['pendente'::"text", 'enviado'::"text"]));



CREATE UNIQUE INDEX "ux_leads_ia_conversas_lead_aberta" ON "public"."leads_ia_conversas" USING "btree" ("lead_id") WHERE ("status" <> 'encerrado'::"text");



CREATE OR REPLACE VIEW "public"."vw_alunos_financeiro" WITH ("security_invoker"='true') AS
 SELECT "a"."id",
    "a"."nome",
    "a"."status",
    "a"."turma_id",
    "a"."produto",
    "a"."forma_pagamento",
    "a"."contrato_enviado",
    "a"."contrato_assinado",
    "a"."data_matricula",
    "a"."data_inicio",
    "a"."mensalidades_pagas",
    "a"."total_mensalidades",
    COALESCE("a"."valor_mensalidade", "t"."valor_mensalidade") AS "valor_efetivo",
    "t"."nome" AS "turma_nome",
    "count"("p"."id") FILTER (WHERE ("p"."status" = 'pago'::"text")) AS "parcelas_pagas",
    "count"("p"."id") FILTER (WHERE ("p"."status" = 'atrasado'::"text")) AS "parcelas_atrasadas",
    "count"("p"."id") FILTER (WHERE ("p"."status" = 'pendente'::"text")) AS "parcelas_pendentes",
    COALESCE("sum"("p"."valor") FILTER (WHERE ("p"."status" = 'pago'::"text")), (0)::numeric) AS "total_recebido",
    COALESCE("sum"("p"."valor") FILTER (WHERE ("p"."status" = 'atrasado'::"text")), (0)::numeric) AS "total_em_atraso",
    COALESCE("sum"("p"."valor") FILTER (WHERE ("p"."status" = ANY (ARRAY['pendente'::"text", 'atrasado'::"text"]))), (0)::numeric) AS "total_em_aberto",
    (CURRENT_DATE - "min"("p"."data_vencimento") FILTER (WHERE ("p"."status" = 'atrasado'::"text"))) AS "dias_em_atraso",
    "min"("p"."data_vencimento") FILTER (WHERE ("p"."status" = ANY (ARRAY['pendente'::"text", 'atrasado'::"text"]))) AS "proxima_vencimento"
   FROM (("public"."alunos" "a"
     LEFT JOIN "public"."turmas" "t" ON (("a"."turma_id" = "t"."id")))
     LEFT JOIN "public"."pagamentos" "p" ON (("a"."id" = "p"."aluno_id")))
  GROUP BY "a"."id", "t"."nome", "t"."valor_mensalidade";



CREATE OR REPLACE VIEW "public"."vw_cfo_turmas" WITH ("security_invoker"='true') AS
 SELECT "t"."id",
    "t"."nome",
    "t"."produto",
    "t"."dia_vencimento",
    "t"."total_mensalidades",
    "t"."valor_mensalidade" AS "valor_padrao",
    COALESCE("sum"("a"."valor_mensalidade") FILTER (WHERE ("a"."status" = 'ativo'::"text")), (0)::numeric) AS "mrr_real",
    COALESCE("sum"(COALESCE("a"."valor_mensalidade", "t"."valor_mensalidade")) FILTER (WHERE ("a"."status" = 'ativo'::"text")), (0)::numeric) AS "mrr_efetivo",
    "count"("a"."id") FILTER (WHERE ("a"."status" = 'ativo'::"text")) AS "alunos_ativos",
    "count"("a"."id") FILTER (WHERE ("a"."status" = 'cancelado'::"text")) AS "alunos_cancelados",
    "count"("a"."id") FILTER (WHERE ("a"."status" = 'concluido'::"text")) AS "alunos_concluidos",
    "round"("avg"("a"."mensalidades_pagas") FILTER (WHERE ("a"."status" = 'ativo'::"text")), 1) AS "parcelas_pagas_media",
    "round"("avg"(COALESCE("a"."valor_mensalidade", "t"."valor_mensalidade")) FILTER (WHERE ("a"."status" = 'ativo'::"text")), 2) AS "ticket_medio"
   FROM ("public"."turmas" "t"
     LEFT JOIN "public"."alunos" "a" ON (("a"."turma_id" = "t"."id")))
  GROUP BY "t"."id";



CREATE OR REPLACE TRIGGER "lancamento_lead_bv" AFTER INSERT ON "public"."lancamento_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_lancamento_lead_bv"();



CREATE OR REPLACE TRIGGER "notifications_push_trigger" AFTER INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_notification_push"();



CREATE OR REPLACE TRIGGER "npa_bv_auto" AFTER INSERT OR UPDATE OF "ingresso_pago" ON "public"."npa_evento_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_npa_bv_auto"();



CREATE OR REPLACE TRIGGER "npa_pix_auto" AFTER INSERT OR UPDATE OF "pix_codigo" ON "public"."npa_evento_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_npa_pix_auto"();



CREATE OR REPLACE TRIGGER "pessoa_registrar_vinculo" AFTER INSERT ON "public"."alunos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_pessoa_registrar_vinculo"('aluno');



CREATE OR REPLACE TRIGGER "pessoa_registrar_vinculo" AFTER INSERT ON "public"."disparo_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trg_pessoa_registrar_vinculo"('lead');



CREATE OR REPLACE TRIGGER "pessoa_registrar_vinculo" AFTER INSERT ON "public"."franquia_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trg_pessoa_registrar_vinculo"('lead');



CREATE OR REPLACE TRIGGER "pessoa_registrar_vinculo" AFTER INSERT ON "public"."lancamento_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trg_pessoa_registrar_vinculo"('lead');



CREATE OR REPLACE TRIGGER "pessoa_registrar_vinculo" AFTER INSERT ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."trg_pessoa_registrar_vinculo"('lead');



CREATE OR REPLACE TRIGGER "pessoa_registrar_vinculo" AFTER INSERT ON "public"."npa_evento_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trg_pessoa_registrar_vinculo"('convidado');



CREATE OR REPLACE TRIGGER "pessoa_registrar_vinculo" AFTER INSERT ON "public"."seu_numerologo_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trg_pessoa_registrar_vinculo"('lead');



CREATE OR REPLACE TRIGGER "pessoa_vincular" BEFORE INSERT ON "public"."alunos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_pessoa_vincular"('whatsapp');



CREATE OR REPLACE TRIGGER "pessoa_vincular" BEFORE INSERT ON "public"."disparo_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trg_pessoa_vincular"('phone');



CREATE OR REPLACE TRIGGER "pessoa_vincular" BEFORE INSERT ON "public"."franquia_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trg_pessoa_vincular"('whatsapp');



CREATE OR REPLACE TRIGGER "pessoa_vincular" BEFORE INSERT ON "public"."lancamento_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trg_pessoa_vincular"('whatsapp');



CREATE OR REPLACE TRIGGER "pessoa_vincular" BEFORE INSERT ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."trg_pessoa_vincular"('whatsapp');



CREATE OR REPLACE TRIGGER "pessoa_vincular" BEFORE INSERT ON "public"."npa_evento_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trg_pessoa_vincular"('whatsapp');



CREATE OR REPLACE TRIGGER "pessoa_vincular" BEFORE INSERT ON "public"."seu_numerologo_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trg_pessoa_vincular"('whatsapp');



CREATE OR REPLACE TRIGGER "sync_mind_map_node_columns_trigger" BEFORE INSERT OR UPDATE ON "public"."mind_map_nodes" FOR EACH ROW EXECUTE FUNCTION "public"."sync_mind_map_node_columns"();



CREATE OR REPLACE TRIGGER "sync_title_trigger" BEFORE INSERT OR UPDATE ON "public"."mind_map_nodes" FOR EACH ROW EXECUTE FUNCTION "public"."sync_title"();



CREATE OR REPLACE TRIGGER "trg_alunos_updated_at" BEFORE UPDATE ON "public"."alunos" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_auto_disparo_36" AFTER INSERT OR UPDATE OF "no_grupo" ON "public"."lancamento_leads" FOR EACH ROW EXECUTE FUNCTION "public"."auto_disparo_36"();



CREATE OR REPLACE TRIGGER "trg_campanhas_updated_at" BEFORE UPDATE ON "public"."disparo_campanhas" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_funnel_configs_updated_at" BEFORE UPDATE ON "public"."funnel_configs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_funnel_messages_updated_at" BEFORE UPDATE ON "public"."funnel_messages" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_kanban_colunas_updated_at" BEFORE UPDATE ON "public"."kanban_colunas" FOR EACH ROW EXECUTE FUNCTION "public"."update_kanban_colunas_updated_at"();



CREATE OR REPLACE TRIGGER "trg_leads_historico_fase" AFTER INSERT OR UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."registrar_historico_fase_lead"();



CREATE OR REPLACE TRIGGER "trg_marcar_matriculado_lead_direto" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."marcar_matriculado_lead_direto"();



CREATE OR REPLACE TRIGGER "trg_npa_bv_email" AFTER UPDATE ON "public"."npa_evento_leads" FOR EACH ROW EXECUTE FUNCTION "public"."notify_n8n_npa_bv_email"();



CREATE OR REPLACE TRIGGER "trg_sync_lancamento_lead_time_comercial" AFTER INSERT ON "public"."lancamento_leads" FOR EACH ROW EXECUTE FUNCTION "public"."sync_lancamento_lead_to_time_comercial"();



CREATE OR REPLACE TRIGGER "trg_sync_planilha38_email_campanha" AFTER INSERT OR UPDATE OF "fase" ON "public"."lancamento_leads" FOR EACH ROW EXECUTE FUNCTION "public"."sync_planilha38_to_email_campanha"();



CREATE OR REPLACE TRIGGER "trigger_deletar_cancelada" BEFORE UPDATE ON "public"."tarefas" FOR EACH ROW EXECUTE FUNCTION "public"."deletar_tarefa_cancelada"();



CREATE OR REPLACE TRIGGER "trigger_gerar_mensalidades" AFTER INSERT ON "public"."alunos" FOR EACH ROW WHEN ((("new"."turma_id" IS NOT NULL) AND ("new"."produto" = 'psicanalise'::"text"))) EXECUTE FUNCTION "public"."gerar_mensalidades_aluno"();



CREATE OR REPLACE TRIGGER "trigger_inadimplencia" AFTER INSERT OR UPDATE ON "public"."pagamentos" FOR EACH ROW EXECUTE FUNCTION "public"."verificar_inadimplencia"();



CREATE OR REPLACE TRIGGER "trigger_log_lancamento" AFTER INSERT OR UPDATE ON "public"."lancamentos" FOR EACH ROW EXECUTE FUNCTION "public"."log_lancamento_evento"();



CREATE OR REPLACE TRIGGER "trigger_log_npa" AFTER INSERT OR UPDATE ON "public"."npa_eventos" FOR EACH ROW EXECUTE FUNCTION "public"."log_npa_evento"();



CREATE OR REPLACE TRIGGER "trigger_primeira_etapa" BEFORE INSERT ON "public"."tarefas_etapas" FOR EACH ROW EXECUTE FUNCTION "public"."desbloquear_primeira_etapa"();



CREATE OR REPLACE TRIGGER "trigger_proxima_etapa" AFTER UPDATE ON "public"."tarefas_etapas" FOR EACH ROW EXECUTE FUNCTION "public"."desbloquear_proxima_etapa"();



CREATE OR REPLACE TRIGGER "trigger_set_valor_potencial" BEFORE INSERT OR UPDATE OF "produto" ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."set_valor_potencial"();



CREATE OR REPLACE TRIGGER "trigger_sync_fase_lancamento_leads" BEFORE INSERT OR UPDATE ON "public"."lancamento_leads" FOR EACH ROW EXECUTE FUNCTION "public"."sync_fase_lancamento_leads"();



CREATE OR REPLACE TRIGGER "trigger_sync_fase_npa" BEFORE INSERT OR UPDATE ON "public"."npa_evento_leads" FOR EACH ROW EXECUTE FUNCTION "public"."sync_fase_npa_lead"();



CREATE OR REPLACE TRIGGER "trigger_sync_mensalidades" AFTER INSERT OR DELETE OR UPDATE ON "public"."pagamentos" FOR EACH ROW EXECUTE FUNCTION "public"."sync_mensalidades_pagas"();



CREATE OR REPLACE TRIGGER "trigger_tarefas_updated_at" BEFORE UPDATE ON "public"."tarefas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_verificar_concluida" AFTER UPDATE ON "public"."tarefas_etapas" FOR EACH ROW EXECUTE FUNCTION "public"."verificar_tarefa_concluida"();



CREATE OR REPLACE TRIGGER "update_conteudo_clientes_updated_at" BEFORE UPDATE ON "public"."conteudo_clientes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_conteudo_posts_updated_at" BEFORE UPDATE ON "public"."conteudo_posts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_parceiros_entregas_updated_at" BEFORE UPDATE ON "public"."parceiros_entregas" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_parceiros_links_updated_at" BEFORE UPDATE ON "public"."parceiros_links" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_parceiros_produtos_updated_at" BEFORE UPDATE ON "public"."parceiros_produtos" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_parceiros_updated_at" BEFORE UPDATE ON "public"."parceiros" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_parceiros_vendas_updated_at" BEFORE UPDATE ON "public"."parceiros_vendas" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "vigia_insert_anonimo_alunos" AFTER INSERT ON "public"."alunos" FOR EACH ROW EXECUTE FUNCTION "public"."registrar_insert_anonimo"();



CREATE OR REPLACE TRIGGER "vigia_insert_anonimo_leads" AFTER INSERT ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."registrar_insert_anonimo"();



ALTER TABLE ONLY "public"."aluno_bonus_eventos"
    ADD CONSTRAINT "aluno_bonus_eventos_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "public"."alunos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aluno_bonus_eventos"
    ADD CONSTRAINT "aluno_bonus_eventos_bonus_id_fkey" FOREIGN KEY ("bonus_id") REFERENCES "public"."bonus_tipos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aluno_bonus_eventos"
    ADD CONSTRAINT "aluno_bonus_eventos_bonus_turma_id_fkey" FOREIGN KEY ("bonus_turma_id") REFERENCES "public"."bonus_turmas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aluno_bonus_eventos"
    ADD CONSTRAINT "aluno_bonus_eventos_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aluno_observacoes"
    ADD CONSTRAINT "aluno_observacoes_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "public"."alunos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aluno_observacoes"
    ADD CONSTRAINT "aluno_observacoes_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aluno_observacoes"
    ADD CONSTRAINT "aluno_observacoes_resolvido_por_fkey" FOREIGN KEY ("resolvido_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."alunos"
    ADD CONSTRAINT "alunos_grupo_turma_confirmado_por_fkey" FOREIGN KEY ("grupo_turma_confirmado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."alunos"
    ADD CONSTRAINT "alunos_grupo_turma_id_fkey" FOREIGN KEY ("grupo_turma_id") REFERENCES "public"."turmas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."alunos"
    ADD CONSTRAINT "alunos_lancamento_id_fkey" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."alunos"
    ADD CONSTRAINT "alunos_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id");



ALTER TABLE ONLY "public"."alunos"
    ADD CONSTRAINT "alunos_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aquecimento_chips"
    ADD CONSTRAINT "aquecimento_chips_evolution_config_id_fkey" FOREIGN KEY ("evolution_config_id") REFERENCES "public"."evolution_config"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aquecimento_grupos"
    ADD CONSTRAINT "aquecimento_grupos_evolution_config_id_fkey" FOREIGN KEY ("evolution_config_id") REFERENCES "public"."evolution_config"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aquecimento_jobs"
    ADD CONSTRAINT "aquecimento_jobs_chip_destino_id_fkey" FOREIGN KEY ("chip_destino_id") REFERENCES "public"."aquecimento_chips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aquecimento_jobs"
    ADD CONSTRAINT "aquecimento_jobs_chip_origem_id_fkey" FOREIGN KEY ("chip_origem_id") REFERENCES "public"."aquecimento_chips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aquecimento_jobs"
    ADD CONSTRAINT "aquecimento_jobs_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "public"."aquecimento_grupos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aquecimento_roteiro_mensagens"
    ADD CONSTRAINT "aquecimento_roteiro_mensagens_roteiro_id_fkey" FOREIGN KEY ("roteiro_id") REFERENCES "public"."aquecimento_roteiros_dm"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aula_secreta_leads"
    ADD CONSTRAINT "aula_secreta_leads_evento_id_fkey" FOREIGN KEY ("aula_secreta_evento_id") REFERENCES "public"."aula_secreta_eventos"("id");



ALTER TABLE ONLY "public"."aula_secreta_leads"
    ADD CONSTRAINT "aula_secreta_leads_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."aula_secreta_log"
    ADD CONSTRAINT "aula_secreta_log_evento_id_fkey" FOREIGN KEY ("aula_secreta_evento_id") REFERENCES "public"."aula_secreta_eventos"("id");



ALTER TABLE ONLY "public"."bonus_turmas"
    ADD CONSTRAINT "bonus_turmas_bonus_id_fkey" FOREIGN KEY ("bonus_id") REFERENCES "public"."bonus_tipos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_leituras"
    ADD CONSTRAINT "chat_leituras_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cobranca_config"
    ADD CONSTRAINT "cobranca_config_produto_slug_fkey" FOREIGN KEY ("produto_slug") REFERENCES "public"."produtos"("slug") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cobranca_ia_conversas"
    ADD CONSTRAINT "cobranca_ia_conversas_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "public"."alunos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cobranca_ia_conversas"
    ADD CONSTRAINT "cobranca_ia_conversas_cobranca_log_id_fkey" FOREIGN KEY ("cobranca_log_id") REFERENCES "public"."cobranca_logs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cobranca_ia_conversas"
    ADD CONSTRAINT "cobranca_ia_conversas_pagamento_id_fkey" FOREIGN KEY ("pagamento_id") REFERENCES "public"."pagamentos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cobranca_ia_conversas"
    ADD CONSTRAINT "cobranca_ia_conversas_resolvido_por_fkey" FOREIGN KEY ("resolvido_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cobranca_ia_mensagens"
    ADD CONSTRAINT "cobranca_ia_mensagens_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "public"."cobranca_ia_conversas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cobranca_logs"
    ADD CONSTRAINT "cobranca_logs_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "public"."alunos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cobranca_logs"
    ADD CONSTRAINT "cobranca_logs_enviado_por_fkey" FOREIGN KEY ("enviado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cobranca_logs"
    ADD CONSTRAINT "cobranca_logs_pagamento_id_fkey" FOREIGN KEY ("pagamento_id") REFERENCES "public"."pagamentos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cobranca_logs"
    ADD CONSTRAINT "cobranca_logs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."cobranca_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cobranca_turmas_ativas"
    ADD CONSTRAINT "cobranca_turmas_ativas_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conteudo_calendario"
    ADD CONSTRAINT "conteudo_calendario_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."conteudo_clientes"("id");



ALTER TABLE ONLY "public"."conteudo_calendario"
    ADD CONSTRAINT "conteudo_calendario_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."conteudo_calendario"
    ADD CONSTRAINT "conteudo_calendario_produto_slug_fkey" FOREIGN KEY ("produto_slug") REFERENCES "public"."produtos"("slug");



ALTER TABLE ONLY "public"."conteudo_posts"
    ADD CONSTRAINT "conteudo_posts_aprovado_por_fkey" FOREIGN KEY ("aprovado_por") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."conteudo_posts"
    ADD CONSTRAINT "conteudo_posts_blueprint_id_fkey" FOREIGN KEY ("blueprint_id") REFERENCES "public"."equipe_11ds_blueprints"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conteudo_posts"
    ADD CONSTRAINT "conteudo_posts_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."conteudo_clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."disparo_campanhas"
    ADD CONSTRAINT "disparo_campanhas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."disparo_leads"
    ADD CONSTRAINT "disparo_leads_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "public"."disparo_campanhas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."disparo_leads"
    ADD CONSTRAINT "disparo_leads_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id");



ALTER TABLE ONLY "public"."equipe_11ds_agentes"
    ADD CONSTRAINT "equipe_11ds_agentes_time_id_fkey" FOREIGN KEY ("time_id") REFERENCES "public"."equipe_11ds_times"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipe_11ds_blueprints"
    ADD CONSTRAINT "equipe_11ds_blueprints_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."conteudo_clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipe_11ds_blueprints"
    ADD CONSTRAINT "equipe_11ds_blueprints_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipe_11ds_blueprints"
    ADD CONSTRAINT "equipe_11ds_blueprints_substitui_id_fkey" FOREIGN KEY ("substitui_id") REFERENCES "public"."equipe_11ds_blueprints"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipe_11ds_chat_acoes"
    ADD CONSTRAINT "equipe_11ds_chat_acoes_agente_id_fkey" FOREIGN KEY ("agente_id") REFERENCES "public"."equipe_11ds_agentes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipe_11ds_chat_acoes"
    ADD CONSTRAINT "equipe_11ds_chat_acoes_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipe_11ds_chat_mensagens"
    ADD CONSTRAINT "equipe_11ds_chat_mensagens_acao_id_fkey" FOREIGN KEY ("acao_id") REFERENCES "public"."equipe_11ds_chat_acoes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipe_11ds_chat_mensagens"
    ADD CONSTRAINT "equipe_11ds_chat_mensagens_agente_id_fkey" FOREIGN KEY ("agente_id") REFERENCES "public"."equipe_11ds_agentes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipe_11ds_chat_mensagens"
    ADD CONSTRAINT "equipe_11ds_chat_mensagens_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "public"."equipe_11ds_planos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipe_11ds_chat_mensagens"
    ADD CONSTRAINT "equipe_11ds_chat_mensagens_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipe_11ds_ferramenta_chamadas"
    ADD CONSTRAINT "equipe_11ds_ferramenta_chamadas_etapa_id_fkey" FOREIGN KEY ("etapa_id") REFERENCES "public"."equipe_11ds_plano_etapas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipe_11ds_ferramenta_chamadas"
    ADD CONSTRAINT "equipe_11ds_ferramenta_chamadas_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "public"."equipe_11ds_planos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipe_11ds_memorias"
    ADD CONSTRAINT "equipe_11ds_memorias_agente_id_fkey" FOREIGN KEY ("agente_id") REFERENCES "public"."equipe_11ds_agentes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipe_11ds_memorias"
    ADD CONSTRAINT "equipe_11ds_memorias_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."conteudo_clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipe_11ds_memorias"
    ADD CONSTRAINT "equipe_11ds_memorias_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "public"."equipe_11ds_planos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipe_11ds_memorias"
    ADD CONSTRAINT "equipe_11ds_memorias_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipe_11ds_memorias"
    ADD CONSTRAINT "equipe_11ds_memorias_substitui_id_fkey" FOREIGN KEY ("substitui_id") REFERENCES "public"."equipe_11ds_memorias"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipe_11ds_mensagens"
    ADD CONSTRAINT "equipe_11ds_mensagens_agente_id_fkey" FOREIGN KEY ("agente_id") REFERENCES "public"."equipe_11ds_agentes"("id");



ALTER TABLE ONLY "public"."equipe_11ds_mensagens"
    ADD CONSTRAINT "equipe_11ds_mensagens_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "public"."equipe_11ds_tarefas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipe_11ds_plano_etapas"
    ADD CONSTRAINT "equipe_11ds_plano_etapas_agente_id_fkey" FOREIGN KEY ("agente_id") REFERENCES "public"."equipe_11ds_agentes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipe_11ds_plano_etapas"
    ADD CONSTRAINT "equipe_11ds_plano_etapas_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "public"."equipe_11ds_planos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipe_11ds_planos"
    ADD CONSTRAINT "equipe_11ds_planos_agente_responsavel_id_fkey" FOREIGN KEY ("agente_responsavel_id") REFERENCES "public"."equipe_11ds_agentes"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."equipe_11ds_planos"
    ADD CONSTRAINT "equipe_11ds_planos_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipe_11ds_recorrentes"
    ADD CONSTRAINT "equipe_11ds_recorrentes_agente_id_fkey" FOREIGN KEY ("agente_id") REFERENCES "public"."equipe_11ds_agentes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipe_11ds_recorrentes"
    ADD CONSTRAINT "equipe_11ds_recorrentes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."conteudo_clientes"("id");



ALTER TABLE ONLY "public"."equipe_11ds_recorrentes"
    ADD CONSTRAINT "equipe_11ds_recorrentes_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."equipe_11ds_tarefas"
    ADD CONSTRAINT "equipe_11ds_tarefas_agente_id_fkey" FOREIGN KEY ("agente_id") REFERENCES "public"."equipe_11ds_agentes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipe_11ds_tarefas"
    ADD CONSTRAINT "equipe_11ds_tarefas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."conteudo_clientes"("id");



ALTER TABLE ONLY "public"."equipe_11ds_tarefas"
    ADD CONSTRAINT "equipe_11ds_tarefas_conteudo_post_id_fkey" FOREIGN KEY ("conteudo_post_id") REFERENCES "public"."conteudo_posts"("id");



ALTER TABLE ONLY "public"."equipe_11ds_tarefas"
    ADD CONSTRAINT "equipe_11ds_tarefas_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."equipe_11ds_tarefas"
    ADD CONSTRAINT "equipe_11ds_tarefas_recorrente_id_fkey" FOREIGN KEY ("recorrente_id") REFERENCES "public"."equipe_11ds_recorrentes"("id");



ALTER TABLE ONLY "public"."eventos_calendario"
    ADD CONSTRAINT "eventos_calendario_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."evolution_conexao_eventos"
    ADD CONSTRAINT "evolution_conexao_eventos_evolution_config_id_fkey" FOREIGN KEY ("evolution_config_id") REFERENCES "public"."evolution_config"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."franquia_leads"
    ADD CONSTRAINT "franquia_leads_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id");



ALTER TABLE ONLY "public"."franquia_leads"
    ADD CONSTRAINT "franquia_leads_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."funnel_poll_respostas"
    ADD CONSTRAINT "funnel_poll_respostas_funnel_message_id_fkey" FOREIGN KEY ("funnel_message_id") REFERENCES "public"."funnel_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."grupo_add_jobs"
    ADD CONSTRAINT "grupo_add_jobs_lancamento_id_fkey" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."grupo_add_jobs"
    ADD CONSTRAINT "grupo_add_jobs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."lancamento_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_colunas"
    ADD CONSTRAINT "kanban_colunas_aula_secreta_evento_id_fkey" FOREIGN KEY ("aula_secreta_evento_id") REFERENCES "public"."aula_secreta_eventos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_colunas"
    ADD CONSTRAINT "kanban_colunas_lancamento_id_fkey" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_colunas"
    ADD CONSTRAINT "kanban_colunas_leads_quadro_id_fkey" FOREIGN KEY ("leads_quadro_id") REFERENCES "public"."leads_quadros"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kanban_colunas"
    ADD CONSTRAINT "kanban_colunas_npa_evento_id_fkey" FOREIGN KEY ("npa_evento_id") REFERENCES "public"."npa_eventos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lancamento_campanhas"
    ADD CONSTRAINT "lancamento_campanhas_lancamento_id_fkey" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lancamento_eventos"
    ADD CONSTRAINT "lancamento_eventos_lancamento_id_fkey" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lancamento_leads"
    ADD CONSTRAINT "lancamento_leads_lancamento_id_fkey" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lancamento_leads"
    ADD CONSTRAINT "lancamento_leads_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id");



ALTER TABLE ONLY "public"."lancamento_leads"
    ADD CONSTRAINT "lancamento_leads_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."lancamentos"
    ADD CONSTRAINT "lancamentos_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "public"."responsaveis"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lancamentos"
    ADD CONSTRAINT "lancamentos_turma_destino_id_fkey" FOREIGN KEY ("turma_destino_id") REFERENCES "public"."turmas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_aquecimento_campanhas"
    ADD CONSTRAINT "lead_aquecimento_campanhas_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_aquecimento_leads"
    ADD CONSTRAINT "lead_aquecimento_leads_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "public"."lead_aquecimento_campanhas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_aquecimento_leads"
    ADD CONSTRAINT "lead_aquecimento_leads_evolution_config_id_envio_fkey" FOREIGN KEY ("evolution_config_id_envio") REFERENCES "public"."evolution_config"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_aquecimento_leads"
    ADD CONSTRAINT "lead_aquecimento_leads_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."lead_aquecimento_vendedores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_aquecimento_vendedores"
    ADD CONSTRAINT "lead_aquecimento_vendedores_evolution_config_id_fkey" FOREIGN KEY ("evolution_config_id") REFERENCES "public"."evolution_config"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_aquecimento_vendedores"
    ADD CONSTRAINT "lead_aquecimento_vendedores_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_cartas_usadas"
    ADD CONSTRAINT "lead_cartas_usadas_carta_id_fkey" FOREIGN KEY ("carta_id") REFERENCES "public"."leads_cartas_negociacao"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_cartas_usadas"
    ADD CONSTRAINT "lead_cartas_usadas_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_cartas_usadas"
    ADD CONSTRAINT "lead_cartas_usadas_usado_por_fkey" FOREIGN KEY ("usado_por") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_respostas"
    ADD CONSTRAINT "lead_respostas_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."lancamento_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "public"."time_comercial_campanhas"("id");



ALTER TABLE ONLY "public"."leads_historico_fase"
    ADD CONSTRAINT "leads_historico_fase_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads_ia_conhecimento"
    ADD CONSTRAINT "leads_ia_conhecimento_origem_sugestao_id_fkey" FOREIGN KEY ("origem_sugestao_id") REFERENCES "public"."leads_ia_conhecimento_sugestoes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads_ia_conhecimento_sugestoes"
    ADD CONSTRAINT "leads_ia_conhecimento_sugestoes_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "public"."leads_ia_conversas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads_ia_conhecimento_sugestoes"
    ADD CONSTRAINT "leads_ia_conhecimento_sugestoes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads_ia_conhecimento_sugestoes"
    ADD CONSTRAINT "leads_ia_conhecimento_sugestoes_revisado_por_fkey" FOREIGN KEY ("revisado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads_ia_conversas"
    ADD CONSTRAINT "leads_ia_conversas_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads_ia_mensagens"
    ADD CONSTRAINT "leads_ia_mensagens_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "public"."leads_ia_conversas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_lancamento_id_fkey" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id");



ALTER TABLE ONLY "public"."leads_quadro_cards"
    ADD CONSTRAINT "leads_quadro_cards_coluna_id_fkey" FOREIGN KEY ("coluna_id") REFERENCES "public"."kanban_colunas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads_quadro_cards"
    ADD CONSTRAINT "leads_quadro_cards_quadro_id_fkey" FOREIGN KEY ("quadro_id") REFERENCES "public"."leads_quadros"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id");



ALTER TABLE ONLY "public"."midia_imagens_reaproveitaveis"
    ADD CONSTRAINT "midia_imagens_reaproveitaveis_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."conteudo_clientes"("id");



ALTER TABLE ONLY "public"."mind_map_connections"
    ADD CONSTRAINT "mind_map_connections_destino_id_fkey" FOREIGN KEY ("destino_id") REFERENCES "public"."mind_map_nodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mind_map_connections"
    ADD CONSTRAINT "mind_map_connections_no_destino_id_fkey" FOREIGN KEY ("no_destino_id") REFERENCES "public"."mind_map_nodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mind_map_connections"
    ADD CONSTRAINT "mind_map_connections_no_origem_id_fkey" FOREIGN KEY ("no_origem_id") REFERENCES "public"."mind_map_nodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mind_map_connections"
    ADD CONSTRAINT "mind_map_connections_origem_id_fkey" FOREIGN KEY ("origem_id") REFERENCES "public"."mind_map_nodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mind_map_connections"
    ADD CONSTRAINT "mind_map_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."mind_map_nodes"
    ADD CONSTRAINT "mind_map_nodes_pai_id_fkey" FOREIGN KEY ("pai_id") REFERENCES "public"."mind_map_nodes"("id");



ALTER TABLE ONLY "public"."mind_map_nodes"
    ADD CONSTRAINT "mind_map_nodes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."mind_map_pages"
    ADD CONSTRAINT "mind_map_pages_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."npa_evento_leads"
    ADD CONSTRAINT "npa_evento_leads_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id");



ALTER TABLE ONLY "public"."npa_eventos_log"
    ADD CONSTRAINT "npa_eventos_log_npa_evento_id_fkey" FOREIGN KEY ("npa_evento_id") REFERENCES "public"."npa_eventos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."npa_eventos"
    ADD CONSTRAINT "npa_eventos_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "public"."responsaveis"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."npa_eventos"
    ADD CONSTRAINT "npa_eventos_turma_destino_id_fkey" FOREIGN KEY ("turma_destino_id") REFERENCES "public"."turmas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."npa_evento_leads"
    ADD CONSTRAINT "npa_leads_npa_evento_id_fkey" FOREIGN KEY ("npa_evento_id") REFERENCES "public"."npa_eventos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."npa_evento_leads"
    ADD CONSTRAINT "npa_leads_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."pagamentos"
    ADD CONSTRAINT "pagamentos_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "public"."alunos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pagamentos"
    ADD CONSTRAINT "pagamentos_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parceiros_cliques"
    ADD CONSTRAINT "parceiros_cliques_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."parceiros_links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parceiros_cupons"
    ADD CONSTRAINT "parceiros_cupons_parceiro_afiliado_id_fkey" FOREIGN KEY ("parceiro_afiliado_id") REFERENCES "public"."parceiros"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parceiros_cupons"
    ADD CONSTRAINT "parceiros_cupons_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "public"."parceiros_produtos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parceiros_entregas_arquivos"
    ADD CONSTRAINT "parceiros_entregas_arquivos_entrega_id_fkey" FOREIGN KEY ("entrega_id") REFERENCES "public"."parceiros_entregas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parceiros_entregas_arquivos"
    ADD CONSTRAINT "parceiros_entregas_arquivos_enviado_por_fkey" FOREIGN KEY ("enviado_por") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."parceiros_entregas_comentarios"
    ADD CONSTRAINT "parceiros_entregas_comentarios_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."parceiros_entregas_comentarios"
    ADD CONSTRAINT "parceiros_entregas_comentarios_entrega_id_fkey" FOREIGN KEY ("entrega_id") REFERENCES "public"."parceiros_entregas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parceiros_entregas"
    ADD CONSTRAINT "parceiros_entregas_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."parceiros_entregas"
    ADD CONSTRAINT "parceiros_entregas_parceiro_id_fkey" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parceiros_entregas"
    ADD CONSTRAINT "parceiros_entregas_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "public"."parceiros_produtos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parceiros_links"
    ADD CONSTRAINT "parceiros_links_parceiro_id_fkey" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parceiros_links"
    ADD CONSTRAINT "parceiros_links_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "public"."parceiros_produtos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parceiros_metas"
    ADD CONSTRAINT "parceiros_metas_parceiro_id_fkey" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parceiros_metas"
    ADD CONSTRAINT "parceiros_metas_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "public"."parceiros_produtos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parceiros_produtos"
    ADD CONSTRAINT "parceiros_produtos_aprovado_por_fkey" FOREIGN KEY ("aprovado_por") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."parceiros_produtos"
    ADD CONSTRAINT "parceiros_produtos_parceiro_id_fkey" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parceiros"
    ADD CONSTRAINT "parceiros_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parceiros_vendas"
    ADD CONSTRAINT "parceiros_vendas_cupom_id_fkey" FOREIGN KEY ("cupom_id") REFERENCES "public"."parceiros_cupons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parceiros_vendas"
    ADD CONSTRAINT "parceiros_vendas_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "public"."parceiros_produtos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parceiros_video_metricas"
    ADD CONSTRAINT "parceiros_video_metricas_parceiro_id_fkey" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parceiros_video_metricas"
    ADD CONSTRAINT "parceiros_video_metricas_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "public"."parceiros_produtos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_method_rates"
    ADD CONSTRAINT "payment_method_rates_produto_slug_fkey" FOREIGN KEY ("produto_slug") REFERENCES "public"."produtos"("slug") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pessoa_identificadores"
    ADD CONSTRAINT "pessoa_identificadores_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pessoa_vinculos"
    ADD CONSTRAINT "pessoa_vinculos_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pessoas"
    ADD CONSTRAINT "pessoas_mesclada_em_fkey" FOREIGN KEY ("mesclada_em") REFERENCES "public"."pessoas"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."responsaveis"
    ADD CONSTRAINT "responsaveis_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."role_permissoes"
    ADD CONSTRAINT "role_permissoes_recurso_fkey" FOREIGN KEY ("recurso") REFERENCES "public"."app_recursos"("chave") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seu_numerologo_leads"
    ADD CONSTRAINT "seu_numerologo_leads_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id");



ALTER TABLE ONLY "public"."subtarefas"
    ADD CONSTRAINT "subtarefas_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sv_campanhas"
    ADD CONSTRAINT "sv_campanhas_evolution_id_fkey" FOREIGN KEY ("evolution_id") REFERENCES "public"."sv_evolution_configs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sv_lead_mensagens"
    ADD CONSTRAINT "sv_lead_mensagens_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "public"."sv_campanhas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sv_lead_mensagens"
    ADD CONSTRAINT "sv_lead_mensagens_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."sv_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sv_leads"
    ADD CONSTRAINT "sv_leads_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "public"."sv_campanhas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tarefas_checklists"
    ADD CONSTRAINT "tarefas_checklists_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tarefas_comentarios"
    ADD CONSTRAINT "tarefas_comentarios_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tarefas_comentarios"
    ADD CONSTRAINT "tarefas_comentarios_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tarefas_etapas"
    ADD CONSTRAINT "tarefas_etapas_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."turma_responsaveis"
    ADD CONSTRAINT "turma_responsaveis_responsavel_fk" FOREIGN KEY ("user_id") REFERENCES "public"."responsaveis"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."turma_responsaveis"
    ADD CONSTRAINT "turma_responsaveis_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."turmas"
    ADD CONSTRAINT "turmas_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "public"."responsaveis"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_access_permissions"
    ADD CONSTRAINT "user_access_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_permissao_override"
    ADD CONSTRAINT "user_permissao_override_recurso_fkey" FOREIGN KEY ("recurso") REFERENCES "public"."app_recursos"("chave") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_permissao_override"
    ADD CONSTRAINT "user_permissao_override_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_assets"
    ADD CONSTRAINT "video_assets_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."video_jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_jobs"
    ADD CONSTRAINT "video_jobs_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."video_jobs"
    ADD CONSTRAINT "video_jobs_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "public"."video_scripts"("id");



ALTER TABLE ONLY "public"."video_scripts"
    ADD CONSTRAINT "video_scripts_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."conteudo_clientes"("id");



ALTER TABLE ONLY "public"."video_scripts"
    ADD CONSTRAINT "video_scripts_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."video_scripts"
    ADD CONSTRAINT "video_scripts_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "public"."equipe_11ds_tarefas"("id");



CREATE POLICY "Admin can manage parceiros" ON "public"."parceiros" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can manage parceiros_cupons" ON "public"."parceiros_cupons" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can manage parceiros_entregas" ON "public"."parceiros_entregas" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can manage parceiros_entregas_arquivos" ON "public"."parceiros_entregas_arquivos" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can manage parceiros_entregas_comentarios" ON "public"."parceiros_entregas_comentarios" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can manage parceiros_metas" ON "public"."parceiros_metas" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can manage parceiros_produtos" ON "public"."parceiros_produtos" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can manage parceiros_vendas" ON "public"."parceiros_vendas" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can manage parceiros_video_metricas" ON "public"."parceiros_video_metricas" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can view all parceiros" ON "public"."parceiros" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can view all parceiros_cupons" ON "public"."parceiros_cupons" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can view all parceiros_entregas" ON "public"."parceiros_entregas" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can view all parceiros_entregas_arquivos" ON "public"."parceiros_entregas_arquivos" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can view all parceiros_entregas_comentarios" ON "public"."parceiros_entregas_comentarios" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can view all parceiros_metas" ON "public"."parceiros_metas" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can view all parceiros_produtos" ON "public"."parceiros_produtos" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can view all parceiros_vendas" ON "public"."parceiros_vendas" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can view all parceiros_video_metricas" ON "public"."parceiros_video_metricas" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Anon can log clicks" ON "public"."parceiros_cliques" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Anon can resolve active links" ON "public"."parceiros_links" FOR SELECT TO "anon" USING (("ativo" = true));



CREATE POLICY "Insert notifications" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Parceira can insert own entregas" ON "public"."parceiros_entregas" FOR INSERT TO "authenticated" WITH CHECK (("parceiro_id" IN ( SELECT "parceiros"."id"
   FROM "public"."parceiros"
  WHERE ("parceiros"."user_id" = "auth"."uid"()))));



CREATE POLICY "Parceira can insert own entregas_arquivos" ON "public"."parceiros_entregas_arquivos" FOR INSERT TO "authenticated" WITH CHECK (("entrega_id" IN ( SELECT "e"."id"
   FROM ("public"."parceiros_entregas" "e"
     JOIN "public"."parceiros" "p" ON (("p"."id" = "e"."parceiro_id")))
  WHERE ("p"."user_id" = "auth"."uid"()))));



CREATE POLICY "Parceira can insert own entregas_comentarios" ON "public"."parceiros_entregas_comentarios" FOR INSERT TO "authenticated" WITH CHECK (("entrega_id" IN ( SELECT "e"."id"
   FROM ("public"."parceiros_entregas" "e"
     JOIN "public"."parceiros" "p" ON (("p"."id" = "e"."parceiro_id")))
  WHERE ("p"."user_id" = "auth"."uid"()))));



CREATE POLICY "Parceira can update own entregas" ON "public"."parceiros_entregas" FOR UPDATE TO "authenticated" USING (("parceiro_id" IN ( SELECT "parceiros"."id"
   FROM "public"."parceiros"
  WHERE ("parceiros"."user_id" = "auth"."uid"())))) WITH CHECK (("parceiro_id" IN ( SELECT "parceiros"."id"
   FROM "public"."parceiros"
  WHERE ("parceiros"."user_id" = "auth"."uid"()))));



CREATE POLICY "Parceira can view own cupons como afiliada" ON "public"."parceiros_cupons" FOR SELECT TO "authenticated" USING (("parceiro_afiliado_id" IN ( SELECT "parceiros"."id"
   FROM "public"."parceiros"
  WHERE ("parceiros"."user_id" = "auth"."uid"()))));



CREATE POLICY "Parceira can view own entregas" ON "public"."parceiros_entregas" FOR SELECT TO "authenticated" USING (("parceiro_id" IN ( SELECT "parceiros"."id"
   FROM "public"."parceiros"
  WHERE ("parceiros"."user_id" = "auth"."uid"()))));



CREATE POLICY "Parceira can view own entregas_arquivos" ON "public"."parceiros_entregas_arquivos" FOR SELECT TO "authenticated" USING (("entrega_id" IN ( SELECT "e"."id"
   FROM ("public"."parceiros_entregas" "e"
     JOIN "public"."parceiros" "p" ON (("p"."id" = "e"."parceiro_id")))
  WHERE ("p"."user_id" = "auth"."uid"()))));



CREATE POLICY "Parceira can view own entregas_comentarios" ON "public"."parceiros_entregas_comentarios" FOR SELECT TO "authenticated" USING (("entrega_id" IN ( SELECT "e"."id"
   FROM ("public"."parceiros_entregas" "e"
     JOIN "public"."parceiros" "p" ON (("p"."id" = "e"."parceiro_id")))
  WHERE ("p"."user_id" = "auth"."uid"()))));



CREATE POLICY "Parceira can view own metas" ON "public"."parceiros_metas" FOR SELECT TO "authenticated" USING (("parceiro_id" IN ( SELECT "parceiros"."id"
   FROM "public"."parceiros"
  WHERE ("parceiros"."user_id" = "auth"."uid"()))));



CREATE POLICY "Parceira can view own produtos" ON "public"."parceiros_produtos" FOR SELECT TO "authenticated" USING (("parceiro_id" IN ( SELECT "parceiros"."id"
   FROM "public"."parceiros"
  WHERE ("parceiros"."user_id" = "auth"."uid"()))));



CREATE POLICY "Parceira can view own row" ON "public"."parceiros" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Parceira can view own video_metricas" ON "public"."parceiros_video_metricas" FOR SELECT TO "authenticated" USING (("parceiro_id" IN ( SELECT "parceiros"."id"
   FROM "public"."parceiros"
  WHERE ("parceiros"."user_id" = "auth"."uid"()))));



CREATE POLICY "Parceira can view vendas as afiliada" ON "public"."parceiros_vendas" FOR SELECT TO "authenticated" USING (("cupom_id" IN ( SELECT "pc"."id"
   FROM ("public"."parceiros_cupons" "pc"
     JOIN "public"."parceiros" "p" ON (("p"."id" = "pc"."parceiro_afiliado_id")))
  WHERE ("p"."user_id" = "auth"."uid"()))));



CREATE POLICY "Parceira can view vendas of own produto" ON "public"."parceiros_vendas" FOR SELECT TO "authenticated" USING (("produto_id" IN ( SELECT "pp"."id"
   FROM ("public"."parceiros_produtos" "pp"
     JOIN "public"."parceiros" "p" ON (("p"."id" = "pp"."parceiro_id")))
  WHERE ("p"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view their agent chat actions" ON "public"."equipe_11ds_chat_acoes" FOR SELECT TO "authenticated" USING (("solicitante_id" = "auth"."uid"()));



CREATE POLICY "Users can view their agent chat messages" ON "public"."equipe_11ds_chat_mensagens" FOR SELECT TO "authenticated" USING (("solicitante_id" = "auth"."uid"()));



CREATE POLICY "Users can view their memories" ON "public"."equipe_11ds_memorias" FOR SELECT TO "authenticated" USING (("solicitante_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view their plan steps" ON "public"."equipe_11ds_plano_etapas" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."equipe_11ds_planos" "p"
  WHERE (("p"."id" = "equipe_11ds_plano_etapas"."plano_id") AND ("p"."solicitante_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can view their plans" ON "public"."equipe_11ds_planos" FOR SELECT TO "authenticated" USING (("solicitante_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view their tool calls" ON "public"."equipe_11ds_ferramenta_chamadas" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."equipe_11ds_planos" "p"
  WHERE (("p"."id" = "equipe_11ds_ferramenta_chamadas"."plano_id") AND ("p"."solicitante_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users manage own chat_leituras" ON "public"."chat_leituras" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users manage own push subscriptions" ON "public"."push_subscriptions" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users update own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users view own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "allow read cursos" ON "public"."cursos" FOR SELECT USING (true);



CREATE POLICY "allow read fontes" ON "public"."fontes" FOR SELECT USING (true);



ALTER TABLE "public"."aluno_bonus_eventos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aluno_bonus_eventos_apaga" ON "public"."aluno_bonus_eventos" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('alunos'::"text", 'ver'::"text") AND "public"."tem_permissao"('alunos'::"text", 'editar'::"text")));



CREATE POLICY "aluno_bonus_eventos_atualiza" ON "public"."aluno_bonus_eventos" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('alunos'::"text", 'ver'::"text") AND "public"."tem_permissao"('alunos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('alunos'::"text", 'ver'::"text") AND "public"."tem_permissao"('alunos'::"text", 'editar'::"text")));



CREATE POLICY "aluno_bonus_eventos_escreve" ON "public"."aluno_bonus_eventos" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('alunos'::"text", 'ver'::"text") AND "public"."tem_permissao"('alunos'::"text", 'editar'::"text")));



CREATE POLICY "aluno_bonus_eventos_ver" ON "public"."aluno_bonus_eventos" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."alunos" "a"
  WHERE (("a"."id" = "aluno_bonus_eventos"."aluno_id") AND "public"."tem_permissao"('alunos'::"text", 'ver'::"text") AND ("public"."tem_permissao"('alunos'::"text", 'ver_todos'::"text") OR (("a"."turma_id")::"text" = ANY ("public"."turmas_financeiro_permitidas"())))))));



ALTER TABLE "public"."aluno_observacoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aluno_observacoes_apaga" ON "public"."aluno_observacoes" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('alunos'::"text", 'ver'::"text") AND "public"."tem_permissao"('alunos'::"text", 'editar'::"text")));



CREATE POLICY "aluno_observacoes_atualiza" ON "public"."aluno_observacoes" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('alunos'::"text", 'ver'::"text") AND "public"."tem_permissao"('alunos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('alunos'::"text", 'ver'::"text") AND "public"."tem_permissao"('alunos'::"text", 'editar'::"text")));



CREATE POLICY "aluno_observacoes_escreve" ON "public"."aluno_observacoes" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('alunos'::"text", 'ver'::"text") AND "public"."tem_permissao"('alunos'::"text", 'editar'::"text")));



CREATE POLICY "aluno_observacoes_ver" ON "public"."aluno_observacoes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."alunos" "a"
  WHERE (("a"."id" = "aluno_observacoes"."aluno_id") AND "public"."tem_permissao"('alunos'::"text", 'ver'::"text") AND ("public"."tem_permissao"('alunos'::"text", 'ver_todos'::"text") OR (("a"."turma_id")::"text" = ANY ("public"."turmas_financeiro_permitidas"())))))));



ALTER TABLE "public"."alunos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "alunos_apagar" ON "public"."alunos" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('alunos'::"text", 'ver'::"text") AND "public"."tem_permissao"('alunos'::"text", 'excluir'::"text") AND ("public"."tem_permissao"('alunos'::"text", 'ver_todos'::"text") OR (("turma_id")::"text" = ANY ("public"."turmas_financeiro_permitidas"())))));



CREATE POLICY "alunos_atualizar" ON "public"."alunos" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('alunos'::"text", 'ver'::"text") AND "public"."tem_permissao"('alunos'::"text", 'editar'::"text") AND ("public"."tem_permissao"('alunos'::"text", 'ver_todos'::"text") OR (("turma_id")::"text" = ANY ("public"."turmas_financeiro_permitidas"()))))) WITH CHECK (("public"."tem_permissao"('alunos'::"text", 'ver'::"text") AND "public"."tem_permissao"('alunos'::"text", 'editar'::"text")));



CREATE POLICY "alunos_inserir" ON "public"."alunos" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('alunos'::"text", 'ver'::"text") AND "public"."tem_permissao"('alunos'::"text", 'editar'::"text")));



CREATE POLICY "alunos_ver" ON "public"."alunos" FOR SELECT TO "authenticated" USING (("public"."tem_permissao"('alunos'::"text", 'ver'::"text") AND ("public"."tem_permissao"('alunos'::"text", 'ver_todos'::"text") OR (("turma_id")::"text" = ANY ("public"."turmas_financeiro_permitidas"())))));



CREATE POLICY "anon pode inserir leads" ON "public"."idm_quiz_leads" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "anon_insert_alunos_matricula" ON "public"."alunos" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "anon_insert_leads_matricula" ON "public"."leads" FOR INSERT TO "anon" WITH CHECK (true);



ALTER TABLE "public"."anon_insert_watch" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anon_insert_watch_admin_le" ON "public"."anon_insert_watch" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



ALTER TABLE "public"."app_recursos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_recursos_admin_escreve" ON "public"."app_recursos" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "app_recursos_logado_le" ON "public"."app_recursos" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."aquecimento_chips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aquecimento_chips_delete" ON "public"."aquecimento_chips" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_chips_inserir" ON "public"."aquecimento_chips" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_chips_update" ON "public"."aquecimento_chips" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_chips_ver" ON "public"."aquecimento_chips" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text"));



ALTER TABLE "public"."aquecimento_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aquecimento_config_delete" ON "public"."aquecimento_config" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_config_inserir" ON "public"."aquecimento_config" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_config_update" ON "public"."aquecimento_config" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_config_ver" ON "public"."aquecimento_config" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text"));



ALTER TABLE "public"."aquecimento_grupos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aquecimento_grupos_delete" ON "public"."aquecimento_grupos" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_grupos_inserir" ON "public"."aquecimento_grupos" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_grupos_update" ON "public"."aquecimento_grupos" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_grupos_ver" ON "public"."aquecimento_grupos" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text"));



ALTER TABLE "public"."aquecimento_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aquecimento_jobs_delete" ON "public"."aquecimento_jobs" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_jobs_inserir" ON "public"."aquecimento_jobs" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_jobs_update" ON "public"."aquecimento_jobs" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_jobs_ver" ON "public"."aquecimento_jobs" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text"));



ALTER TABLE "public"."aquecimento_mensagens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aquecimento_mensagens_delete" ON "public"."aquecimento_mensagens" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_mensagens_inserir" ON "public"."aquecimento_mensagens" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_mensagens_update" ON "public"."aquecimento_mensagens" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_mensagens_ver" ON "public"."aquecimento_mensagens" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text"));



ALTER TABLE "public"."aquecimento_roteiro_mensagens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aquecimento_roteiro_mensagens_delete" ON "public"."aquecimento_roteiro_mensagens" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_roteiro_mensagens_inserir" ON "public"."aquecimento_roteiro_mensagens" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_roteiro_mensagens_update" ON "public"."aquecimento_roteiro_mensagens" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_roteiro_mensagens_ver" ON "public"."aquecimento_roteiro_mensagens" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text"));



ALTER TABLE "public"."aquecimento_roteiros_dm" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aquecimento_roteiros_dm_delete" ON "public"."aquecimento_roteiros_dm" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_roteiros_dm_inserir" ON "public"."aquecimento_roteiros_dm" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_roteiros_dm_update" ON "public"."aquecimento_roteiros_dm" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text") AND "public"."tem_permissao"('aquecimento_chips'::"text", 'editar'::"text")));



CREATE POLICY "aquecimento_roteiros_dm_ver" ON "public"."aquecimento_roteiros_dm" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('aquecimento_chips'::"text", 'ver'::"text"));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_admin_le" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



ALTER TABLE "public"."aula_secreta_eventos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aula_secreta_eventos_delete" ON "public"."aula_secreta_eventos" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('aula_secreta'::"text", 'ver'::"text") AND "public"."tem_permissao"('aula_secreta'::"text", 'editar'::"text")));



CREATE POLICY "aula_secreta_eventos_inserir" ON "public"."aula_secreta_eventos" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('aula_secreta'::"text", 'ver'::"text") AND "public"."tem_permissao"('aula_secreta'::"text", 'editar'::"text")));



CREATE POLICY "aula_secreta_eventos_update" ON "public"."aula_secreta_eventos" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('aula_secreta'::"text", 'ver'::"text") AND "public"."tem_permissao"('aula_secreta'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('aula_secreta'::"text", 'ver'::"text") AND "public"."tem_permissao"('aula_secreta'::"text", 'editar'::"text")));



CREATE POLICY "aula_secreta_eventos_ver" ON "public"."aula_secreta_eventos" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('aula_secreta'::"text", 'ver'::"text"));



ALTER TABLE "public"."aula_secreta_leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aula_secreta_leads_delete" ON "public"."aula_secreta_leads" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('aula_secreta'::"text", 'ver'::"text") AND "public"."tem_permissao"('aula_secreta'::"text", 'editar'::"text")));



CREATE POLICY "aula_secreta_leads_inserir" ON "public"."aula_secreta_leads" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('aula_secreta'::"text", 'ver'::"text") AND "public"."tem_permissao"('aula_secreta'::"text", 'editar'::"text")));



CREATE POLICY "aula_secreta_leads_update" ON "public"."aula_secreta_leads" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('aula_secreta'::"text", 'ver'::"text") AND "public"."tem_permissao"('aula_secreta'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('aula_secreta'::"text", 'ver'::"text") AND "public"."tem_permissao"('aula_secreta'::"text", 'editar'::"text")));



CREATE POLICY "aula_secreta_leads_ver" ON "public"."aula_secreta_leads" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('aula_secreta'::"text", 'ver'::"text"));



ALTER TABLE "public"."aula_secreta_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aula_secreta_log_delete" ON "public"."aula_secreta_log" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('aula_secreta'::"text", 'ver'::"text") AND "public"."tem_permissao"('aula_secreta'::"text", 'editar'::"text")));



CREATE POLICY "aula_secreta_log_inserir" ON "public"."aula_secreta_log" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('aula_secreta'::"text", 'ver'::"text") AND "public"."tem_permissao"('aula_secreta'::"text", 'editar'::"text")));



CREATE POLICY "aula_secreta_log_update" ON "public"."aula_secreta_log" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('aula_secreta'::"text", 'ver'::"text") AND "public"."tem_permissao"('aula_secreta'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('aula_secreta'::"text", 'ver'::"text") AND "public"."tem_permissao"('aula_secreta'::"text", 'editar'::"text")));



CREATE POLICY "aula_secreta_log_ver" ON "public"."aula_secreta_log" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('aula_secreta'::"text", 'ver'::"text"));



ALTER TABLE "public"."balanco_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "balanco_config_delete" ON "public"."balanco_config" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('balanco'::"text", 'ver'::"text") AND "public"."tem_permissao"('balanco'::"text", 'editar'::"text")));



CREATE POLICY "balanco_config_inserir" ON "public"."balanco_config" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('balanco'::"text", 'ver'::"text") AND "public"."tem_permissao"('balanco'::"text", 'editar'::"text")));



CREATE POLICY "balanco_config_update" ON "public"."balanco_config" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('balanco'::"text", 'ver'::"text") AND "public"."tem_permissao"('balanco'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('balanco'::"text", 'ver'::"text") AND "public"."tem_permissao"('balanco'::"text", 'editar'::"text")));



CREATE POLICY "balanco_config_ver" ON "public"."balanco_config" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('balanco'::"text", 'ver'::"text"));



ALTER TABLE "public"."balanco_itens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "balanco_itens_delete" ON "public"."balanco_itens" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('balanco'::"text", 'ver'::"text") AND "public"."tem_permissao"('balanco'::"text", 'editar'::"text")));



CREATE POLICY "balanco_itens_inserir" ON "public"."balanco_itens" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('balanco'::"text", 'ver'::"text") AND "public"."tem_permissao"('balanco'::"text", 'editar'::"text")));



CREATE POLICY "balanco_itens_update" ON "public"."balanco_itens" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('balanco'::"text", 'ver'::"text") AND "public"."tem_permissao"('balanco'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('balanco'::"text", 'ver'::"text") AND "public"."tem_permissao"('balanco'::"text", 'editar'::"text")));



CREATE POLICY "balanco_itens_ver" ON "public"."balanco_itens" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('balanco'::"text", 'ver'::"text"));



ALTER TABLE "public"."boas_vindas_agendados" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "boas_vindas_agendados_delete" ON "public"."boas_vindas_agendados" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "boas_vindas_agendados_inserir" ON "public"."boas_vindas_agendados" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "boas_vindas_agendados_update" ON "public"."boas_vindas_agendados" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "boas_vindas_agendados_ver" ON "public"."boas_vindas_agendados" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text"));



ALTER TABLE "public"."boas_vindas_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "boas_vindas_config_delete" ON "public"."boas_vindas_config" FOR DELETE TO "authenticated" USING ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text"))));



CREATE POLICY "boas_vindas_config_inserir" ON "public"."boas_vindas_config" FOR INSERT TO "authenticated" WITH CHECK ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text"))));



CREATE POLICY "boas_vindas_config_update" ON "public"."boas_vindas_config" FOR UPDATE TO "authenticated" USING ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text")))) WITH CHECK ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text"))));



CREATE POLICY "boas_vindas_config_ver" ON "public"."boas_vindas_config" FOR SELECT TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")));



ALTER TABLE "public"."boas_vindas_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "boas_vindas_logs_delete" ON "public"."boas_vindas_logs" FOR DELETE TO "authenticated" USING ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text"))));



CREATE POLICY "boas_vindas_logs_inserir" ON "public"."boas_vindas_logs" FOR INSERT TO "authenticated" WITH CHECK ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text"))));



CREATE POLICY "boas_vindas_logs_update" ON "public"."boas_vindas_logs" FOR UPDATE TO "authenticated" USING ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text")))) WITH CHECK ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text"))));



CREATE POLICY "boas_vindas_logs_ver" ON "public"."boas_vindas_logs" FOR SELECT TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")));



ALTER TABLE "public"."bonus_tipos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bonus_tipos_delete" ON "public"."bonus_tipos" FOR DELETE TO "authenticated" USING ("public"."is_gestor"());



CREATE POLICY "bonus_tipos_inserir" ON "public"."bonus_tipos" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_gestor"());



CREATE POLICY "bonus_tipos_update" ON "public"."bonus_tipos" FOR UPDATE TO "authenticated" USING ("public"."is_gestor"()) WITH CHECK ("public"."is_gestor"());



CREATE POLICY "bonus_tipos_ver" ON "public"."bonus_tipos" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."bonus_turmas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bonus_turmas_delete" ON "public"."bonus_turmas" FOR DELETE TO "authenticated" USING ("public"."is_gestor"());



CREATE POLICY "bonus_turmas_inserir" ON "public"."bonus_turmas" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_gestor"());



CREATE POLICY "bonus_turmas_update" ON "public"."bonus_turmas" FOR UPDATE TO "authenticated" USING ("public"."is_gestor"()) WITH CHECK ("public"."is_gestor"());



CREATE POLICY "bonus_turmas_ver" ON "public"."bonus_turmas" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."canais_cobranca" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "canais_cobranca_delete" ON "public"."canais_cobranca" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "canais_cobranca_inserir" ON "public"."canais_cobranca" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "canais_cobranca_update" ON "public"."canais_cobranca" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "canais_cobranca_ver" ON "public"."canais_cobranca" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('cobranca'::"text", 'ver'::"text"));



ALTER TABLE "public"."chat_leituras" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cobranca_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cobranca_config_delete" ON "public"."cobranca_config" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "cobranca_config_inserir" ON "public"."cobranca_config" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "cobranca_config_update" ON "public"."cobranca_config" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "cobranca_config_ver" ON "public"."cobranca_config" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('cobranca'::"text", 'ver'::"text"));



ALTER TABLE "public"."cobranca_ia_conversas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cobranca_ia_conversas_delete" ON "public"."cobranca_ia_conversas" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "cobranca_ia_conversas_inserir" ON "public"."cobranca_ia_conversas" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "cobranca_ia_conversas_update" ON "public"."cobranca_ia_conversas" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "cobranca_ia_conversas_ver" ON "public"."cobranca_ia_conversas" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('cobranca'::"text", 'ver'::"text"));



ALTER TABLE "public"."cobranca_ia_mensagens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cobranca_ia_mensagens_delete" ON "public"."cobranca_ia_mensagens" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "cobranca_ia_mensagens_inserir" ON "public"."cobranca_ia_mensagens" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "cobranca_ia_mensagens_update" ON "public"."cobranca_ia_mensagens" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "cobranca_ia_mensagens_ver" ON "public"."cobranca_ia_mensagens" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('cobranca'::"text", 'ver'::"text"));



ALTER TABLE "public"."cobranca_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cobranca_logs_delete" ON "public"."cobranca_logs" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "cobranca_logs_inserir" ON "public"."cobranca_logs" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "cobranca_logs_update" ON "public"."cobranca_logs" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "cobranca_logs_ver" ON "public"."cobranca_logs" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('cobranca'::"text", 'ver'::"text"));



ALTER TABLE "public"."cobranca_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cobranca_templates_delete" ON "public"."cobranca_templates" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "cobranca_templates_inserir" ON "public"."cobranca_templates" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "cobranca_templates_update" ON "public"."cobranca_templates" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "cobranca_templates_ver" ON "public"."cobranca_templates" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('cobranca'::"text", 'ver'::"text"));



ALTER TABLE "public"."cobranca_turmas_ativas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cobranca_turmas_ativas_delete" ON "public"."cobranca_turmas_ativas" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "cobranca_turmas_ativas_inserir" ON "public"."cobranca_turmas_ativas" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "cobranca_turmas_ativas_update" ON "public"."cobranca_turmas_ativas" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('cobranca'::"text", 'ver'::"text") AND "public"."tem_permissao"('cobranca'::"text", 'editar'::"text")));



CREATE POLICY "cobranca_turmas_ativas_ver" ON "public"."cobranca_turmas_ativas" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('cobranca'::"text", 'ver'::"text"));



ALTER TABLE "public"."conteudo_calendario" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conteudo_calendario_delete" ON "public"."conteudo_calendario" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text")));



CREATE POLICY "conteudo_calendario_inserir" ON "public"."conteudo_calendario" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text")));



CREATE POLICY "conteudo_calendario_update" ON "public"."conteudo_calendario" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text")));



CREATE POLICY "conteudo_calendario_ver" ON "public"."conteudo_calendario" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('operacoes'::"text", 'ver'::"text"));



ALTER TABLE "public"."conteudo_clientes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conteudo_clientes_delete" ON "public"."conteudo_clientes" FOR DELETE TO "authenticated" USING ("public"."is_gestor"());



CREATE POLICY "conteudo_clientes_inserir" ON "public"."conteudo_clientes" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_gestor"());



CREATE POLICY "conteudo_clientes_update" ON "public"."conteudo_clientes" FOR UPDATE TO "authenticated" USING ("public"."is_gestor"()) WITH CHECK ("public"."is_gestor"());



CREATE POLICY "conteudo_clientes_ver" ON "public"."conteudo_clientes" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."conteudo_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conteudo_posts_delete" ON "public"."conteudo_posts" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('posts'::"text", 'ver'::"text") AND "public"."tem_permissao"('posts'::"text", 'editar'::"text")));



CREATE POLICY "conteudo_posts_inserir" ON "public"."conteudo_posts" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('posts'::"text", 'ver'::"text") AND "public"."tem_permissao"('posts'::"text", 'editar'::"text")));



CREATE POLICY "conteudo_posts_update" ON "public"."conteudo_posts" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('posts'::"text", 'ver'::"text") AND "public"."tem_permissao"('posts'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('posts'::"text", 'ver'::"text") AND "public"."tem_permissao"('posts'::"text", 'editar'::"text")));



CREATE POLICY "conteudo_posts_ver" ON "public"."conteudo_posts" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('posts'::"text", 'ver'::"text"));



ALTER TABLE "public"."crm_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crm_config_admin_escreve" ON "public"."crm_config" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "crm_config_logado_le" ON "public"."crm_config" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."cursos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cursos_admin_escreve" ON "public"."cursos" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



ALTER TABLE "public"."ddd_regioes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ddd_regioes_authenticated_read" ON "public"."ddd_regioes" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."disparo_campanhas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "disparo_campanhas_delete" ON "public"."disparo_campanhas" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "disparo_campanhas_inserir" ON "public"."disparo_campanhas" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "disparo_campanhas_update" ON "public"."disparo_campanhas" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "disparo_campanhas_ver" ON "public"."disparo_campanhas" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text"));



ALTER TABLE "public"."disparo_leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "disparo_leads_delete" ON "public"."disparo_leads" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "disparo_leads_inserir" ON "public"."disparo_leads" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "disparo_leads_update" ON "public"."disparo_leads" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "disparo_leads_ver" ON "public"."disparo_leads" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text"));



ALTER TABLE "public"."email_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "email_config_delete" ON "public"."email_config" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('settings'::"text", 'ver'::"text") AND "public"."tem_permissao"('settings'::"text", 'editar'::"text")));



CREATE POLICY "email_config_inserir" ON "public"."email_config" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('settings'::"text", 'ver'::"text") AND "public"."tem_permissao"('settings'::"text", 'editar'::"text")));



CREATE POLICY "email_config_update" ON "public"."email_config" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('settings'::"text", 'ver'::"text") AND "public"."tem_permissao"('settings'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('settings'::"text", 'ver'::"text") AND "public"."tem_permissao"('settings'::"text", 'editar'::"text")));



CREATE POLICY "email_config_ver" ON "public"."email_config" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('settings'::"text", 'ver'::"text"));



ALTER TABLE "public"."equipe" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipe_11ds_agentes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "equipe_11ds_agentes_delete" ON "public"."equipe_11ds_agentes" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "equipe_11ds_agentes_inserir" ON "public"."equipe_11ds_agentes" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "equipe_11ds_agentes_update" ON "public"."equipe_11ds_agentes" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "equipe_11ds_agentes_ver" ON "public"."equipe_11ds_agentes" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text"));



ALTER TABLE "public"."equipe_11ds_blueprints" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "equipe_11ds_blueprints_delete" ON "public"."equipe_11ds_blueprints" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "equipe_11ds_blueprints_inserir" ON "public"."equipe_11ds_blueprints" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "equipe_11ds_blueprints_update" ON "public"."equipe_11ds_blueprints" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "equipe_11ds_blueprints_ver" ON "public"."equipe_11ds_blueprints" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text"));



ALTER TABLE "public"."equipe_11ds_chat_acoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipe_11ds_chat_mensagens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipe_11ds_ferramenta_chamadas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipe_11ds_memorias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipe_11ds_mensagens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "equipe_11ds_mensagens_delete" ON "public"."equipe_11ds_mensagens" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "equipe_11ds_mensagens_inserir" ON "public"."equipe_11ds_mensagens" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "equipe_11ds_mensagens_update" ON "public"."equipe_11ds_mensagens" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "equipe_11ds_mensagens_ver" ON "public"."equipe_11ds_mensagens" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text"));



ALTER TABLE "public"."equipe_11ds_plano_etapas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipe_11ds_planos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipe_11ds_recorrentes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "equipe_11ds_recorrentes_delete" ON "public"."equipe_11ds_recorrentes" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "equipe_11ds_recorrentes_inserir" ON "public"."equipe_11ds_recorrentes" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "equipe_11ds_recorrentes_update" ON "public"."equipe_11ds_recorrentes" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "equipe_11ds_recorrentes_ver" ON "public"."equipe_11ds_recorrentes" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text"));



ALTER TABLE "public"."equipe_11ds_tarefas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "equipe_11ds_tarefas_delete" ON "public"."equipe_11ds_tarefas" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "equipe_11ds_tarefas_inserir" ON "public"."equipe_11ds_tarefas" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "equipe_11ds_tarefas_update" ON "public"."equipe_11ds_tarefas" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "equipe_11ds_tarefas_ver" ON "public"."equipe_11ds_tarefas" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text"));



ALTER TABLE "public"."equipe_11ds_times" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "equipe_11ds_times_delete" ON "public"."equipe_11ds_times" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "equipe_11ds_times_inserir" ON "public"."equipe_11ds_times" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "equipe_11ds_times_update" ON "public"."equipe_11ds_times" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "equipe_11ds_times_ver" ON "public"."equipe_11ds_times" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text"));



CREATE POLICY "equipe_delete" ON "public"."equipe" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text")));



CREATE POLICY "equipe_inserir" ON "public"."equipe" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text")));



CREATE POLICY "equipe_update" ON "public"."equipe" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text")));



CREATE POLICY "equipe_ver" ON "public"."equipe" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('operacoes'::"text", 'ver'::"text"));



ALTER TABLE "public"."eventos_calendario" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "eventos_calendario_delete" ON "public"."eventos_calendario" FOR DELETE TO "authenticated" USING ((("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") OR "public"."tem_permissao"('dashboard'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('operacoes'::"text", 'editar'::"text") OR "public"."tem_permissao"('dashboard'::"text", 'editar'::"text"))));



CREATE POLICY "eventos_calendario_inserir" ON "public"."eventos_calendario" FOR INSERT TO "authenticated" WITH CHECK ((("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") OR "public"."tem_permissao"('dashboard'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('operacoes'::"text", 'editar'::"text") OR "public"."tem_permissao"('dashboard'::"text", 'editar'::"text"))));



CREATE POLICY "eventos_calendario_update" ON "public"."eventos_calendario" FOR UPDATE TO "authenticated" USING ((("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") OR "public"."tem_permissao"('dashboard'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('operacoes'::"text", 'editar'::"text") OR "public"."tem_permissao"('dashboard'::"text", 'editar'::"text")))) WITH CHECK ((("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") OR "public"."tem_permissao"('dashboard'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('operacoes'::"text", 'editar'::"text") OR "public"."tem_permissao"('dashboard'::"text", 'editar'::"text"))));



CREATE POLICY "eventos_calendario_ver" ON "public"."eventos_calendario" FOR SELECT TO "authenticated" USING (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") OR "public"."tem_permissao"('dashboard'::"text", 'ver'::"text")));



ALTER TABLE "public"."evolution_conexao_eventos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "evolution_conexao_eventos_admin_escreve" ON "public"."evolution_conexao_eventos" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "evolution_conexao_eventos_ver" ON "public"."evolution_conexao_eventos" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."evolution_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "evolution_config_admin_escreve" ON "public"."evolution_config" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "evolution_config_ver" ON "public"."evolution_config" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."evolution_task_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "evolution_task_config_admin_escreve" ON "public"."evolution_task_config" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "evolution_task_config_ver" ON "public"."evolution_task_config" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."fechamentos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fechamentos_delete" ON "public"."fechamentos" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('financeiro'::"text", 'ver'::"text") AND "public"."tem_permissao"('financeiro'::"text", 'editar'::"text")));



CREATE POLICY "fechamentos_inserir" ON "public"."fechamentos" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('financeiro'::"text", 'ver'::"text") AND "public"."tem_permissao"('financeiro'::"text", 'editar'::"text")));



CREATE POLICY "fechamentos_update" ON "public"."fechamentos" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('financeiro'::"text", 'ver'::"text") AND "public"."tem_permissao"('financeiro'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('financeiro'::"text", 'ver'::"text") AND "public"."tem_permissao"('financeiro'::"text", 'editar'::"text")));



CREATE POLICY "fechamentos_ver" ON "public"."fechamentos" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('financeiro'::"text", 'ver'::"text"));



ALTER TABLE "public"."fontes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fontes_admin_escreve" ON "public"."fontes" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



ALTER TABLE "public"."franquia_campanha" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "franquia_campanha_delete" ON "public"."franquia_campanha" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('franquia_psi'::"text", 'ver'::"text") AND "public"."tem_permissao"('franquia_psi'::"text", 'editar'::"text")));



CREATE POLICY "franquia_campanha_inserir" ON "public"."franquia_campanha" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('franquia_psi'::"text", 'ver'::"text") AND "public"."tem_permissao"('franquia_psi'::"text", 'editar'::"text")));



CREATE POLICY "franquia_campanha_update" ON "public"."franquia_campanha" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('franquia_psi'::"text", 'ver'::"text") AND "public"."tem_permissao"('franquia_psi'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('franquia_psi'::"text", 'ver'::"text") AND "public"."tem_permissao"('franquia_psi'::"text", 'editar'::"text")));



CREATE POLICY "franquia_campanha_ver" ON "public"."franquia_campanha" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('franquia_psi'::"text", 'ver'::"text"));



ALTER TABLE "public"."franquia_leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "franquia_leads_delete" ON "public"."franquia_leads" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('franquia_psi'::"text", 'ver'::"text") AND "public"."tem_permissao"('franquia_psi'::"text", 'editar'::"text")));



CREATE POLICY "franquia_leads_inserir" ON "public"."franquia_leads" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('franquia_psi'::"text", 'ver'::"text") AND "public"."tem_permissao"('franquia_psi'::"text", 'editar'::"text")));



CREATE POLICY "franquia_leads_update" ON "public"."franquia_leads" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('franquia_psi'::"text", 'ver'::"text") AND "public"."tem_permissao"('franquia_psi'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('franquia_psi'::"text", 'ver'::"text") AND "public"."tem_permissao"('franquia_psi'::"text", 'editar'::"text")));



CREATE POLICY "franquia_leads_ver" ON "public"."franquia_leads" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('franquia_psi'::"text", 'ver'::"text"));



ALTER TABLE "public"."funnel_configs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "funnel_configs_delete" ON "public"."funnel_configs" FOR DELETE TO "authenticated" USING ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('npa'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('npa'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text"))));



CREATE POLICY "funnel_configs_inserir" ON "public"."funnel_configs" FOR INSERT TO "authenticated" WITH CHECK ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('npa'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('npa'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text"))));



CREATE POLICY "funnel_configs_update" ON "public"."funnel_configs" FOR UPDATE TO "authenticated" USING ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('npa'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('npa'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text")))) WITH CHECK ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('npa'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('npa'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text"))));



CREATE POLICY "funnel_configs_ver" ON "public"."funnel_configs" FOR SELECT TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('npa'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")));



ALTER TABLE "public"."funnel_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "funnel_messages_delete" ON "public"."funnel_messages" FOR DELETE TO "authenticated" USING ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('npa'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('npa'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text"))));



CREATE POLICY "funnel_messages_inserir" ON "public"."funnel_messages" FOR INSERT TO "authenticated" WITH CHECK ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('npa'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('npa'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text"))));



CREATE POLICY "funnel_messages_update" ON "public"."funnel_messages" FOR UPDATE TO "authenticated" USING ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('npa'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('npa'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text")))) WITH CHECK ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('npa'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('npa'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text"))));



CREATE POLICY "funnel_messages_ver" ON "public"."funnel_messages" FOR SELECT TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('npa'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")));



ALTER TABLE "public"."funnel_poll_respostas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "funnel_poll_respostas_delete" ON "public"."funnel_poll_respostas" FOR DELETE TO "authenticated" USING ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('npa'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('npa'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text"))));



CREATE POLICY "funnel_poll_respostas_inserir" ON "public"."funnel_poll_respostas" FOR INSERT TO "authenticated" WITH CHECK ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('npa'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('npa'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text"))));



CREATE POLICY "funnel_poll_respostas_update" ON "public"."funnel_poll_respostas" FOR UPDATE TO "authenticated" USING ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('npa'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('npa'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text")))) WITH CHECK ((("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('npa'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('lancamentos'::"text", 'editar'::"text") OR "public"."tem_permissao"('npa'::"text", 'editar'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'editar'::"text"))));



CREATE POLICY "funnel_poll_respostas_ver" ON "public"."funnel_poll_respostas" FOR SELECT TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") OR "public"."tem_permissao"('npa'::"text", 'ver'::"text") OR "public"."tem_permissao"('funil_lancamento'::"text", 'ver'::"text")));



ALTER TABLE "public"."grupo_add_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "grupo_add_jobs_delete" ON "public"."grupo_add_jobs" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "grupo_add_jobs_inserir" ON "public"."grupo_add_jobs" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "grupo_add_jobs_update" ON "public"."grupo_add_jobs" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "grupo_add_jobs_ver" ON "public"."grupo_add_jobs" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text"));



ALTER TABLE "public"."idm_criativos_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."idm_quiz_leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "idm_quiz_leads_delete" ON "public"."idm_quiz_leads" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('produtos'::"text", 'ver'::"text") AND "public"."tem_permissao"('produtos'::"text", 'editar'::"text")));



CREATE POLICY "idm_quiz_leads_inserir" ON "public"."idm_quiz_leads" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('produtos'::"text", 'ver'::"text") AND "public"."tem_permissao"('produtos'::"text", 'editar'::"text")));



CREATE POLICY "idm_quiz_leads_update" ON "public"."idm_quiz_leads" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('produtos'::"text", 'ver'::"text") AND "public"."tem_permissao"('produtos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('produtos'::"text", 'ver'::"text") AND "public"."tem_permissao"('produtos'::"text", 'editar'::"text")));



CREATE POLICY "idm_quiz_leads_ver" ON "public"."idm_quiz_leads" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('produtos'::"text", 'ver'::"text"));



CREATE POLICY "insert_leads" ON "public"."leads" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "insert_own_profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "insert_own_role" ON "public"."user_roles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "insert_publico_lista_espera" ON "public"."lista_espera_cidades" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



ALTER TABLE "public"."kanban_colunas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kanban_colunas_delete" ON "public"."kanban_colunas" FOR DELETE TO "authenticated" USING ("public"."is_gestor"());



CREATE POLICY "kanban_colunas_inserir" ON "public"."kanban_colunas" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_gestor"());



CREATE POLICY "kanban_colunas_update" ON "public"."kanban_colunas" FOR UPDATE TO "authenticated" USING ("public"."is_gestor"()) WITH CHECK ("public"."is_gestor"());



CREATE POLICY "kanban_colunas_ver" ON "public"."kanban_colunas" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."lancamento_campanhas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lancamento_campanhas_delete" ON "public"."lancamento_campanhas" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "lancamento_campanhas_inserir" ON "public"."lancamento_campanhas" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "lancamento_campanhas_update" ON "public"."lancamento_campanhas" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "lancamento_campanhas_ver" ON "public"."lancamento_campanhas" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text"));



ALTER TABLE "public"."lancamento_eventos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lancamento_eventos_delete" ON "public"."lancamento_eventos" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "lancamento_eventos_inserir" ON "public"."lancamento_eventos" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "lancamento_eventos_update" ON "public"."lancamento_eventos" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "lancamento_eventos_ver" ON "public"."lancamento_eventos" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text"));



ALTER TABLE "public"."lancamento_leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lancamento_leads_delete" ON "public"."lancamento_leads" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "lancamento_leads_inserir" ON "public"."lancamento_leads" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "lancamento_leads_update" ON "public"."lancamento_leads" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "lancamento_leads_ver" ON "public"."lancamento_leads" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text"));



ALTER TABLE "public"."lancamentos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lancamentos_delete" ON "public"."lancamentos" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "lancamentos_inserir" ON "public"."lancamentos" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "lancamentos_update" ON "public"."lancamentos" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "lancamentos_ver" ON "public"."lancamentos" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text"));



ALTER TABLE "public"."lead_aquecimento_campanhas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_aquecimento_campanhas_delete" ON "public"."lead_aquecimento_campanhas" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "lead_aquecimento_campanhas_inserir" ON "public"."lead_aquecimento_campanhas" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "lead_aquecimento_campanhas_update" ON "public"."lead_aquecimento_campanhas" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "lead_aquecimento_campanhas_ver" ON "public"."lead_aquecimento_campanhas" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text"));



ALTER TABLE "public"."lead_aquecimento_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_aquecimento_config_delete" ON "public"."lead_aquecimento_config" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "lead_aquecimento_config_inserir" ON "public"."lead_aquecimento_config" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "lead_aquecimento_config_update" ON "public"."lead_aquecimento_config" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "lead_aquecimento_config_ver" ON "public"."lead_aquecimento_config" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text"));



ALTER TABLE "public"."lead_aquecimento_fases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_aquecimento_fases_delete" ON "public"."lead_aquecimento_fases" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "lead_aquecimento_fases_inserir" ON "public"."lead_aquecimento_fases" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "lead_aquecimento_fases_update" ON "public"."lead_aquecimento_fases" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "lead_aquecimento_fases_ver" ON "public"."lead_aquecimento_fases" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text"));



ALTER TABLE "public"."lead_aquecimento_leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_aquecimento_leads_delete" ON "public"."lead_aquecimento_leads" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "lead_aquecimento_leads_inserir" ON "public"."lead_aquecimento_leads" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "lead_aquecimento_leads_update" ON "public"."lead_aquecimento_leads" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "lead_aquecimento_leads_ver" ON "public"."lead_aquecimento_leads" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text"));



ALTER TABLE "public"."lead_aquecimento_vendedores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_aquecimento_vendedores_delete" ON "public"."lead_aquecimento_vendedores" FOR DELETE TO "authenticated" USING ((("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text"))));



CREATE POLICY "lead_aquecimento_vendedores_inserir" ON "public"."lead_aquecimento_vendedores" FOR INSERT TO "authenticated" WITH CHECK ((("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text"))));



CREATE POLICY "lead_aquecimento_vendedores_update" ON "public"."lead_aquecimento_vendedores" FOR UPDATE TO "authenticated" USING ((("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text")))) WITH CHECK ((("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text"))));



CREATE POLICY "lead_aquecimento_vendedores_ver" ON "public"."lead_aquecimento_vendedores" FOR SELECT TO "authenticated" USING (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")));



ALTER TABLE "public"."lead_cartas_usadas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_cartas_usadas_delete" ON "public"."lead_cartas_usadas" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text")));



CREATE POLICY "lead_cartas_usadas_inserir" ON "public"."lead_cartas_usadas" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text")));



CREATE POLICY "lead_cartas_usadas_update" ON "public"."lead_cartas_usadas" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text")));



CREATE POLICY "lead_cartas_usadas_ver" ON "public"."lead_cartas_usadas" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('pipeline'::"text", 'ver'::"text"));



ALTER TABLE "public"."lead_respostas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_respostas_gestor_le" ON "public"."lead_respostas" FOR SELECT TO "authenticated" USING ("public"."is_gestor"());



ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads_cartas_negociacao" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_cartas_negociacao_delete" ON "public"."leads_cartas_negociacao" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text")));



CREATE POLICY "leads_cartas_negociacao_inserir" ON "public"."leads_cartas_negociacao" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text")));



CREATE POLICY "leads_cartas_negociacao_update" ON "public"."leads_cartas_negociacao" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text")));



CREATE POLICY "leads_cartas_negociacao_ver" ON "public"."leads_cartas_negociacao" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('pipeline'::"text", 'ver'::"text"));



ALTER TABLE "public"."leads_diretos_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_diretos_config_delete" ON "public"."leads_diretos_config" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text")));



CREATE POLICY "leads_diretos_config_inserir" ON "public"."leads_diretos_config" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text")));



CREATE POLICY "leads_diretos_config_update" ON "public"."leads_diretos_config" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text")));



CREATE POLICY "leads_diretos_config_ver" ON "public"."leads_diretos_config" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('pipeline'::"text", 'ver'::"text"));



ALTER TABLE "public"."leads_historico_fase" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_historico_fase_delete" ON "public"."leads_historico_fase" FOR DELETE TO "authenticated" USING ((("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('pipeline'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text"))));



CREATE POLICY "leads_historico_fase_inserir" ON "public"."leads_historico_fase" FOR INSERT TO "authenticated" WITH CHECK ((("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('pipeline'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text"))));



CREATE POLICY "leads_historico_fase_update" ON "public"."leads_historico_fase" FOR UPDATE TO "authenticated" USING ((("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('pipeline'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text")))) WITH CHECK ((("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('pipeline'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text"))));



CREATE POLICY "leads_historico_fase_ver" ON "public"."leads_historico_fase" FOR SELECT TO "authenticated" USING (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")));



ALTER TABLE "public"."leads_ia_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_ia_config_delete" ON "public"."leads_ia_config" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "leads_ia_config_inserir" ON "public"."leads_ia_config" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "leads_ia_config_update" ON "public"."leads_ia_config" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "leads_ia_config_ver" ON "public"."leads_ia_config" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text"));



ALTER TABLE "public"."leads_ia_conhecimento" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_ia_conhecimento_delete" ON "public"."leads_ia_conhecimento" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "leads_ia_conhecimento_inserir" ON "public"."leads_ia_conhecimento" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



ALTER TABLE "public"."leads_ia_conhecimento_sugestoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_ia_conhecimento_sugestoes_delete" ON "public"."leads_ia_conhecimento_sugestoes" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "leads_ia_conhecimento_sugestoes_inserir" ON "public"."leads_ia_conhecimento_sugestoes" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "leads_ia_conhecimento_sugestoes_update" ON "public"."leads_ia_conhecimento_sugestoes" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "leads_ia_conhecimento_sugestoes_ver" ON "public"."leads_ia_conhecimento_sugestoes" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text"));



CREATE POLICY "leads_ia_conhecimento_update" ON "public"."leads_ia_conhecimento" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "leads_ia_conhecimento_ver" ON "public"."leads_ia_conhecimento" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text"));



ALTER TABLE "public"."leads_ia_conversas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_ia_conversas_delete" ON "public"."leads_ia_conversas" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "leads_ia_conversas_inserir" ON "public"."leads_ia_conversas" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "leads_ia_conversas_update" ON "public"."leads_ia_conversas" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "leads_ia_conversas_ver" ON "public"."leads_ia_conversas" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text"));



ALTER TABLE "public"."leads_ia_debounce" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads_ia_mensagens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_ia_mensagens_delete" ON "public"."leads_ia_mensagens" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "leads_ia_mensagens_inserir" ON "public"."leads_ia_mensagens" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "leads_ia_mensagens_update" ON "public"."leads_ia_mensagens" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "leads_ia_mensagens_ver" ON "public"."leads_ia_mensagens" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text"));



ALTER TABLE "public"."leads_ia_oferta_ativa" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_ia_oferta_ativa_delete" ON "public"."leads_ia_oferta_ativa" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "leads_ia_oferta_ativa_inserir" ON "public"."leads_ia_oferta_ativa" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "leads_ia_oferta_ativa_update" ON "public"."leads_ia_oferta_ativa" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text") AND "public"."tem_permissao"('equipe_11ds'::"text", 'editar'::"text")));



CREATE POLICY "leads_ia_oferta_ativa_ver" ON "public"."leads_ia_oferta_ativa" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('equipe_11ds'::"text", 'ver'::"text"));



ALTER TABLE "public"."leads_produtos_valores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_produtos_valores_delete" ON "public"."leads_produtos_valores" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text")));



CREATE POLICY "leads_produtos_valores_inserir" ON "public"."leads_produtos_valores" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text")));



CREATE POLICY "leads_produtos_valores_update" ON "public"."leads_produtos_valores" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text")));



CREATE POLICY "leads_produtos_valores_ver" ON "public"."leads_produtos_valores" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('pipeline'::"text", 'ver'::"text"));



ALTER TABLE "public"."leads_quadro_cards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_quadro_cards_delete" ON "public"."leads_quadro_cards" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text")));



CREATE POLICY "leads_quadro_cards_inserir" ON "public"."leads_quadro_cards" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text")));



CREATE POLICY "leads_quadro_cards_update" ON "public"."leads_quadro_cards" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text")));



CREATE POLICY "leads_quadro_cards_ver" ON "public"."leads_quadro_cards" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('pipeline'::"text", 'ver'::"text"));



ALTER TABLE "public"."leads_quadros" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_quadros_delete" ON "public"."leads_quadros" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text")));



CREATE POLICY "leads_quadros_inserir" ON "public"."leads_quadros" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text")));



CREATE POLICY "leads_quadros_update" ON "public"."leads_quadros" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") AND "public"."tem_permissao"('pipeline'::"text", 'editar'::"text")));



CREATE POLICY "leads_quadros_ver" ON "public"."leads_quadros" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('pipeline'::"text", 'ver'::"text"));



ALTER TABLE "public"."lista_espera_cidades" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lista_espera_cidades_delete" ON "public"."lista_espera_cidades" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('franquia_psi'::"text", 'ver'::"text") AND "public"."tem_permissao"('franquia_psi'::"text", 'editar'::"text")));



CREATE POLICY "lista_espera_cidades_inserir" ON "public"."lista_espera_cidades" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('franquia_psi'::"text", 'ver'::"text") AND "public"."tem_permissao"('franquia_psi'::"text", 'editar'::"text")));



CREATE POLICY "lista_espera_cidades_update" ON "public"."lista_espera_cidades" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('franquia_psi'::"text", 'ver'::"text") AND "public"."tem_permissao"('franquia_psi'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('franquia_psi'::"text", 'ver'::"text") AND "public"."tem_permissao"('franquia_psi'::"text", 'editar'::"text")));



CREATE POLICY "lista_espera_cidades_ver" ON "public"."lista_espera_cidades" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('franquia_psi'::"text", 'ver'::"text"));



ALTER TABLE "public"."midia_imagens_reaproveitaveis" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "midia_imagens_reaproveitaveis_delete" ON "public"."midia_imagens_reaproveitaveis" FOR DELETE TO "authenticated" USING ((("public"."tem_permissao"('posts'::"text", 'ver'::"text") OR "public"."tem_permissao"('reels_idm'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('posts'::"text", 'editar'::"text") OR "public"."tem_permissao"('reels_idm'::"text", 'editar'::"text"))));



CREATE POLICY "midia_imagens_reaproveitaveis_inserir" ON "public"."midia_imagens_reaproveitaveis" FOR INSERT TO "authenticated" WITH CHECK ((("public"."tem_permissao"('posts'::"text", 'ver'::"text") OR "public"."tem_permissao"('reels_idm'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('posts'::"text", 'editar'::"text") OR "public"."tem_permissao"('reels_idm'::"text", 'editar'::"text"))));



CREATE POLICY "midia_imagens_reaproveitaveis_update" ON "public"."midia_imagens_reaproveitaveis" FOR UPDATE TO "authenticated" USING ((("public"."tem_permissao"('posts'::"text", 'ver'::"text") OR "public"."tem_permissao"('reels_idm'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('posts'::"text", 'editar'::"text") OR "public"."tem_permissao"('reels_idm'::"text", 'editar'::"text")))) WITH CHECK ((("public"."tem_permissao"('posts'::"text", 'ver'::"text") OR "public"."tem_permissao"('reels_idm'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('posts'::"text", 'editar'::"text") OR "public"."tem_permissao"('reels_idm'::"text", 'editar'::"text"))));



CREATE POLICY "midia_imagens_reaproveitaveis_ver" ON "public"."midia_imagens_reaproveitaveis" FOR SELECT TO "authenticated" USING (("public"."tem_permissao"('posts'::"text", 'ver'::"text") OR "public"."tem_permissao"('reels_idm'::"text", 'ver'::"text")));



ALTER TABLE "public"."mind_map_connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mind_map_connections_delete" ON "public"."mind_map_connections" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('mapa_mental'::"text", 'ver'::"text") AND "public"."tem_permissao"('mapa_mental'::"text", 'editar'::"text")));



CREATE POLICY "mind_map_connections_inserir" ON "public"."mind_map_connections" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('mapa_mental'::"text", 'ver'::"text") AND "public"."tem_permissao"('mapa_mental'::"text", 'editar'::"text")));



CREATE POLICY "mind_map_connections_update" ON "public"."mind_map_connections" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('mapa_mental'::"text", 'ver'::"text") AND "public"."tem_permissao"('mapa_mental'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('mapa_mental'::"text", 'ver'::"text") AND "public"."tem_permissao"('mapa_mental'::"text", 'editar'::"text")));



CREATE POLICY "mind_map_connections_ver" ON "public"."mind_map_connections" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('mapa_mental'::"text", 'ver'::"text"));



ALTER TABLE "public"."mind_map_nodes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mind_map_nodes_delete" ON "public"."mind_map_nodes" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('mapa_mental'::"text", 'ver'::"text") AND "public"."tem_permissao"('mapa_mental'::"text", 'editar'::"text")));



CREATE POLICY "mind_map_nodes_inserir" ON "public"."mind_map_nodes" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('mapa_mental'::"text", 'ver'::"text") AND "public"."tem_permissao"('mapa_mental'::"text", 'editar'::"text")));



CREATE POLICY "mind_map_nodes_update" ON "public"."mind_map_nodes" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('mapa_mental'::"text", 'ver'::"text") AND "public"."tem_permissao"('mapa_mental'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('mapa_mental'::"text", 'ver'::"text") AND "public"."tem_permissao"('mapa_mental'::"text", 'editar'::"text")));



CREATE POLICY "mind_map_nodes_ver" ON "public"."mind_map_nodes" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('mapa_mental'::"text", 'ver'::"text"));



ALTER TABLE "public"."mind_map_pages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mind_map_pages_delete" ON "public"."mind_map_pages" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('mapa_mental'::"text", 'ver'::"text") AND "public"."tem_permissao"('mapa_mental'::"text", 'editar'::"text")));



CREATE POLICY "mind_map_pages_inserir" ON "public"."mind_map_pages" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('mapa_mental'::"text", 'ver'::"text") AND "public"."tem_permissao"('mapa_mental'::"text", 'editar'::"text")));



CREATE POLICY "mind_map_pages_update" ON "public"."mind_map_pages" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('mapa_mental'::"text", 'ver'::"text") AND "public"."tem_permissao"('mapa_mental'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('mapa_mental'::"text", 'ver'::"text") AND "public"."tem_permissao"('mapa_mental'::"text", 'editar'::"text")));



CREATE POLICY "mind_map_pages_ver" ON "public"."mind_map_pages" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('mapa_mental'::"text", 'ver'::"text"));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."npa_evento_leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "npa_evento_leads_delete" ON "public"."npa_evento_leads" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('npa'::"text", 'ver'::"text") AND "public"."tem_permissao"('npa'::"text", 'editar'::"text")));



CREATE POLICY "npa_evento_leads_inserir" ON "public"."npa_evento_leads" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('npa'::"text", 'ver'::"text") AND "public"."tem_permissao"('npa'::"text", 'editar'::"text")));



CREATE POLICY "npa_evento_leads_update" ON "public"."npa_evento_leads" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('npa'::"text", 'ver'::"text") AND "public"."tem_permissao"('npa'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('npa'::"text", 'ver'::"text") AND "public"."tem_permissao"('npa'::"text", 'editar'::"text")));



CREATE POLICY "npa_evento_leads_ver" ON "public"."npa_evento_leads" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('npa'::"text", 'ver'::"text"));



ALTER TABLE "public"."npa_eventos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "npa_eventos_delete" ON "public"."npa_eventos" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('npa'::"text", 'ver'::"text") AND "public"."tem_permissao"('npa'::"text", 'editar'::"text")));



CREATE POLICY "npa_eventos_inserir" ON "public"."npa_eventos" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('npa'::"text", 'ver'::"text") AND "public"."tem_permissao"('npa'::"text", 'editar'::"text")));



ALTER TABLE "public"."npa_eventos_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "npa_eventos_log_delete" ON "public"."npa_eventos_log" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('npa'::"text", 'ver'::"text") AND "public"."tem_permissao"('npa'::"text", 'editar'::"text")));



CREATE POLICY "npa_eventos_log_inserir" ON "public"."npa_eventos_log" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('npa'::"text", 'ver'::"text") AND "public"."tem_permissao"('npa'::"text", 'editar'::"text")));



CREATE POLICY "npa_eventos_log_update" ON "public"."npa_eventos_log" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('npa'::"text", 'ver'::"text") AND "public"."tem_permissao"('npa'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('npa'::"text", 'ver'::"text") AND "public"."tem_permissao"('npa'::"text", 'editar'::"text")));



CREATE POLICY "npa_eventos_log_ver" ON "public"."npa_eventos_log" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('npa'::"text", 'ver'::"text"));



CREATE POLICY "npa_eventos_update" ON "public"."npa_eventos" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('npa'::"text", 'ver'::"text") AND "public"."tem_permissao"('npa'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('npa'::"text", 'ver'::"text") AND "public"."tem_permissao"('npa'::"text", 'editar'::"text")));



CREATE POLICY "npa_eventos_ver" ON "public"."npa_eventos" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('npa'::"text", 'ver'::"text"));



ALTER TABLE "public"."pagamentos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pagamentos_delete" ON "public"."pagamentos" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('financeiro'::"text", 'ver'::"text") AND "public"."tem_permissao"('financeiro'::"text", 'editar'::"text") AND ("public"."tem_permissao"('financeiro'::"text", 'ver_todos'::"text") OR (("turma_id")::"text" = ANY ("public"."turmas_financeiro_permitidas"())))));



CREATE POLICY "pagamentos_inserir" ON "public"."pagamentos" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('financeiro'::"text", 'ver'::"text") AND "public"."tem_permissao"('financeiro'::"text", 'editar'::"text")));



CREATE POLICY "pagamentos_update" ON "public"."pagamentos" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('financeiro'::"text", 'ver'::"text") AND "public"."tem_permissao"('financeiro'::"text", 'editar'::"text") AND ("public"."tem_permissao"('financeiro'::"text", 'ver_todos'::"text") OR (("turma_id")::"text" = ANY ("public"."turmas_financeiro_permitidas"()))))) WITH CHECK (("public"."tem_permissao"('financeiro'::"text", 'ver'::"text") AND "public"."tem_permissao"('financeiro'::"text", 'editar'::"text") AND ("public"."tem_permissao"('financeiro'::"text", 'ver_todos'::"text") OR (("turma_id")::"text" = ANY ("public"."turmas_financeiro_permitidas"())))));



CREATE POLICY "pagamentos_ver" ON "public"."pagamentos" FOR SELECT TO "authenticated" USING (("public"."tem_permissao"('financeiro'::"text", 'ver'::"text") AND ("public"."tem_permissao"('financeiro'::"text", 'ver_todos'::"text") OR (("turma_id")::"text" = ANY ("public"."turmas_financeiro_permitidas"())))));



ALTER TABLE "public"."parceiros" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parceiros_cliques" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parceiros_cliques_delete" ON "public"."parceiros_cliques" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('parceiros'::"text", 'ver'::"text") AND "public"."tem_permissao"('parceiros'::"text", 'editar'::"text")));



CREATE POLICY "parceiros_cliques_inserir" ON "public"."parceiros_cliques" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('parceiros'::"text", 'ver'::"text") AND "public"."tem_permissao"('parceiros'::"text", 'editar'::"text")));



CREATE POLICY "parceiros_cliques_update" ON "public"."parceiros_cliques" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('parceiros'::"text", 'ver'::"text") AND "public"."tem_permissao"('parceiros'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('parceiros'::"text", 'ver'::"text") AND "public"."tem_permissao"('parceiros'::"text", 'editar'::"text")));



CREATE POLICY "parceiros_cliques_ver" ON "public"."parceiros_cliques" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('parceiros'::"text", 'ver'::"text"));



ALTER TABLE "public"."parceiros_cupons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parceiros_entregas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parceiros_entregas_arquivos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parceiros_entregas_comentarios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parceiros_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parceiros_links_delete" ON "public"."parceiros_links" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('parceiros'::"text", 'ver'::"text") AND "public"."tem_permissao"('parceiros'::"text", 'editar'::"text")));



CREATE POLICY "parceiros_links_inserir" ON "public"."parceiros_links" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('parceiros'::"text", 'ver'::"text") AND "public"."tem_permissao"('parceiros'::"text", 'editar'::"text")));



CREATE POLICY "parceiros_links_update" ON "public"."parceiros_links" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('parceiros'::"text", 'ver'::"text") AND "public"."tem_permissao"('parceiros'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('parceiros'::"text", 'ver'::"text") AND "public"."tem_permissao"('parceiros'::"text", 'editar'::"text")));



CREATE POLICY "parceiros_links_ver" ON "public"."parceiros_links" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('parceiros'::"text", 'ver'::"text"));



ALTER TABLE "public"."parceiros_metas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parceiros_produtos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parceiros_vendas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parceiros_video_metricas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_method_rates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pessoa_identificadores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pessoa_identificadores_delete" ON "public"."pessoa_identificadores" FOR DELETE TO "authenticated" USING ((("public"."tem_permissao"('alunos'::"text", 'ver'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('alunos'::"text", 'editar'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text"))));



CREATE POLICY "pessoa_identificadores_inserir" ON "public"."pessoa_identificadores" FOR INSERT TO "authenticated" WITH CHECK ((("public"."tem_permissao"('alunos'::"text", 'ver'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('alunos'::"text", 'editar'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text"))));



CREATE POLICY "pessoa_identificadores_update" ON "public"."pessoa_identificadores" FOR UPDATE TO "authenticated" USING ((("public"."tem_permissao"('alunos'::"text", 'ver'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('alunos'::"text", 'editar'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text")))) WITH CHECK ((("public"."tem_permissao"('alunos'::"text", 'ver'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('alunos'::"text", 'editar'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text"))));



CREATE POLICY "pessoa_identificadores_ver" ON "public"."pessoa_identificadores" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."pessoas" "p"
  WHERE ("p"."id" = "pessoa_identificadores"."pessoa_id"))));



ALTER TABLE "public"."pessoa_vinculos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pessoa_vinculos_delete" ON "public"."pessoa_vinculos" FOR DELETE TO "authenticated" USING ((("public"."tem_permissao"('alunos'::"text", 'ver'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('alunos'::"text", 'editar'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text"))));



CREATE POLICY "pessoa_vinculos_inserir" ON "public"."pessoa_vinculos" FOR INSERT TO "authenticated" WITH CHECK ((("public"."tem_permissao"('alunos'::"text", 'ver'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('alunos'::"text", 'editar'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text"))));



CREATE POLICY "pessoa_vinculos_update" ON "public"."pessoa_vinculos" FOR UPDATE TO "authenticated" USING ((("public"."tem_permissao"('alunos'::"text", 'ver'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('alunos'::"text", 'editar'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text")))) WITH CHECK ((("public"."tem_permissao"('alunos'::"text", 'ver'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('alunos'::"text", 'editar'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text"))));



CREATE POLICY "pessoa_vinculos_ver" ON "public"."pessoa_vinculos" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."pessoas" "p"
  WHERE ("p"."id" = "pessoa_vinculos"."pessoa_id"))));



ALTER TABLE "public"."pessoas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pessoas_delete" ON "public"."pessoas" FOR DELETE TO "authenticated" USING ((("public"."tem_permissao"('alunos'::"text", 'ver'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('alunos'::"text", 'editar'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text"))));



CREATE POLICY "pessoas_inserir" ON "public"."pessoas" FOR INSERT TO "authenticated" WITH CHECK ((("public"."tem_permissao"('alunos'::"text", 'ver'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('alunos'::"text", 'editar'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text"))));



CREATE POLICY "pessoas_update" ON "public"."pessoas" FOR UPDATE TO "authenticated" USING ((("public"."tem_permissao"('alunos'::"text", 'ver'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('alunos'::"text", 'editar'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text")))) WITH CHECK ((("public"."tem_permissao"('alunos'::"text", 'ver'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('alunos'::"text", 'editar'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text"))));



CREATE POLICY "pessoas_ver" ON "public"."pessoas" FOR SELECT TO "authenticated" USING (("public"."tem_permissao"('alunos'::"text", 'ver_todos'::"text") OR "public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."alunos" "a"
  WHERE (("a"."pessoa_id" = "pessoas"."id") AND (("a"."turma_id")::"text" = ANY ("public"."turmas_financeiro_permitidas"())))))));



CREATE POLICY "pmr_select" ON "public"."payment_method_rates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "pmr_write" ON "public"."payment_method_rates" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_access_permissions"
  WHERE (("user_access_permissions"."user_id" = "auth"."uid"()) AND (("user_access_permissions"."can_view_financeiro_cfo" = true) OR ("user_access_permissions"."can_view_balanco" = true))))));



ALTER TABLE "public"."produtos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "produtos_select" ON "public"."produtos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "produtos_write" ON "public"."produtos" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_access_permissions"
  WHERE (("user_access_permissions"."user_id" = "auth"."uid"()) AND ("user_access_permissions"."can_view_financeiro_cfo" = true)))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public_insert_npa_leads" ON "public"."npa_evento_leads" FOR INSERT TO "anon" WITH CHECK (true);



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quick_sends" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quick_sends_delete" ON "public"."quick_sends" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "quick_sends_inserir" ON "public"."quick_sends" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "quick_sends_update" ON "public"."quick_sends" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "quick_sends_ver" ON "public"."quick_sends" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text"));



ALTER TABLE "public"."responsaveis" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "responsaveis_delete" ON "public"."responsaveis" FOR DELETE TO "authenticated" USING ("public"."is_gestor"());



CREATE POLICY "responsaveis_inserir" ON "public"."responsaveis" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_gestor"());



CREATE POLICY "responsaveis_update" ON "public"."responsaveis" FOR UPDATE TO "authenticated" USING ("public"."is_gestor"()) WITH CHECK ("public"."is_gestor"());



CREATE POLICY "responsaveis_ver" ON "public"."responsaveis" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."role_permissoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_permissoes_admin" ON "public"."role_permissoes" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "select_leads" ON "public"."leads" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "responsavel_id") OR "public"."is_gestor"() OR (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("origem" = 'Time Comercial'::"text") AND (("vendedor" IS NULL) OR ("vendedor" = ( SELECT "p"."nome"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())))))));



CREATE POLICY "select_profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "id") OR "public"."is_gestor"()));



CREATE POLICY "select_role" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."is_gestor"()));



ALTER TABLE "public"."seu_numerologo_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "seu_numerologo_config_delete" ON "public"."seu_numerologo_config" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('produtos'::"text", 'ver'::"text") AND "public"."tem_permissao"('produtos'::"text", 'editar'::"text")));



CREATE POLICY "seu_numerologo_config_inserir" ON "public"."seu_numerologo_config" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('produtos'::"text", 'ver'::"text") AND "public"."tem_permissao"('produtos'::"text", 'editar'::"text")));



CREATE POLICY "seu_numerologo_config_update" ON "public"."seu_numerologo_config" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('produtos'::"text", 'ver'::"text") AND "public"."tem_permissao"('produtos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('produtos'::"text", 'ver'::"text") AND "public"."tem_permissao"('produtos'::"text", 'editar'::"text")));



CREATE POLICY "seu_numerologo_config_ver" ON "public"."seu_numerologo_config" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('produtos'::"text", 'ver'::"text"));



ALTER TABLE "public"."seu_numerologo_leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "seu_numerologo_leads_delete" ON "public"."seu_numerologo_leads" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('produtos'::"text", 'ver'::"text") AND "public"."tem_permissao"('produtos'::"text", 'editar'::"text")));



CREATE POLICY "seu_numerologo_leads_inserir" ON "public"."seu_numerologo_leads" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('produtos'::"text", 'ver'::"text") AND "public"."tem_permissao"('produtos'::"text", 'editar'::"text")));



CREATE POLICY "seu_numerologo_leads_update" ON "public"."seu_numerologo_leads" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('produtos'::"text", 'ver'::"text") AND "public"."tem_permissao"('produtos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('produtos'::"text", 'ver'::"text") AND "public"."tem_permissao"('produtos'::"text", 'editar'::"text")));



CREATE POLICY "seu_numerologo_leads_ver" ON "public"."seu_numerologo_leads" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('produtos'::"text", 'ver'::"text"));



ALTER TABLE "public"."sheet_leads_33" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sheet_leads_36" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sheet_leads_36_delete" ON "public"."sheet_leads_36" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_36_inserir" ON "public"."sheet_leads_36" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_36_update" ON "public"."sheet_leads_36" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_36_ver" ON "public"."sheet_leads_36" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text"));



ALTER TABLE "public"."sheet_leads_37" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sheet_leads_37_delete" ON "public"."sheet_leads_37" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_37_inserir" ON "public"."sheet_leads_37" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_37_update" ON "public"."sheet_leads_37" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_37_ver" ON "public"."sheet_leads_37" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text"));



ALTER TABLE "public"."sheet_leads_38" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sheet_leads_38_delete" ON "public"."sheet_leads_38" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_38_inserir" ON "public"."sheet_leads_38" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_38_update" ON "public"."sheet_leads_38" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_38_ver" ON "public"."sheet_leads_38" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text"));



ALTER TABLE "public"."sheet_leads_39" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sheet_leads_39_delete" ON "public"."sheet_leads_39" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_39_inserir" ON "public"."sheet_leads_39" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_39_update" ON "public"."sheet_leads_39" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_39_ver" ON "public"."sheet_leads_39" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text"));



ALTER TABLE "public"."sheet_leads_40" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sheet_leads_40_delete" ON "public"."sheet_leads_40" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_40_inserir" ON "public"."sheet_leads_40" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_40_update" ON "public"."sheet_leads_40" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_40_ver" ON "public"."sheet_leads_40" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text"));



ALTER TABLE "public"."sheet_leads_41" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sheet_leads_41_delete" ON "public"."sheet_leads_41" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_41_inserir" ON "public"."sheet_leads_41" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_41_update" ON "public"."sheet_leads_41" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_41_ver" ON "public"."sheet_leads_41" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text"));



ALTER TABLE "public"."sheet_leads_42" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sheet_leads_42_delete" ON "public"."sheet_leads_42" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_42_inserir" ON "public"."sheet_leads_42" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_42_update" ON "public"."sheet_leads_42" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_42_ver" ON "public"."sheet_leads_42" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text"));



ALTER TABLE "public"."sheet_leads_43" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sheet_leads_43_delete" ON "public"."sheet_leads_43" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_43_inserir" ON "public"."sheet_leads_43" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_43_update" ON "public"."sheet_leads_43" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_43_ver" ON "public"."sheet_leads_43" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text"));



ALTER TABLE "public"."sheet_leads_44" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sheet_leads_44_delete" ON "public"."sheet_leads_44" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_44_inserir" ON "public"."sheet_leads_44" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_44_update" ON "public"."sheet_leads_44" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_44_ver" ON "public"."sheet_leads_44" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text"));



ALTER TABLE "public"."sheet_leads_45" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sheet_leads_45_delete" ON "public"."sheet_leads_45" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_45_inserir" ON "public"."sheet_leads_45" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_45_update" ON "public"."sheet_leads_45" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_45_ver" ON "public"."sheet_leads_45" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text"));



ALTER TABLE "public"."sheet_leads_46" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sheet_leads_46_delete" ON "public"."sheet_leads_46" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_46_inserir" ON "public"."sheet_leads_46" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_46_update" ON "public"."sheet_leads_46" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_46_ver" ON "public"."sheet_leads_46" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text"));



ALTER TABLE "public"."sheet_leads_47" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sheet_leads_47_delete" ON "public"."sheet_leads_47" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_47_inserir" ON "public"."sheet_leads_47" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_47_update" ON "public"."sheet_leads_47" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text") AND "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")));



CREATE POLICY "sheet_leads_47_ver" ON "public"."sheet_leads_47" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('lancamentos'::"text", 'ver'::"text"));



ALTER TABLE "public"."subtarefas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sv_app_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sv_app_config_admin" ON "public"."sv_app_config" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."sv_campanhas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sv_campanhas_admin" ON "public"."sv_campanhas" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."sv_evolution_configs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sv_evolution_configs_admin" ON "public"."sv_evolution_configs" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."sv_lead_mensagens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sv_lead_mensagens_admin" ON "public"."sv_lead_mensagens" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."sv_leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sv_leads_admin" ON "public"."sv_leads" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."sv_reunioes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sv_reunioes_admin" ON "public"."sv_reunioes" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."sv_scripts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sv_scripts_admin" ON "public"."sv_scripts" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."sv_tarefas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sv_tarefas_admin" ON "public"."sv_tarefas" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."tarefas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tarefas_checklists" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tarefas_checklists_delete" ON "public"."tarefas_checklists" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text")));



CREATE POLICY "tarefas_checklists_inserir" ON "public"."tarefas_checklists" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text")));



CREATE POLICY "tarefas_checklists_update" ON "public"."tarefas_checklists" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text")));



CREATE POLICY "tarefas_checklists_ver" ON "public"."tarefas_checklists" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('operacoes'::"text", 'ver'::"text"));



ALTER TABLE "public"."tarefas_comentarios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tarefas_comentarios_delete" ON "public"."tarefas_comentarios" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text")));



CREATE POLICY "tarefas_comentarios_inserir" ON "public"."tarefas_comentarios" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text")));



CREATE POLICY "tarefas_comentarios_update" ON "public"."tarefas_comentarios" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text")));



CREATE POLICY "tarefas_comentarios_ver" ON "public"."tarefas_comentarios" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('operacoes'::"text", 'ver'::"text"));



CREATE POLICY "tarefas_delete" ON "public"."tarefas" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text")));



ALTER TABLE "public"."tarefas_etapas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tarefas_etapas_delete" ON "public"."tarefas_etapas" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text")));



CREATE POLICY "tarefas_etapas_inserir" ON "public"."tarefas_etapas" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text")));



CREATE POLICY "tarefas_etapas_update" ON "public"."tarefas_etapas" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text")));



CREATE POLICY "tarefas_etapas_ver" ON "public"."tarefas_etapas" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('operacoes'::"text", 'ver'::"text"));



CREATE POLICY "tarefas_inserir" ON "public"."tarefas" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text")));



CREATE POLICY "tarefas_update" ON "public"."tarefas" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('operacoes'::"text", 'ver'::"text") AND "public"."tem_permissao"('operacoes'::"text", 'editar'::"text")));



CREATE POLICY "tarefas_ver" ON "public"."tarefas" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('operacoes'::"text", 'ver'::"text"));



ALTER TABLE "public"."time_comercial_campanhas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "time_comercial_campanhas_delete" ON "public"."time_comercial_campanhas" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('time_comercial'::"text", 'ver'::"text") AND "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text")));



CREATE POLICY "time_comercial_campanhas_inserir" ON "public"."time_comercial_campanhas" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('time_comercial'::"text", 'ver'::"text") AND "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text")));



CREATE POLICY "time_comercial_campanhas_update" ON "public"."time_comercial_campanhas" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('time_comercial'::"text", 'ver'::"text") AND "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('time_comercial'::"text", 'ver'::"text") AND "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text")));



CREATE POLICY "time_comercial_campanhas_ver" ON "public"."time_comercial_campanhas" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('time_comercial'::"text", 'ver'::"text"));



ALTER TABLE "public"."turma_disparo_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "turma_disparo_config_delete" ON "public"."turma_disparo_config" FOR DELETE TO "authenticated" USING ((("public"."tem_permissao"('alunos'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text") OR "public"."tem_permissao"('lancamentos'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('alunos'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text") OR "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))));



CREATE POLICY "turma_disparo_config_inserir" ON "public"."turma_disparo_config" FOR INSERT TO "authenticated" WITH CHECK ((("public"."tem_permissao"('alunos'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text") OR "public"."tem_permissao"('lancamentos'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('alunos'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text") OR "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))));



CREATE POLICY "turma_disparo_config_update" ON "public"."turma_disparo_config" FOR UPDATE TO "authenticated" USING ((("public"."tem_permissao"('alunos'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text") OR "public"."tem_permissao"('lancamentos'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('alunos'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text") OR "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text")))) WITH CHECK ((("public"."tem_permissao"('alunos'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text") OR "public"."tem_permissao"('lancamentos'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('alunos'::"text", 'editar'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'editar'::"text") OR "public"."tem_permissao"('lancamentos'::"text", 'editar'::"text"))));



CREATE POLICY "turma_disparo_config_ver" ON "public"."turma_disparo_config" FOR SELECT TO "authenticated" USING (("public"."tem_permissao"('alunos'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text") OR "public"."tem_permissao"('lancamentos'::"text", 'ver'::"text")));



ALTER TABLE "public"."turma_responsaveis" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "turma_responsaveis_delete" ON "public"."turma_responsaveis" FOR DELETE TO "authenticated" USING ("public"."is_gestor"());



CREATE POLICY "turma_responsaveis_inserir" ON "public"."turma_responsaveis" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_gestor"());



CREATE POLICY "turma_responsaveis_update" ON "public"."turma_responsaveis" FOR UPDATE TO "authenticated" USING ("public"."is_gestor"()) WITH CHECK ("public"."is_gestor"());



CREATE POLICY "turma_responsaveis_ver" ON "public"."turma_responsaveis" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."turmas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "turmas_delete" ON "public"."turmas" FOR DELETE TO "authenticated" USING ("public"."is_gestor"());



CREATE POLICY "turmas_inserir" ON "public"."turmas" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_gestor"());



CREATE POLICY "turmas_update" ON "public"."turmas" FOR UPDATE TO "authenticated" USING ("public"."is_gestor"()) WITH CHECK ("public"."is_gestor"());



CREATE POLICY "turmas_ver" ON "public"."turmas" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "uap_admin_apaga" ON "public"."user_access_permissions" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "uap_admin_atualiza" ON "public"."user_access_permissions" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "uap_admin_escreve" ON "public"."user_access_permissions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "uap_le_o_proprio" ON "public"."user_access_permissions" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "update_leads" ON "public"."leads" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "responsavel_id") OR "public"."is_gestor"() OR (("public"."tem_permissao"('pipeline'::"text", 'ver'::"text") OR "public"."tem_permissao"('time_comercial'::"text", 'ver'::"text")) AND ("origem" = 'Time Comercial'::"text") AND (("vendedor" IS NULL) OR ("vendedor" = ( SELECT "p"."nome"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())))))));



CREATE POLICY "update_profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "id") OR "public"."is_gestor"()));



CREATE POLICY "update_role" ON "public"."user_roles" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."user_access_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_override_admin_escreve" ON "public"."user_permissao_override" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "user_override_le_o_proprio" ON "public"."user_permissao_override" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."user_permissao_override" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."video_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_assets_delete" ON "public"."video_assets" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('reels_idm'::"text", 'ver'::"text") AND "public"."tem_permissao"('reels_idm'::"text", 'editar'::"text")));



CREATE POLICY "video_assets_inserir" ON "public"."video_assets" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('reels_idm'::"text", 'ver'::"text") AND "public"."tem_permissao"('reels_idm'::"text", 'editar'::"text")));



CREATE POLICY "video_assets_update" ON "public"."video_assets" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('reels_idm'::"text", 'ver'::"text") AND "public"."tem_permissao"('reels_idm'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('reels_idm'::"text", 'ver'::"text") AND "public"."tem_permissao"('reels_idm'::"text", 'editar'::"text")));



CREATE POLICY "video_assets_ver" ON "public"."video_assets" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('reels_idm'::"text", 'ver'::"text"));



ALTER TABLE "public"."video_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_jobs_delete" ON "public"."video_jobs" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('reels_idm'::"text", 'ver'::"text") AND "public"."tem_permissao"('reels_idm'::"text", 'editar'::"text")));



CREATE POLICY "video_jobs_inserir" ON "public"."video_jobs" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('reels_idm'::"text", 'ver'::"text") AND "public"."tem_permissao"('reels_idm'::"text", 'editar'::"text")));



CREATE POLICY "video_jobs_update" ON "public"."video_jobs" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('reels_idm'::"text", 'ver'::"text") AND "public"."tem_permissao"('reels_idm'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('reels_idm'::"text", 'ver'::"text") AND "public"."tem_permissao"('reels_idm'::"text", 'editar'::"text")));



CREATE POLICY "video_jobs_ver" ON "public"."video_jobs" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('reels_idm'::"text", 'ver'::"text"));



ALTER TABLE "public"."video_scripts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_scripts_delete" ON "public"."video_scripts" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('reels_idm'::"text", 'ver'::"text") AND "public"."tem_permissao"('reels_idm'::"text", 'editar'::"text")));



CREATE POLICY "video_scripts_inserir" ON "public"."video_scripts" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('reels_idm'::"text", 'ver'::"text") AND "public"."tem_permissao"('reels_idm'::"text", 'editar'::"text")));



CREATE POLICY "video_scripts_update" ON "public"."video_scripts" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('reels_idm'::"text", 'ver'::"text") AND "public"."tem_permissao"('reels_idm'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('reels_idm'::"text", 'ver'::"text") AND "public"."tem_permissao"('reels_idm'::"text", 'editar'::"text")));



CREATE POLICY "video_scripts_ver" ON "public"."video_scripts" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('reels_idm'::"text", 'ver'::"text"));



ALTER TABLE "public"."whatsapp_mensagens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_mensagens_delete" ON "public"."whatsapp_mensagens" FOR DELETE TO "authenticated" USING ((("public"."tem_permissao"('time_comercial'::"text", 'ver'::"text") OR "public"."tem_permissao"('chat_conversas'::"text", 'ver'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('time_comercial'::"text", 'editar'::"text") OR "public"."tem_permissao"('chat_conversas'::"text", 'editar'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text"))));



CREATE POLICY "whatsapp_mensagens_inserir" ON "public"."whatsapp_mensagens" FOR INSERT TO "authenticated" WITH CHECK ((("public"."tem_permissao"('time_comercial'::"text", 'ver'::"text") OR "public"."tem_permissao"('chat_conversas'::"text", 'ver'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('time_comercial'::"text", 'editar'::"text") OR "public"."tem_permissao"('chat_conversas'::"text", 'editar'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text"))));



CREATE POLICY "whatsapp_mensagens_update" ON "public"."whatsapp_mensagens" FOR UPDATE TO "authenticated" USING ((("public"."tem_permissao"('time_comercial'::"text", 'ver'::"text") OR "public"."tem_permissao"('chat_conversas'::"text", 'ver'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('time_comercial'::"text", 'editar'::"text") OR "public"."tem_permissao"('chat_conversas'::"text", 'editar'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")))) WITH CHECK ((("public"."tem_permissao"('time_comercial'::"text", 'ver'::"text") OR "public"."tem_permissao"('chat_conversas'::"text", 'ver'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text")) AND ("public"."tem_permissao"('time_comercial'::"text", 'editar'::"text") OR "public"."tem_permissao"('chat_conversas'::"text", 'editar'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text"))));



CREATE POLICY "whatsapp_mensagens_ver" ON "public"."whatsapp_mensagens" FOR SELECT TO "authenticated" USING (("public"."tem_permissao"('time_comercial'::"text", 'ver'::"text") OR "public"."tem_permissao"('chat_conversas'::"text", 'ver'::"text") OR "public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text")));



ALTER TABLE "public"."whatsapp_opt_out" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_opt_out_delete" ON "public"."whatsapp_opt_out" FOR DELETE TO "authenticated" USING (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "whatsapp_opt_out_inserir" ON "public"."whatsapp_opt_out" FOR INSERT TO "authenticated" WITH CHECK (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "whatsapp_opt_out_update" ON "public"."whatsapp_opt_out" FOR UPDATE TO "authenticated" USING (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text"))) WITH CHECK (("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text") AND "public"."tem_permissao"('disparos_monitor'::"text", 'editar'::"text")));



CREATE POLICY "whatsapp_opt_out_ver" ON "public"."whatsapp_opt_out" FOR SELECT TO "authenticated" USING ("public"."tem_permissao"('disparos_monitor'::"text", 'ver'::"text"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."aplicar_camada"("p_tabela" "text", "p_recurso" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."aplicar_camada"("p_tabela" "text", "p_recurso" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."aplicar_camada"("p_tabela" "text", "p_recurso" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."aplicar_camada_catalogo"("p_tabela" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."aplicar_camada_catalogo"("p_tabela" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."aplicar_camada_catalogo"("p_tabela" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."aplicar_camada_multi"("p_tabela" "text", "p_recursos" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."aplicar_camada_multi"("p_tabela" "text", "p_recursos" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."aplicar_camada_multi"("p_tabela" "text", "p_recursos" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."atualizar_fase_npa_lead"("p_lead_id" "uuid", "p_nova_fase" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."atualizar_fase_npa_lead"("p_lead_id" "uuid", "p_nova_fase" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."atualizar_fase_npa_lead"("p_lead_id" "uuid", "p_nova_fase" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."auto_disparo_36"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_disparo_36"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_disparo_36"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."definir_permissao"("p_user_id" "uuid", "p_recurso" "text", "p_acao" "text", "p_permitido" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."definir_permissao"("p_user_id" "uuid", "p_recurso" "text", "p_acao" "text", "p_permitido" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."definir_permissao"("p_user_id" "uuid", "p_recurso" "text", "p_acao" "text", "p_permitido" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."deletar_tarefa_cancelada"() TO "anon";
GRANT ALL ON FUNCTION "public"."deletar_tarefa_cancelada"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."deletar_tarefa_cancelada"() TO "service_role";



GRANT ALL ON FUNCTION "public"."desbloquear_primeira_etapa"() TO "anon";
GRANT ALL ON FUNCTION "public"."desbloquear_primeira_etapa"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."desbloquear_primeira_etapa"() TO "service_role";



GRANT ALL ON FUNCTION "public"."desbloquear_proxima_etapa"() TO "anon";
GRANT ALL ON FUNCTION "public"."desbloquear_proxima_etapa"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."desbloquear_proxima_etapa"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gerar_mensalidades_aluno"() TO "anon";
GRANT ALL ON FUNCTION "public"."gerar_mensalidades_aluno"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gerar_mensalidades_aluno"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_alunos_para_cobranca"("p_data" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_alunos_para_cobranca"("p_data" "date") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_alunos_para_cobranca"("p_data" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_equipe_11ds_composite_config"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_equipe_11ds_composite_config"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_equipe_11ds_cron_secret"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_equipe_11ds_cron_secret"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_equipe_11ds_elevenlabs_key"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_equipe_11ds_elevenlabs_key"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_equipe_11ds_github_config"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_equipe_11ds_github_config"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_idm_reels_worker_config"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_idm_reels_worker_config"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_pexels_api_key"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_pexels_api_key"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "anon";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_gestor"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_gestor"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_gestor"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_lancamento_evento"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_lancamento_evento"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_lancamento_evento"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_npa_evento"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_npa_evento"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_npa_evento"() TO "service_role";



GRANT ALL ON FUNCTION "public"."marcar_matriculado_lead_direto"() TO "anon";
GRANT ALL ON FUNCTION "public"."marcar_matriculado_lead_direto"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."marcar_matriculado_lead_direto"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."marcar_pagamentos_atrasados"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."marcar_pagamentos_atrasados"() TO "service_role";
GRANT ALL ON FUNCTION "public"."marcar_pagamentos_atrasados"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."minhas_permissoes"() TO "anon";
GRANT ALL ON FUNCTION "public"."minhas_permissoes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."minhas_permissoes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."normalizar_telefone"("p_valor" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalizar_telefone"("p_valor" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalizar_telefone"("p_valor" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."notificar"("p_user_id" "uuid", "p_tipo" "text", "p_titulo" "text", "p_descricao" "text", "p_link" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notificar"("p_user_id" "uuid", "p_tipo" "text", "p_titulo" "text", "p_descricao" "text", "p_link" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."notificar"("p_user_id" "uuid", "p_tipo" "text", "p_titulo" "text", "p_descricao" "text", "p_link" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."notificar_admins"("p_tipo" "text", "p_titulo" "text", "p_descricao" "text", "p_link" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notificar_admins"("p_tipo" "text", "p_titulo" "text", "p_descricao" "text", "p_link" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."notificar_vendedores_ativos"("p_tipo" "text", "p_titulo" "text", "p_descricao" "text", "p_link" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notificar_vendedores_ativos"("p_tipo" "text", "p_titulo" "text", "p_descricao" "text", "p_link" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_n8n_npa_bv_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_n8n_npa_bv_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_n8n_npa_bv_email"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."permissoes_efetivas"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."permissoes_efetivas"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."permissoes_efetivas"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."portal_aluno_por_token"("p_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."portal_aluno_por_token"("p_token" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."portal_aluno_por_token"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."portal_aluno_por_token"("p_token" "uuid") TO "anon";



REVOKE ALL ON FUNCTION "public"."portal_contrato_por_token"("p_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."portal_contrato_por_token"("p_token" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."portal_contrato_por_token"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."portal_contrato_por_token"("p_token" "uuid") TO "anon";



REVOKE ALL ON FUNCTION "public"."portal_pagamentos_por_token"("p_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."portal_pagamentos_por_token"("p_token" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."portal_pagamentos_por_token"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."portal_pagamentos_por_token"("p_token" "uuid") TO "anon";



GRANT ALL ON FUNCTION "public"."registrar_historico_fase_lead"() TO "anon";
GRANT ALL ON FUNCTION "public"."registrar_historico_fase_lead"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."registrar_historico_fase_lead"() TO "service_role";



GRANT ALL ON FUNCTION "public"."registrar_insert_anonimo"() TO "anon";
GRANT ALL ON FUNCTION "public"."registrar_insert_anonimo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."registrar_insert_anonimo"() TO "service_role";



GRANT ALL ON FUNCTION "public"."resolver_pessoa"("p_nome" "text", "p_telefone" "text", "p_email" "text", "p_cpf" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolver_pessoa"("p_nome" "text", "p_telefone" "text", "p_email" "text", "p_cpf" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolver_pessoa"("p_nome" "text", "p_telefone" "text", "p_email" "text", "p_cpf" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_valor_potencial"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_valor_potencial"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_valor_potencial"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sincronizar_inadimplencia"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sincronizar_inadimplencia"() TO "service_role";
GRANT ALL ON FUNCTION "public"."sincronizar_inadimplencia"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."sync_fase_lancamento_leads"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_fase_lancamento_leads"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_fase_lancamento_leads"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_fase_npa_lead"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_fase_npa_lead"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_fase_npa_lead"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_lancamento_lead_to_time_comercial"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_lancamento_lead_to_time_comercial"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_lancamento_lead_to_time_comercial"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_mensalidades_pagas"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_mensalidades_pagas"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_mensalidades_pagas"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_mind_map_node_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_mind_map_node_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_mind_map_node_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_planilha38_to_email_campanha"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_planilha38_to_email_campanha"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_planilha38_to_email_campanha"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_title"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_title"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_title"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tem_permissao"("p_recurso" "text", "p_acao" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."tem_permissao"("p_recurso" "text", "p_acao" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tem_permissao"("p_recurso" "text", "p_acao" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."time_comercial_alunos_vendedor"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."time_comercial_alunos_vendedor"() TO "service_role";
GRANT ALL ON FUNCTION "public"."time_comercial_alunos_vendedor"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."time_comercial_atividade_vendedor"("p_dias" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."time_comercial_atividade_vendedor"("p_dias" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."time_comercial_atividade_vendedor"("p_dias" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."time_comercial_ciclo_vendas"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."time_comercial_ciclo_vendas"() TO "service_role";
GRANT ALL ON FUNCTION "public"."time_comercial_ciclo_vendas"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."time_comercial_contagens"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."time_comercial_contagens"() TO "service_role";
GRANT ALL ON FUNCTION "public"."time_comercial_contagens"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."time_comercial_leads_por_mes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."time_comercial_leads_por_mes"() TO "service_role";
GRANT ALL ON FUNCTION "public"."time_comercial_leads_por_mes"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."time_comercial_metricas_turma"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."time_comercial_metricas_turma"() TO "service_role";
GRANT ALL ON FUNCTION "public"."time_comercial_metricas_turma"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."time_comercial_movimentacao_dia"("dias" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."time_comercial_movimentacao_dia"("dias" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."time_comercial_movimentacao_dia"("dias" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."time_comercial_registrar_contato"("p_lead_id" "uuid", "p_vendedor" "text", "p_tipo" "text", "p_criado_em" timestamp with time zone, "p_atendeu" boolean, "p_resumo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."time_comercial_registrar_contato"("p_lead_id" "uuid", "p_vendedor" "text", "p_tipo" "text", "p_criado_em" timestamp with time zone, "p_atendeu" boolean, "p_resumo" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."time_comercial_registrar_contato"("p_lead_id" "uuid", "p_vendedor" "text", "p_tipo" "text", "p_criado_em" timestamp with time zone, "p_atendeu" boolean, "p_resumo" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."time_comercial_sem_vendedor_antigo"("dias" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."time_comercial_sem_vendedor_antigo"("dias" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."time_comercial_sem_vendedor_antigo"("dias" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."time_comercial_vendas_por_dia_semana"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."time_comercial_vendas_por_dia_semana"() TO "service_role";
GRANT ALL ON FUNCTION "public"."time_comercial_vendas_por_dia_semana"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."time_comercial_vendas_por_epoca_mes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."time_comercial_vendas_por_epoca_mes"() TO "service_role";
GRANT ALL ON FUNCTION "public"."time_comercial_vendas_por_epoca_mes"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."time_comercial_vendas_por_mes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."time_comercial_vendas_por_mes"() TO "service_role";
GRANT ALL ON FUNCTION "public"."time_comercial_vendas_por_mes"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_pessoa_registrar_vinculo"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_pessoa_registrar_vinculo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_pessoa_registrar_vinculo"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_pessoa_vincular"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_pessoa_vincular"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_pessoa_vincular"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_lancamento_lead_bv"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_lancamento_lead_bv"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_lancamento_lead_bv"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_notification_push"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_notification_push"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_notification_push"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_npa_bv_auto"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_npa_bv_auto"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_npa_bv_auto"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_npa_pix_auto"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_npa_pix_auto"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_npa_pix_auto"() TO "service_role";



GRANT ALL ON FUNCTION "public"."turmas_financeiro_permitidas"() TO "anon";
GRANT ALL ON FUNCTION "public"."turmas_financeiro_permitidas"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."turmas_financeiro_permitidas"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_kanban_colunas_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_kanban_colunas_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_kanban_colunas_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ultima_atividade"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ultima_atividade"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ultima_atividade"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verificar_inadimplencia"() TO "anon";
GRANT ALL ON FUNCTION "public"."verificar_inadimplencia"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."verificar_inadimplencia"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verificar_tarefa_concluida"() TO "anon";
GRANT ALL ON FUNCTION "public"."verificar_tarefa_concluida"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."verificar_tarefa_concluida"() TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."aluno_bonus_eventos" TO "anon";
GRANT ALL ON TABLE "public"."aluno_bonus_eventos" TO "authenticated";
GRANT ALL ON TABLE "public"."aluno_bonus_eventos" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."aluno_observacoes" TO "anon";
GRANT ALL ON TABLE "public"."aluno_observacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."aluno_observacoes" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."alunos" TO "anon";
GRANT ALL ON TABLE "public"."alunos" TO "authenticated";
GRANT ALL ON TABLE "public"."alunos" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."alunos_financeiro" TO "anon";
GRANT ALL ON TABLE "public"."alunos_financeiro" TO "authenticated";
GRANT ALL ON TABLE "public"."alunos_financeiro" TO "service_role";



GRANT INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."anon_insert_watch" TO "anon";
GRANT ALL ON TABLE "public"."anon_insert_watch" TO "authenticated";
GRANT ALL ON TABLE "public"."anon_insert_watch" TO "service_role";



GRANT ALL ON SEQUENCE "public"."anon_insert_watch_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."anon_insert_watch_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."anon_insert_watch_id_seq" TO "service_role";



GRANT INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."app_recursos" TO "anon";
GRANT ALL ON TABLE "public"."app_recursos" TO "authenticated";
GRANT ALL ON TABLE "public"."app_recursos" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."aquecimento_chips" TO "anon";
GRANT ALL ON TABLE "public"."aquecimento_chips" TO "authenticated";
GRANT ALL ON TABLE "public"."aquecimento_chips" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."aquecimento_config" TO "anon";
GRANT ALL ON TABLE "public"."aquecimento_config" TO "authenticated";
GRANT ALL ON TABLE "public"."aquecimento_config" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."aquecimento_grupos" TO "anon";
GRANT ALL ON TABLE "public"."aquecimento_grupos" TO "authenticated";
GRANT ALL ON TABLE "public"."aquecimento_grupos" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."aquecimento_jobs" TO "anon";
GRANT ALL ON TABLE "public"."aquecimento_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."aquecimento_jobs" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."aquecimento_mensagens" TO "anon";
GRANT ALL ON TABLE "public"."aquecimento_mensagens" TO "authenticated";
GRANT ALL ON TABLE "public"."aquecimento_mensagens" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."aquecimento_roteiro_mensagens" TO "anon";
GRANT ALL ON TABLE "public"."aquecimento_roteiro_mensagens" TO "authenticated";
GRANT ALL ON TABLE "public"."aquecimento_roteiro_mensagens" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."aquecimento_roteiros_dm" TO "anon";
GRANT ALL ON TABLE "public"."aquecimento_roteiros_dm" TO "authenticated";
GRANT ALL ON TABLE "public"."aquecimento_roteiros_dm" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."evolution_conexao_eventos" TO "anon";
GRANT ALL ON TABLE "public"."evolution_conexao_eventos" TO "authenticated";
GRANT ALL ON TABLE "public"."evolution_conexao_eventos" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."evolution_config" TO "anon";
GRANT ALL ON TABLE "public"."evolution_config" TO "authenticated";
GRANT ALL ON TABLE "public"."evolution_config" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."aquecimento_saude_view" TO "anon";
GRANT ALL ON TABLE "public"."aquecimento_saude_view" TO "authenticated";
GRANT ALL ON TABLE "public"."aquecimento_saude_view" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."aula_secreta_eventos" TO "anon";
GRANT ALL ON TABLE "public"."aula_secreta_eventos" TO "authenticated";
GRANT ALL ON TABLE "public"."aula_secreta_eventos" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."aula_secreta_leads" TO "anon";
GRANT ALL ON TABLE "public"."aula_secreta_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."aula_secreta_leads" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."aula_secreta_log" TO "anon";
GRANT ALL ON TABLE "public"."aula_secreta_log" TO "authenticated";
GRANT ALL ON TABLE "public"."aula_secreta_log" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."balanco_config" TO "anon";
GRANT ALL ON TABLE "public"."balanco_config" TO "authenticated";
GRANT ALL ON TABLE "public"."balanco_config" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."balanco_itens" TO "anon";
GRANT ALL ON TABLE "public"."balanco_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."balanco_itens" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."boas_vindas_agendados" TO "anon";
GRANT ALL ON TABLE "public"."boas_vindas_agendados" TO "authenticated";
GRANT ALL ON TABLE "public"."boas_vindas_agendados" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."boas_vindas_config" TO "anon";
GRANT ALL ON TABLE "public"."boas_vindas_config" TO "authenticated";
GRANT ALL ON TABLE "public"."boas_vindas_config" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."boas_vindas_logs" TO "anon";
GRANT ALL ON TABLE "public"."boas_vindas_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."boas_vindas_logs" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."bonus_tipos" TO "anon";
GRANT ALL ON TABLE "public"."bonus_tipos" TO "authenticated";
GRANT ALL ON TABLE "public"."bonus_tipos" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."bonus_turmas" TO "anon";
GRANT ALL ON TABLE "public"."bonus_turmas" TO "authenticated";
GRANT ALL ON TABLE "public"."bonus_turmas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."canais_cobranca" TO "anon";
GRANT ALL ON TABLE "public"."canais_cobranca" TO "authenticated";
GRANT ALL ON TABLE "public"."canais_cobranca" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."chat_leituras" TO "anon";
GRANT ALL ON TABLE "public"."chat_leituras" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_leituras" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."cobranca_config" TO "anon";
GRANT ALL ON TABLE "public"."cobranca_config" TO "authenticated";
GRANT ALL ON TABLE "public"."cobranca_config" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."cobranca_ia_conversas" TO "anon";
GRANT ALL ON TABLE "public"."cobranca_ia_conversas" TO "authenticated";
GRANT ALL ON TABLE "public"."cobranca_ia_conversas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."cobranca_ia_mensagens" TO "anon";
GRANT ALL ON TABLE "public"."cobranca_ia_mensagens" TO "authenticated";
GRANT ALL ON TABLE "public"."cobranca_ia_mensagens" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."cobranca_logs" TO "anon";
GRANT ALL ON TABLE "public"."cobranca_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."cobranca_logs" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."cobranca_templates" TO "anon";
GRANT ALL ON TABLE "public"."cobranca_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."cobranca_templates" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."cobranca_turmas_ativas" TO "anon";
GRANT ALL ON TABLE "public"."cobranca_turmas_ativas" TO "authenticated";
GRANT ALL ON TABLE "public"."cobranca_turmas_ativas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."conteudo_calendario" TO "anon";
GRANT ALL ON TABLE "public"."conteudo_calendario" TO "authenticated";
GRANT ALL ON TABLE "public"."conteudo_calendario" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."conteudo_clientes" TO "anon";
GRANT ALL ON TABLE "public"."conteudo_clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."conteudo_clientes" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."conteudo_posts" TO "anon";
GRANT ALL ON TABLE "public"."conteudo_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."conteudo_posts" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."crm_config" TO "anon";
GRANT ALL ON TABLE "public"."crm_config" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_config" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."cursos" TO "anon";
GRANT ALL ON TABLE "public"."cursos" TO "authenticated";
GRANT ALL ON TABLE "public"."cursos" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."dashboard_metricas" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_metricas" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_metricas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."ddd_regioes" TO "anon";
GRANT ALL ON TABLE "public"."ddd_regioes" TO "authenticated";
GRANT ALL ON TABLE "public"."ddd_regioes" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."disparo_campanhas" TO "anon";
GRANT ALL ON TABLE "public"."disparo_campanhas" TO "authenticated";
GRANT ALL ON TABLE "public"."disparo_campanhas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."disparo_leads" TO "anon";
GRANT ALL ON TABLE "public"."disparo_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."disparo_leads" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."email_config" TO "anon";
GRANT ALL ON TABLE "public"."email_config" TO "authenticated";
GRANT ALL ON TABLE "public"."email_config" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."equipe" TO "anon";
GRANT ALL ON TABLE "public"."equipe" TO "authenticated";
GRANT ALL ON TABLE "public"."equipe" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."equipe_11ds_agentes" TO "anon";
GRANT ALL ON TABLE "public"."equipe_11ds_agentes" TO "authenticated";
GRANT ALL ON TABLE "public"."equipe_11ds_agentes" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."equipe_11ds_blueprints" TO "anon";
GRANT ALL ON TABLE "public"."equipe_11ds_blueprints" TO "authenticated";
GRANT ALL ON TABLE "public"."equipe_11ds_blueprints" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."equipe_11ds_chat_acoes" TO "anon";
GRANT ALL ON TABLE "public"."equipe_11ds_chat_acoes" TO "authenticated";
GRANT ALL ON TABLE "public"."equipe_11ds_chat_acoes" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."equipe_11ds_chat_mensagens" TO "anon";
GRANT ALL ON TABLE "public"."equipe_11ds_chat_mensagens" TO "authenticated";
GRANT ALL ON TABLE "public"."equipe_11ds_chat_mensagens" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."equipe_11ds_ferramenta_chamadas" TO "anon";
GRANT ALL ON TABLE "public"."equipe_11ds_ferramenta_chamadas" TO "authenticated";
GRANT ALL ON TABLE "public"."equipe_11ds_ferramenta_chamadas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."equipe_11ds_memorias" TO "anon";
GRANT ALL ON TABLE "public"."equipe_11ds_memorias" TO "authenticated";
GRANT ALL ON TABLE "public"."equipe_11ds_memorias" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."equipe_11ds_mensagens" TO "anon";
GRANT ALL ON TABLE "public"."equipe_11ds_mensagens" TO "authenticated";
GRANT ALL ON TABLE "public"."equipe_11ds_mensagens" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."equipe_11ds_plano_etapas" TO "anon";
GRANT ALL ON TABLE "public"."equipe_11ds_plano_etapas" TO "authenticated";
GRANT ALL ON TABLE "public"."equipe_11ds_plano_etapas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."equipe_11ds_planos" TO "anon";
GRANT ALL ON TABLE "public"."equipe_11ds_planos" TO "authenticated";
GRANT ALL ON TABLE "public"."equipe_11ds_planos" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."equipe_11ds_recorrentes" TO "anon";
GRANT ALL ON TABLE "public"."equipe_11ds_recorrentes" TO "authenticated";
GRANT ALL ON TABLE "public"."equipe_11ds_recorrentes" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."equipe_11ds_tarefas" TO "anon";
GRANT ALL ON TABLE "public"."equipe_11ds_tarefas" TO "authenticated";
GRANT ALL ON TABLE "public"."equipe_11ds_tarefas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."equipe_11ds_times" TO "anon";
GRANT ALL ON TABLE "public"."equipe_11ds_times" TO "authenticated";
GRANT ALL ON TABLE "public"."equipe_11ds_times" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."eventos_calendario" TO "anon";
GRANT ALL ON TABLE "public"."eventos_calendario" TO "authenticated";
GRANT ALL ON TABLE "public"."eventos_calendario" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."evolution_task_config" TO "anon";
GRANT ALL ON TABLE "public"."evolution_task_config" TO "authenticated";
GRANT ALL ON TABLE "public"."evolution_task_config" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."fechamentos" TO "anon";
GRANT ALL ON TABLE "public"."fechamentos" TO "authenticated";
GRANT ALL ON TABLE "public"."fechamentos" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."pagamentos" TO "anon";
GRANT ALL ON TABLE "public"."pagamentos" TO "authenticated";
GRANT ALL ON TABLE "public"."pagamentos" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."turmas" TO "anon";
GRANT ALL ON TABLE "public"."turmas" TO "authenticated";
GRANT ALL ON TABLE "public"."turmas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."financeiro_resumo" TO "anon";
GRANT ALL ON TABLE "public"."financeiro_resumo" TO "authenticated";
GRANT ALL ON TABLE "public"."financeiro_resumo" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."fontes" TO "anon";
GRANT ALL ON TABLE "public"."fontes" TO "authenticated";
GRANT ALL ON TABLE "public"."fontes" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."franquia_campanha" TO "anon";
GRANT ALL ON TABLE "public"."franquia_campanha" TO "authenticated";
GRANT ALL ON TABLE "public"."franquia_campanha" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."franquia_leads" TO "anon";
GRANT ALL ON TABLE "public"."franquia_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."franquia_leads" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."funnel_configs" TO "anon";
GRANT ALL ON TABLE "public"."funnel_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."funnel_configs" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."funnel_messages" TO "anon";
GRANT ALL ON TABLE "public"."funnel_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."funnel_messages" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."funnel_poll_respostas" TO "anon";
GRANT ALL ON TABLE "public"."funnel_poll_respostas" TO "authenticated";
GRANT ALL ON TABLE "public"."funnel_poll_respostas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."grupo_add_jobs" TO "anon";
GRANT ALL ON TABLE "public"."grupo_add_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."grupo_add_jobs" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."idm_criativos_log" TO "anon";
GRANT ALL ON TABLE "public"."idm_criativos_log" TO "authenticated";
GRANT ALL ON TABLE "public"."idm_criativos_log" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."idm_quiz_leads" TO "anon";
GRANT ALL ON TABLE "public"."idm_quiz_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."idm_quiz_leads" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."kanban_colunas" TO "anon";
GRANT ALL ON TABLE "public"."kanban_colunas" TO "authenticated";
GRANT ALL ON TABLE "public"."kanban_colunas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."lancamento_campanhas" TO "anon";
GRANT ALL ON TABLE "public"."lancamento_campanhas" TO "authenticated";
GRANT ALL ON TABLE "public"."lancamento_campanhas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."lancamento_eventos" TO "anon";
GRANT ALL ON TABLE "public"."lancamento_eventos" TO "authenticated";
GRANT ALL ON TABLE "public"."lancamento_eventos" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."lancamento_leads" TO "anon";
GRANT ALL ON TABLE "public"."lancamento_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."lancamento_leads" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."lancamentos" TO "anon";
GRANT ALL ON TABLE "public"."lancamentos" TO "authenticated";
GRANT ALL ON TABLE "public"."lancamentos" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."lancamento_kanban" TO "anon";
GRANT ALL ON TABLE "public"."lancamento_kanban" TO "authenticated";
GRANT ALL ON TABLE "public"."lancamento_kanban" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."lead_aquecimento_campanhas" TO "anon";
GRANT ALL ON TABLE "public"."lead_aquecimento_campanhas" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_aquecimento_campanhas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."lead_aquecimento_config" TO "anon";
GRANT ALL ON TABLE "public"."lead_aquecimento_config" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_aquecimento_config" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."lead_aquecimento_fases" TO "anon";
GRANT ALL ON TABLE "public"."lead_aquecimento_fases" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_aquecimento_fases" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."lead_aquecimento_leads" TO "anon";
GRANT ALL ON TABLE "public"."lead_aquecimento_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_aquecimento_leads" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."lead_aquecimento_vendedores" TO "anon";
GRANT ALL ON TABLE "public"."lead_aquecimento_vendedores" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_aquecimento_vendedores" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."lead_cartas_usadas" TO "anon";
GRANT ALL ON TABLE "public"."lead_cartas_usadas" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_cartas_usadas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."lead_respostas" TO "anon";
GRANT ALL ON TABLE "public"."lead_respostas" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_respostas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."leads_cartas_negociacao" TO "anon";
GRANT ALL ON TABLE "public"."leads_cartas_negociacao" TO "authenticated";
GRANT ALL ON TABLE "public"."leads_cartas_negociacao" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."leads_diretos_config" TO "anon";
GRANT ALL ON TABLE "public"."leads_diretos_config" TO "authenticated";
GRANT ALL ON TABLE "public"."leads_diretos_config" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."leads_historico_fase" TO "anon";
GRANT ALL ON TABLE "public"."leads_historico_fase" TO "authenticated";
GRANT ALL ON TABLE "public"."leads_historico_fase" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."leads_ia_config" TO "anon";
GRANT ALL ON TABLE "public"."leads_ia_config" TO "authenticated";
GRANT ALL ON TABLE "public"."leads_ia_config" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."leads_ia_conhecimento" TO "anon";
GRANT ALL ON TABLE "public"."leads_ia_conhecimento" TO "authenticated";
GRANT ALL ON TABLE "public"."leads_ia_conhecimento" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."leads_ia_conhecimento_sugestoes" TO "anon";
GRANT ALL ON TABLE "public"."leads_ia_conhecimento_sugestoes" TO "authenticated";
GRANT ALL ON TABLE "public"."leads_ia_conhecimento_sugestoes" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."leads_ia_conversas" TO "anon";
GRANT ALL ON TABLE "public"."leads_ia_conversas" TO "authenticated";
GRANT ALL ON TABLE "public"."leads_ia_conversas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."leads_ia_debounce" TO "anon";
GRANT ALL ON TABLE "public"."leads_ia_debounce" TO "authenticated";
GRANT ALL ON TABLE "public"."leads_ia_debounce" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."leads_ia_mensagens" TO "anon";
GRANT ALL ON TABLE "public"."leads_ia_mensagens" TO "authenticated";
GRANT ALL ON TABLE "public"."leads_ia_mensagens" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."leads_ia_oferta_ativa" TO "anon";
GRANT ALL ON TABLE "public"."leads_ia_oferta_ativa" TO "authenticated";
GRANT ALL ON TABLE "public"."leads_ia_oferta_ativa" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."leads_produtos_valores" TO "anon";
GRANT ALL ON TABLE "public"."leads_produtos_valores" TO "authenticated";
GRANT ALL ON TABLE "public"."leads_produtos_valores" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."leads_quadro_cards" TO "anon";
GRANT ALL ON TABLE "public"."leads_quadro_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."leads_quadro_cards" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."leads_quadros" TO "anon";
GRANT ALL ON TABLE "public"."leads_quadros" TO "authenticated";
GRANT ALL ON TABLE "public"."leads_quadros" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."npa_evento_leads" TO "anon";
GRANT ALL ON TABLE "public"."npa_evento_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."npa_evento_leads" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."npa_eventos" TO "anon";
GRANT ALL ON TABLE "public"."npa_eventos" TO "authenticated";
GRANT ALL ON TABLE "public"."npa_eventos" TO "service_role";



GRANT ALL ON TABLE "public"."seu_numerologo_leads" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."seu_numerologo_leads" TO "authenticated";



GRANT ALL ON TABLE "public"."leads_unificados" TO "service_role";
GRANT SELECT ON TABLE "public"."leads_unificados" TO "authenticated";



GRANT INSERT,MAINTAIN ON TABLE "public"."lista_espera_cidades" TO "anon";
GRANT ALL ON TABLE "public"."lista_espera_cidades" TO "authenticated";
GRANT ALL ON TABLE "public"."lista_espera_cidades" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."midia_imagens_reaproveitaveis" TO "anon";
GRANT ALL ON TABLE "public"."midia_imagens_reaproveitaveis" TO "authenticated";
GRANT ALL ON TABLE "public"."midia_imagens_reaproveitaveis" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."mind_map_connections" TO "anon";
GRANT ALL ON TABLE "public"."mind_map_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."mind_map_connections" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."mind_map_nodes" TO "anon";
GRANT ALL ON TABLE "public"."mind_map_nodes" TO "authenticated";
GRANT ALL ON TABLE "public"."mind_map_nodes" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."mind_map_pages" TO "anon";
GRANT ALL ON TABLE "public"."mind_map_pages" TO "authenticated";
GRANT ALL ON TABLE "public"."mind_map_pages" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."npa_eventos_log" TO "anon";
GRANT ALL ON TABLE "public"."npa_eventos_log" TO "authenticated";
GRANT ALL ON TABLE "public"."npa_eventos_log" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."npa_kanban" TO "anon";
GRANT ALL ON TABLE "public"."npa_kanban" TO "authenticated";
GRANT ALL ON TABLE "public"."npa_kanban" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."parceiros" TO "anon";
GRANT ALL ON TABLE "public"."parceiros" TO "authenticated";
GRANT ALL ON TABLE "public"."parceiros" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."parceiros_cliques" TO "anon";
GRANT ALL ON TABLE "public"."parceiros_cliques" TO "authenticated";
GRANT ALL ON TABLE "public"."parceiros_cliques" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."parceiros_cupons" TO "anon";
GRANT ALL ON TABLE "public"."parceiros_cupons" TO "authenticated";
GRANT ALL ON TABLE "public"."parceiros_cupons" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."parceiros_entregas" TO "anon";
GRANT ALL ON TABLE "public"."parceiros_entregas" TO "authenticated";
GRANT ALL ON TABLE "public"."parceiros_entregas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."parceiros_entregas_arquivos" TO "anon";
GRANT ALL ON TABLE "public"."parceiros_entregas_arquivos" TO "authenticated";
GRANT ALL ON TABLE "public"."parceiros_entregas_arquivos" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."parceiros_entregas_comentarios" TO "anon";
GRANT ALL ON TABLE "public"."parceiros_entregas_comentarios" TO "authenticated";
GRANT ALL ON TABLE "public"."parceiros_entregas_comentarios" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."parceiros_links" TO "anon";
GRANT ALL ON TABLE "public"."parceiros_links" TO "authenticated";
GRANT ALL ON TABLE "public"."parceiros_links" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."parceiros_metas" TO "anon";
GRANT ALL ON TABLE "public"."parceiros_metas" TO "authenticated";
GRANT ALL ON TABLE "public"."parceiros_metas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."parceiros_produtos" TO "anon";
GRANT ALL ON TABLE "public"."parceiros_produtos" TO "authenticated";
GRANT ALL ON TABLE "public"."parceiros_produtos" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."parceiros_produtos_checkout" TO "anon";
GRANT ALL ON TABLE "public"."parceiros_produtos_checkout" TO "authenticated";
GRANT ALL ON TABLE "public"."parceiros_produtos_checkout" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."parceiros_vendas" TO "anon";
GRANT ALL ON TABLE "public"."parceiros_vendas" TO "authenticated";
GRANT ALL ON TABLE "public"."parceiros_vendas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."parceiros_video_metricas" TO "anon";
GRANT ALL ON TABLE "public"."parceiros_video_metricas" TO "authenticated";
GRANT ALL ON TABLE "public"."parceiros_video_metricas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."payment_method_rates" TO "anon";
GRANT ALL ON TABLE "public"."payment_method_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_method_rates" TO "service_role";



GRANT INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pessoa_identificadores" TO "anon";
GRANT ALL ON TABLE "public"."pessoa_identificadores" TO "authenticated";
GRANT ALL ON TABLE "public"."pessoa_identificadores" TO "service_role";



GRANT INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pessoas" TO "anon";
GRANT ALL ON TABLE "public"."pessoas" TO "authenticated";
GRANT ALL ON TABLE "public"."pessoas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."whatsapp_mensagens" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_mensagens" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_mensagens" TO "service_role";



GRANT INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pessoa_timeline" TO "anon";
GRANT ALL ON TABLE "public"."pessoa_timeline" TO "authenticated";
GRANT ALL ON TABLE "public"."pessoa_timeline" TO "service_role";



GRANT INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pessoa_vinculos" TO "anon";
GRANT ALL ON TABLE "public"."pessoa_vinculos" TO "authenticated";
GRANT ALL ON TABLE "public"."pessoa_vinculos" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."produtos" TO "anon";
GRANT ALL ON TABLE "public"."produtos" TO "authenticated";
GRANT ALL ON TABLE "public"."produtos" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."quick_sends" TO "anon";
GRANT ALL ON TABLE "public"."quick_sends" TO "authenticated";
GRANT ALL ON TABLE "public"."quick_sends" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."responsaveis" TO "anon";
GRANT ALL ON TABLE "public"."responsaveis" TO "authenticated";
GRANT ALL ON TABLE "public"."responsaveis" TO "service_role";



GRANT INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."role_permissoes" TO "anon";
GRANT ALL ON TABLE "public"."role_permissoes" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissoes" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."seu_numerologo_config" TO "anon";
GRANT ALL ON TABLE "public"."seu_numerologo_config" TO "authenticated";
GRANT ALL ON TABLE "public"."seu_numerologo_config" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sheet_leads_33" TO "anon";
GRANT ALL ON TABLE "public"."sheet_leads_33" TO "authenticated";
GRANT ALL ON TABLE "public"."sheet_leads_33" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sheet_leads_33_row_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sheet_leads_33_row_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sheet_leads_33_row_id_seq" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sheet_leads_36" TO "anon";
GRANT ALL ON TABLE "public"."sheet_leads_36" TO "authenticated";
GRANT ALL ON TABLE "public"."sheet_leads_36" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sheet_leads_36_row_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sheet_leads_36_row_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sheet_leads_36_row_id_seq" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sheet_leads_37" TO "anon";
GRANT ALL ON TABLE "public"."sheet_leads_37" TO "authenticated";
GRANT ALL ON TABLE "public"."sheet_leads_37" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sheet_leads_37_row_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sheet_leads_37_row_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sheet_leads_37_row_id_seq" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sheet_leads_38" TO "anon";
GRANT ALL ON TABLE "public"."sheet_leads_38" TO "authenticated";
GRANT ALL ON TABLE "public"."sheet_leads_38" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sheet_leads_38_row_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sheet_leads_38_row_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sheet_leads_38_row_id_seq" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sheet_leads_39" TO "anon";
GRANT ALL ON TABLE "public"."sheet_leads_39" TO "authenticated";
GRANT ALL ON TABLE "public"."sheet_leads_39" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sheet_leads_39_row_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sheet_leads_39_row_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sheet_leads_39_row_id_seq" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sheet_leads_40" TO "anon";
GRANT ALL ON TABLE "public"."sheet_leads_40" TO "authenticated";
GRANT ALL ON TABLE "public"."sheet_leads_40" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sheet_leads_40_row_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sheet_leads_40_row_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sheet_leads_40_row_id_seq" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sheet_leads_41" TO "anon";
GRANT ALL ON TABLE "public"."sheet_leads_41" TO "authenticated";
GRANT ALL ON TABLE "public"."sheet_leads_41" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sheet_leads_41_row_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sheet_leads_41_row_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sheet_leads_41_row_id_seq" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sheet_leads_42" TO "anon";
GRANT ALL ON TABLE "public"."sheet_leads_42" TO "authenticated";
GRANT ALL ON TABLE "public"."sheet_leads_42" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sheet_leads_42_row_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sheet_leads_42_row_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sheet_leads_42_row_id_seq" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sheet_leads_43" TO "anon";
GRANT ALL ON TABLE "public"."sheet_leads_43" TO "authenticated";
GRANT ALL ON TABLE "public"."sheet_leads_43" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sheet_leads_43_row_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sheet_leads_43_row_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sheet_leads_43_row_id_seq" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sheet_leads_44" TO "anon";
GRANT ALL ON TABLE "public"."sheet_leads_44" TO "authenticated";
GRANT ALL ON TABLE "public"."sheet_leads_44" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sheet_leads_44_row_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sheet_leads_44_row_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sheet_leads_44_row_id_seq" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sheet_leads_45" TO "anon";
GRANT ALL ON TABLE "public"."sheet_leads_45" TO "authenticated";
GRANT ALL ON TABLE "public"."sheet_leads_45" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sheet_leads_45_row_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sheet_leads_45_row_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sheet_leads_45_row_id_seq" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sheet_leads_46" TO "anon";
GRANT ALL ON TABLE "public"."sheet_leads_46" TO "authenticated";
GRANT ALL ON TABLE "public"."sheet_leads_46" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sheet_leads_46_row_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sheet_leads_46_row_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sheet_leads_46_row_id_seq" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sheet_leads_47" TO "anon";
GRANT ALL ON TABLE "public"."sheet_leads_47" TO "authenticated";
GRANT ALL ON TABLE "public"."sheet_leads_47" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sheet_leads_47_row_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sheet_leads_47_row_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sheet_leads_47_row_id_seq" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."subtarefas" TO "anon";
GRANT ALL ON TABLE "public"."subtarefas" TO "authenticated";
GRANT ALL ON TABLE "public"."subtarefas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sv_app_config" TO "anon";
GRANT ALL ON TABLE "public"."sv_app_config" TO "authenticated";
GRANT ALL ON TABLE "public"."sv_app_config" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sv_campanhas" TO "anon";
GRANT ALL ON TABLE "public"."sv_campanhas" TO "authenticated";
GRANT ALL ON TABLE "public"."sv_campanhas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sv_evolution_configs" TO "anon";
GRANT ALL ON TABLE "public"."sv_evolution_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."sv_evolution_configs" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sv_lead_mensagens" TO "anon";
GRANT ALL ON TABLE "public"."sv_lead_mensagens" TO "authenticated";
GRANT ALL ON TABLE "public"."sv_lead_mensagens" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sv_leads" TO "anon";
GRANT ALL ON TABLE "public"."sv_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."sv_leads" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sv_reunioes" TO "anon";
GRANT ALL ON TABLE "public"."sv_reunioes" TO "authenticated";
GRANT ALL ON TABLE "public"."sv_reunioes" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sv_scripts" TO "anon";
GRANT ALL ON TABLE "public"."sv_scripts" TO "authenticated";
GRANT ALL ON TABLE "public"."sv_scripts" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."sv_tarefas" TO "anon";
GRANT ALL ON TABLE "public"."sv_tarefas" TO "authenticated";
GRANT ALL ON TABLE "public"."sv_tarefas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."tarefas" TO "anon";
GRANT ALL ON TABLE "public"."tarefas" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."tarefas_checklists" TO "anon";
GRANT ALL ON TABLE "public"."tarefas_checklists" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefas_checklists" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."tarefas_comentarios" TO "anon";
GRANT ALL ON TABLE "public"."tarefas_comentarios" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefas_comentarios" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."tarefas_etapas" TO "anon";
GRANT ALL ON TABLE "public"."tarefas_etapas" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefas_etapas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."time_comercial_campanhas" TO "anon";
GRANT ALL ON TABLE "public"."time_comercial_campanhas" TO "authenticated";
GRANT ALL ON TABLE "public"."time_comercial_campanhas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."turma_disparo_config" TO "anon";
GRANT ALL ON TABLE "public"."turma_disparo_config" TO "authenticated";
GRANT ALL ON TABLE "public"."turma_disparo_config" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."turma_responsaveis" TO "anon";
GRANT ALL ON TABLE "public"."turma_responsaveis" TO "authenticated";
GRANT ALL ON TABLE "public"."turma_responsaveis" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."user_access_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_access_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_access_permissions" TO "service_role";



GRANT INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_permissao_override" TO "anon";
GRANT ALL ON TABLE "public"."user_permissao_override" TO "authenticated";
GRANT ALL ON TABLE "public"."user_permissao_override" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."v_pipeline_contratos" TO "anon";
GRANT ALL ON TABLE "public"."v_pipeline_contratos" TO "authenticated";
GRANT ALL ON TABLE "public"."v_pipeline_contratos" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."video_assets" TO "anon";
GRANT ALL ON TABLE "public"."video_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."video_assets" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."video_jobs" TO "anon";
GRANT ALL ON TABLE "public"."video_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."video_jobs" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."video_scripts" TO "anon";
GRANT ALL ON TABLE "public"."video_scripts" TO "authenticated";
GRANT ALL ON TABLE "public"."video_scripts" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."vw_alunos_financeiro" TO "anon";
GRANT ALL ON TABLE "public"."vw_alunos_financeiro" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_alunos_financeiro" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."vw_cfo_turmas" TO "anon";
GRANT ALL ON TABLE "public"."vw_cfo_turmas" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_cfo_turmas" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."vw_receita_por_fonte" TO "anon";
GRANT ALL ON TABLE "public"."vw_receita_por_fonte" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_receita_por_fonte" TO "service_role";



GRANT INSERT,MAINTAIN ON TABLE "public"."whatsapp_opt_out" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_opt_out" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_opt_out" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







