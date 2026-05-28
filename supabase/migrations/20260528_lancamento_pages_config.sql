-- Adiciona colunas de configuração de páginas ao lancamentos
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS turma_numero integer,
  ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'lancamento_3_aulas',
  ADD COLUMN IF NOT EXISTS gas_url text,
  ADD COLUMN IF NOT EXISTS whatsapp_group_link text,
  ADD COLUMN IF NOT EXISTS github_repo_captura text,
  ADD COLUMN IF NOT EXISTS github_repo_obrigado text,
  ADD COLUMN IF NOT EXISTS data_aula_1 date,
  ADD COLUMN IF NOT EXISTS data_aula_2 date,
  ADD COLUMN IF NOT EXISTS data_aula_3 date,
  ADD COLUMN IF NOT EXISTS horario_live text DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS responsavel_nome text,
  ADD COLUMN IF NOT EXISTS pages_status text DEFAULT 'pendente';

-- RPC: cria a tabela sheet_leads_{NUM} + politicas + colunas kanban
-- Chamada pelo wizard do browser com a anon key (SECURITY DEFINER sobe para postgres)
CREATE OR REPLACE FUNCTION public.setup_lancamento_pages(
  p_lancamento_id uuid,
  p_turma_numero integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table text := 'sheet_leads_' || p_turma_numero;
  v_policy_insert text := 'Allow insert for all ' || p_turma_numero;
  v_policy_select text := 'Allow select for authenticated ' || p_turma_numero;
BEGIN
  -- Cria tabela de leads da planilha
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      row_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "Nome"           text,
      "E-mail"         text,
      "Whatsapp"       text,
      "Data"           text,
      "Enviado"        text,
      "Disparo"        text,
      "No Grupo?"      text,
      "CRM"            text,
      "Grupo de Oferta" text,
      "Follow Up 01"   text,
      "Follow Up 02"   text,
      "Follow Up 03"   text,
      utm_source       text,
      utm_medium       text,
      utm_campaign     text,
      utm_content      text,
      utm_term         text
    )', v_table);

  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);

  BEGIN
    EXECUTE format(
      'CREATE POLICY %L ON public.%I FOR INSERT WITH CHECK (true)',
      v_policy_insert, v_table
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE format(
      'CREATE POLICY %L ON public.%I FOR SELECT TO authenticated USING (true)',
      v_policy_select, v_table
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Colunas kanban padrão (só insere se ainda não existem)
  INSERT INTO public.kanban_colunas (lancamento_id, nome, ordem, cor)
  SELECT p_lancamento_id, t.nome, t.ordem, t.cor
  FROM (VALUES
    ('Planilha',         0, '#3B82F6'),
    ('Grupo Lançamento', 1, '#8B5CF6'),
    ('Grupo Oferta',     2, '#8B5CF6'),
    ('Negociação',       3, '#6B7280')
  ) AS t(nome, ordem, cor)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.kanban_colunas WHERE lancamento_id = p_lancamento_id
  );

  RETURN jsonb_build_object('success', true, 'table', v_table);
END;
$$;

GRANT EXECUTE ON FUNCTION public.setup_lancamento_pages(uuid, integer) TO anon, authenticated;
