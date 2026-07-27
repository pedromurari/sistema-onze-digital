-- ================================================================
-- Financeiro: escopo de cobrança por turma + anti-ban real
-- (Cobrança e Boas-vindas da Semana do Despertar)
-- ================================================================

-- 1. Turmas administradas pela automação de cobrança (opt-in manual, turma a turma)
CREATE TABLE IF NOT EXISTS public.cobranca_turmas_ativas (
  turma_id    UUID PRIMARY KEY REFERENCES public.turmas(id) ON DELETE CASCADE,
  ativado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.cobranca_turmas_ativas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cobranca_turmas_ativas' AND policyname='cobranca_turmas_ativas_authenticated') THEN
    CREATE POLICY "cobranca_turmas_ativas_authenticated" ON public.cobranca_turmas_ativas
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. Anti-ban real na Cobrança (mesmo esquema de disparo_campanhas)
ALTER TABLE public.cobranca_config
  ADD COLUMN IF NOT EXISTS delay_min_s       INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS delay_max_s       INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS daily_limit       INTEGER NOT NULL DEFAULT 150,
  ADD COLUMN IF NOT EXISTS max_errors_seq    INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS evolution_config_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS enviados_hoje     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dia_contagem      DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS erros_seq         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_envio_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pausado_por_erro  BOOLEAN NOT NULL DEFAULT FALSE;

-- 2b. Fila de boas-vindas agendadas (Semana do Despertar) -- migration original
--     (20260609_boas_vindas_delay.sql) nunca foi de fato aplicada no banco; a tabela
--     e a coluna abaixo nao existiam em producao, entao o botao "Agendar" do Kanban de
--     Lancamento e o bloco de boas-vindas do funil-processar estavam falhando
--     silenciosamente. Recriando aqui de forma idempotente.
ALTER TABLE public.boas_vindas_config
  ADD COLUMN IF NOT EXISTS delay_minutos INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.boas_vindas_agendados (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id   UUID,
  lead_id         UUID NOT NULL,
  lead_tabela     TEXT NOT NULL DEFAULT 'lancamento_leads',
  funnel_name     TEXT NOT NULL,
  nome            TEXT,
  whatsapp        TEXT NOT NULL,
  mensagem        TEXT NOT NULL,
  agendado_para   TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pendente'
    CONSTRAINT bv_status_check CHECK (status IN ('pendente', 'enviado', 'erro')),
  enviado_em      TIMESTAMPTZ,
  erro_msg        TEXT,
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bv_agendados_status_hora
  ON public.boas_vindas_agendados (status, agendado_para)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_bv_agendados_lead
  ON public.boas_vindas_agendados (lead_id);

CREATE INDEX IF NOT EXISTS idx_bv_agendados_lancamento
  ON public.boas_vindas_agendados (lancamento_id);

ALTER TABLE public.boas_vindas_agendados ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='boas_vindas_agendados' AND policyname='boas_vindas_agendados_authenticated') THEN
    CREATE POLICY "boas_vindas_agendados_authenticated" ON public.boas_vindas_agendados
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. Anti-ban real no Boas-vindas (por funil, sem rodízio próprio -- usa evolution_task_config)
ALTER TABLE public.boas_vindas_config
  ADD COLUMN IF NOT EXISTS delay_min_s       INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS delay_max_s       INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS daily_limit       INTEGER NOT NULL DEFAULT 150,
  ADD COLUMN IF NOT EXISTS safe_hour_start   INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS safe_hour_end     INTEGER NOT NULL DEFAULT 21,
  ADD COLUMN IF NOT EXISTS max_errors_seq    INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS enviados_hoje     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dia_contagem      DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS erros_seq         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pausado_por_erro  BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. get_alunos_para_cobranca agora só considera turmas explicitamente administradas
DROP FUNCTION IF EXISTS public.get_alunos_para_cobranca(DATE);

CREATE FUNCTION public.get_alunos_para_cobranca(p_data DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  aluno_id        UUID,
  aluno_nome      TEXT,
  telefone        TEXT,
  pagamento_id    UUID,
  valor           NUMERIC,
  parcela         INTEGER,
  data_vencimento DATE,
  dias_offset     INTEGER,
  link_pagamento  TEXT
) LANGUAGE sql STABLE AS $$
  SELECT
    a.id            AS aluno_id,
    a.nome          AS aluno_nome,
    COALESCE(a.cobranca_telefone, a.whatsapp) AS telefone,
    p.id            AS pagamento_id,
    p.valor,
    p.numero_parcela AS parcela,
    p.data_vencimento,
    (p_data - p.data_vencimento)::INTEGER AS dias_offset,
    COALESCE(a.asaas_link, a.voomp_link, '') AS link_pagamento
  FROM public.pagamentos p
  JOIN public.alunos     a   ON a.id = p.aluno_id
  JOIN public.cobranca_turmas_ativas cta ON cta.turma_id = a.turma_id
  WHERE
    a.status NOT IN ('cancelado', 'concluido')
    AND a.cobranca_ativa = TRUE
    AND a.forma_pagamento = 'boleto'
    AND p.status IN ('pendente', 'atrasado')
    AND COALESCE(a.cobranca_telefone, a.whatsapp) IS NOT NULL
    AND COALESCE(a.cobranca_telefone, a.whatsapp) <> ''
  ORDER BY a.nome, p.data_vencimento;
$$;
