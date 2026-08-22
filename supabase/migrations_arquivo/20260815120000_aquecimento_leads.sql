-- ================================================================
-- Aquecimento de Leads + isca por vendedor
-- Lead da base existente passa por 4 fases de conteúdo (mandadas
-- pelos números da empresa, avanço só por engajamento) e, ao
-- terminar, recebe uma isca automática (com delay) pelo número do
-- vendedor designado em rodízio. Ver spec:
-- docs/superpowers/specs/2026-08-15-aquecimento-leads-vendedores-design.md
-- ================================================================

-- 1. Config geral (singleton): texto/mídia da isca + faixa de delay
CREATE TABLE IF NOT EXISTS public.lead_aquecimento_config (
  id                TEXT PRIMARY KEY DEFAULT 'default',
  isca_message_type TEXT NOT NULL DEFAULT 'text' CHECK (isca_message_type IN ('text', 'image', 'audio', 'video', 'document')),
  isca_texto        TEXT NOT NULL DEFAULT '',
  isca_media_url    TEXT,
  isca_delay_min_min INTEGER NOT NULL DEFAULT 5,
  isca_delay_max_min INTEGER NOT NULL DEFAULT 30,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lead_aquecimento_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lead_aquecimento_config' AND policyname='lead_aquecimento_config_authenticated') THEN
    CREATE POLICY "lead_aquecimento_config_authenticated" ON public.lead_aquecimento_config
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO public.lead_aquecimento_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- 2. As 4 fases fixas (mensagem única por fase, editável no painel)
CREATE TABLE IF NOT EXISTS public.lead_aquecimento_fases (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fase_numero    INTEGER NOT NULL UNIQUE CHECK (fase_numero BETWEEN 1 AND 4),
  nome           TEXT NOT NULL,
  message_type   TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'audio', 'video', 'document')),
  mensagem_texto TEXT NOT NULL DEFAULT '',
  media_url      TEXT,
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lead_aquecimento_fases ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lead_aquecimento_fases' AND policyname='lead_aquecimento_fases_authenticated') THEN
    CREATE POLICY "lead_aquecimento_fases_authenticated" ON public.lead_aquecimento_fases
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO public.lead_aquecimento_fases (fase_numero, nome) VALUES
  (1, 'Fase 1'), (2, 'Fase 2'), (3, 'Fase 3'), (4, 'Fase 4')
ON CONFLICT (fase_numero) DO NOTHING;

-- 3. Vínculo vendedor ↔ instância Evolution própria (pro rodízio da isca)
CREATE TABLE IF NOT EXISTS public.lead_aquecimento_vendedores (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  evolution_config_id  TEXT NOT NULL REFERENCES public.evolution_config(id) ON DELETE CASCADE,
  ativo                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id)
);

ALTER TABLE public.lead_aquecimento_vendedores ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lead_aquecimento_vendedores' AND policyname='lead_aquecimento_vendedores_authenticated') THEN
    CREATE POLICY "lead_aquecimento_vendedores_authenticated" ON public.lead_aquecimento_vendedores
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. Campanhas (lote de leads colocado no fluxo de uma vez)
CREATE TABLE IF NOT EXISTS public.lead_aquecimento_campanhas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  criado_por  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  leads_total INTEGER NOT NULL DEFAULT 0,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lead_aquecimento_campanhas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lead_aquecimento_campanhas' AND policyname='lead_aquecimento_campanhas_authenticated') THEN
    CREATE POLICY "lead_aquecimento_campanhas_authenticated" ON public.lead_aquecimento_campanhas
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. Leads dentro de uma campanha de aquecimento
CREATE TABLE IF NOT EXISTS public.lead_aquecimento_leads (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id              UUID NOT NULL REFERENCES public.lead_aquecimento_campanhas(id) ON DELETE CASCADE,
  nome                     TEXT,
  phone                    TEXT NOT NULL,
  origem_tabela            TEXT,
  origem_id                TEXT,
  fase_atual               INTEGER NOT NULL DEFAULT 1 CHECK (fase_atual BETWEEN 1 AND 4),
  status                   TEXT NOT NULL DEFAULT 'aguardando_envio_fase'
                             CHECK (status IN ('aguardando_envio_fase', 'aguardando_engajamento', 'aguardando_isca', 'isca_enviada', 'erro')),
  evolution_config_id_envio TEXT REFERENCES public.evolution_config(id) ON DELETE SET NULL,
  fase_enviada_em          TIMESTAMPTZ,
  respondeu_fase_em        TIMESTAMPTZ,
  isca_agendada_para       TIMESTAMPTZ,
  isca_enviada_em          TIMESTAMPTZ,
  vendedor_id              UUID REFERENCES public.lead_aquecimento_vendedores(id) ON DELETE SET NULL,
  error_msg                TEXT,
  criado_em                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_aquecimento_leads_status ON public.lead_aquecimento_leads (status);
CREATE INDEX IF NOT EXISTS idx_lead_aquecimento_leads_isca_agendada ON public.lead_aquecimento_leads (status, isca_agendada_para);
CREATE INDEX IF NOT EXISTS idx_lead_aquecimento_leads_phone ON public.lead_aquecimento_leads (phone);
CREATE INDEX IF NOT EXISTS idx_lead_aquecimento_leads_campanha ON public.lead_aquecimento_leads (campanha_id);

ALTER TABLE public.lead_aquecimento_leads ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lead_aquecimento_leads' AND policyname='lead_aquecimento_leads_authenticated') THEN
    CREATE POLICY "lead_aquecimento_leads_authenticated" ON public.lead_aquecimento_leads
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 6. Flag de desativação do SDR de IA (leads-ia-responder / leads-ia-followup).
-- Desliga por config, sem remover nenhuma function/cron -- religa voltando ativo=true.
CREATE TABLE IF NOT EXISTS public.leads_ia_config (
  id         TEXT PRIMARY KEY DEFAULT 'default',
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.leads_ia_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leads_ia_config' AND policyname='leads_ia_config_authenticated') THEN
    CREATE POLICY "leads_ia_config_authenticated" ON public.leads_ia_config
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Desliga o SDR de IA agora, conforme decisão do usuário (não vamos mais precisar do agente de atendimento).
INSERT INTO public.leads_ia_config (id, ativo) VALUES ('default', FALSE) ON CONFLICT (id) DO UPDATE SET ativo = FALSE;
