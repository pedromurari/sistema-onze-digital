-- ================================================================
-- Aquecimento de Chips — aquece números WhatsApp (DM + grupo) com
-- rampa progressiva de volume antes de entrarem em disparo real.
-- ================================================================

-- 1. Configuração geral (singleton)
CREATE TABLE IF NOT EXISTS public.aquecimento_config (
  id                        TEXT PRIMARY KEY DEFAULT 'default',
  ativo                     BOOLEAN NOT NULL DEFAULT FALSE,
  rampa                     JSONB NOT NULL DEFAULT '[
    {"dia_inicio":1,"dia_fim":3,"min":3,"max":5},
    {"dia_inicio":4,"dia_fim":7,"min":6,"max":10},
    {"dia_inicio":8,"dia_fim":14,"min":12,"max":20},
    {"dia_inicio":15,"dia_fim":21,"min":20,"max":30},
    {"dia_inicio":22,"dia_fim":null,"min":30,"max":45}
  ]'::jsonb,
  pct_dm                    INTEGER NOT NULL DEFAULT 50,
  delay_min_s               INTEGER NOT NULL DEFAULT 5,
  delay_max_s               INTEGER NOT NULL DEFAULT 15,
  safe_hour_start           INTEGER NOT NULL DEFAULT 8,
  safe_hour_end             INTEGER NOT NULL DEFAULT 21,
  max_errors_seq            INTEGER NOT NULL DEFAULT 5,
  saude_taxa_entrega_min    NUMERIC NOT NULL DEFAULT 0.85,
  saude_max_desconexoes_7d  INTEGER NOT NULL DEFAULT 2,
  saude_dias_min_pronto     INTEGER NOT NULL DEFAULT 22,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.aquecimento_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aquecimento_config' AND policyname='aquecimento_config_authenticated') THEN
    CREATE POLICY "aquecimento_config_authenticated" ON public.aquecimento_config
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO public.aquecimento_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- 2. Chips participando do aquecimento (1 linha por instância evolution_config)
CREATE TABLE IF NOT EXISTS public.aquecimento_chips (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evolution_config_id  TEXT NOT NULL REFERENCES public.evolution_config(id) ON DELETE CASCADE,
  numero_whatsapp      TEXT NOT NULL,
  ativo                BOOLEAN NOT NULL DEFAULT TRUE,
  data_inicio          DATE NOT NULL DEFAULT CURRENT_DATE,
  status               TEXT NOT NULL DEFAULT 'aquecendo' CHECK (status IN ('aquecendo', 'pausado', 'pronto')),
  enviados_hoje        INTEGER NOT NULL DEFAULT 0,
  dia_contagem         DATE NOT NULL DEFAULT CURRENT_DATE,
  consecutive_errors   INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (evolution_config_id)
);

ALTER TABLE public.aquecimento_chips ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aquecimento_chips' AND policyname='aquecimento_chips_authenticated') THEN
    CREATE POLICY "aquecimento_chips_authenticated" ON public.aquecimento_chips
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. Grupos de aquecimento (criados via Evolution API)
CREATE TABLE IF NOT EXISTS public.aquecimento_grupos (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                 TEXT NOT NULL,
  grupo_jid            TEXT NOT NULL,
  evolution_config_id  TEXT REFERENCES public.evolution_config(id) ON DELETE SET NULL,
  membros              UUID[] NOT NULL DEFAULT '{}', -- ids de aquecimento_chips
  ativo                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.aquecimento_grupos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aquecimento_grupos' AND policyname='aquecimento_grupos_authenticated') THEN
    CREATE POLICY "aquecimento_grupos_authenticated" ON public.aquecimento_grupos
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. Banco de frases de aquecimento
CREATE TABLE IF NOT EXISTS public.aquecimento_mensagens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  texto      TEXT NOT NULL,
  tipo       TEXT NOT NULL DEFAULT 'ambos' CHECK (tipo IN ('dm', 'grupo', 'ambos')),
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.aquecimento_mensagens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aquecimento_mensagens' AND policyname='aquecimento_mensagens_authenticated') THEN
    CREATE POLICY "aquecimento_mensagens_authenticated" ON public.aquecimento_mensagens
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. Fila de envios (DM e grupo), com colunas de ACK pra métricas de saúde
CREATE TABLE IF NOT EXISTS public.aquecimento_jobs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                  TEXT NOT NULL CHECK (tipo IN ('dm', 'grupo')),
  chip_origem_id        UUID NOT NULL REFERENCES public.aquecimento_chips(id) ON DELETE CASCADE,
  chip_destino_id       UUID REFERENCES public.aquecimento_chips(id) ON DELETE CASCADE,
  grupo_id              UUID REFERENCES public.aquecimento_grupos(id) ON DELETE CASCADE,
  mensagem_texto        TEXT NOT NULL,
  scheduled_at          TIMESTAMPTZ NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviando', 'enviado', 'erro')),
  error_msg             TEXT,
  done_at               TIMESTAMPTZ,
  evolution_message_id  TEXT,
  ack_status            TEXT NOT NULL DEFAULT 'enviado' CHECK (ack_status IN ('enviado', 'entregue', 'lido', 'falhou')),
  entregue_em           TIMESTAMPTZ,
  lido_em               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT aquecimento_jobs_destino_check CHECK (
    (tipo = 'dm'    AND chip_destino_id IS NOT NULL AND grupo_id IS NULL) OR
    (tipo = 'grupo' AND grupo_id IS NOT NULL AND chip_destino_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_aquecimento_jobs_scheduled ON public.aquecimento_jobs (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_aquecimento_jobs_evolution_message_id ON public.aquecimento_jobs (evolution_message_id) WHERE evolution_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_aquecimento_jobs_chip_origem ON public.aquecimento_jobs (chip_origem_id, created_at);

ALTER TABLE public.aquecimento_jobs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aquecimento_jobs' AND policyname='aquecimento_jobs_authenticated') THEN
    CREATE POLICY "aquecimento_jobs_authenticated" ON public.aquecimento_jobs
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 6. Histórico de conexão por instância (não é exclusivo do aquecimento —
--    é propriedade do próprio chip, alimentado pelo webhook CONNECTION_UPDATE)
CREATE TABLE IF NOT EXISTS public.evolution_conexao_eventos (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evolution_config_id  TEXT REFERENCES public.evolution_config(id) ON DELETE CASCADE,
  instance_name        TEXT NOT NULL,
  state                TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evolution_conexao_eventos_instance ON public.evolution_conexao_eventos (instance_name, created_at DESC);

ALTER TABLE public.evolution_conexao_eventos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='evolution_conexao_eventos' AND policyname='evolution_conexao_eventos_authenticated') THEN
    CREATE POLICY "evolution_conexao_eventos_authenticated" ON public.evolution_conexao_eventos
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 7. View de saúde do chip — calculada ao vivo, sem estado duplicado
CREATE OR REPLACE VIEW public.aquecimento_saude_view AS
SELECT
  c.id                  AS chip_id,
  c.evolution_config_id,
  ec.instance_name,
  c.numero_whatsapp,
  c.status,
  c.data_inicio,
  (CURRENT_DATE - c.data_inicio) + 1                                                   AS dia_aquecimento,
  c.consecutive_errors,
  COALESCE(j.total_enviados, 0)                                                        AS total_enviados,
  COALESCE(j.total_entregues_ou_lidos, 0)                                              AS total_entregues,
  COALESCE(j.total_lidos, 0)                                                           AS total_lidos,
  COALESCE(j.total_falhas, 0)                                                          AS total_falhas,
  ROUND(j.total_entregues_ou_lidos::NUMERIC / NULLIF(j.total_enviados, 0), 2)          AS taxa_entrega,
  ROUND(j.total_lidos::NUMERIC / NULLIF(j.total_entregues_ou_lidos, 0), 2)             AS taxa_leitura,
  COALESCE(x.desconexoes_7d, 0)                                                        AS desconexoes_7d,
  x.estado_atual,
  CASE
    WHEN c.consecutive_errors >= 3 THEN 'risco'
    WHEN COALESCE(x.desconexoes_7d, 0) > cfg.saude_max_desconexoes_7d THEN 'risco'
    WHEN COALESCE(j.total_enviados, 0) >= 5
         AND j.total_entregues_ou_lidos::NUMERIC / NULLIF(j.total_enviados, 0) < cfg.saude_taxa_entrega_min
      THEN 'atencao'
    WHEN (CURRENT_DATE - c.data_inicio) + 1 >= cfg.saude_dias_min_pronto
         AND COALESCE(x.desconexoes_7d, 0) = 0
      THEN 'pronto'
    ELSE 'atencao'
  END AS classificacao
FROM public.aquecimento_chips c
JOIN public.evolution_config ec ON ec.id = c.evolution_config_id
CROSS JOIN public.aquecimento_config cfg
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE status = 'enviado')                                        AS total_enviados,
    COUNT(*) FILTER (WHERE status = 'enviado' AND ack_status IN ('entregue','lido'))   AS total_entregues_ou_lidos,
    COUNT(*) FILTER (WHERE status = 'enviado' AND ack_status = 'lido')                 AS total_lidos,
    COUNT(*) FILTER (WHERE status = 'erro')                                            AS total_falhas
  FROM public.aquecimento_jobs
  WHERE chip_origem_id = c.id
    AND created_at >= NOW() - INTERVAL '14 days'
) j ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE state = 'close' AND created_at >= NOW() - INTERVAL '7 days') AS desconexoes_7d,
    (ARRAY_AGG(state ORDER BY created_at DESC))[1]                                      AS estado_atual
  FROM public.evolution_conexao_eventos e
  WHERE e.instance_name = ec.instance_name
) x ON true;

GRANT SELECT ON public.aquecimento_saude_view TO authenticated;
