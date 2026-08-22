-- Loop de aprendizado do leads-ia-responder: quando a IA não sabe responder
-- uma pergunta do lead (motivo_handoff = 'duvida_sem_resposta'), evo-resposta
-- captura a 1a resposta manual que um humano mandar na mesma conversa como
-- sugestão de conhecimento. Um admin aprova (podendo editar) pelo painel em
-- Pipeline.tsx antes dela virar conhecimento ativo que a IA usa.

CREATE TABLE IF NOT EXISTS public.leads_ia_conhecimento_sugestoes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id         UUID REFERENCES public.leads_ia_conversas(id) ON DELETE SET NULL,
  lead_id             UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  pergunta            TEXT NOT NULL,
  resposta_humano     TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  revisado_por        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revisado_em         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_ia_conhecimento_sugestoes_status_idx
  ON public.leads_ia_conhecimento_sugestoes(status);

ALTER TABLE public.leads_ia_conhecimento_sugestoes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leads_ia_conhecimento_sugestoes' AND policyname = 'leads_ia_conhecimento_sugestoes_authenticated') THEN
    CREATE POLICY "leads_ia_conhecimento_sugestoes_authenticated" ON public.leads_ia_conhecimento_sugestoes
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Base de conhecimento viva -- só entra aqui depois de aprovado (com edição
-- opcional do admin). leads-ia-responder consulta ativo=true a cada resposta.
CREATE TABLE IF NOT EXISTS public.leads_ia_conhecimento (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pergunta_exemplo    TEXT NOT NULL,
  resposta            TEXT NOT NULL,
  ativo               BOOLEAN NOT NULL DEFAULT true,
  origem_sugestao_id  UUID REFERENCES public.leads_ia_conhecimento_sugestoes(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_ia_conhecimento_ativo_idx
  ON public.leads_ia_conhecimento(ativo);

ALTER TABLE public.leads_ia_conhecimento ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leads_ia_conhecimento' AND policyname = 'leads_ia_conhecimento_authenticated') THEN
    CREATE POLICY "leads_ia_conhecimento_authenticated" ON public.leads_ia_conhecimento
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Colunas que o frontend (LeadsContext.tsx/Pipeline.tsx) já espera há tempo
-- (dbRowToLead/leadToDbRow/LeadChatBubbles) mas que não existem na tabela ao
-- vivo -- ficaram mortas depois de alguma alteração de schema fora deste
-- repo. leads-ia-responder passa a ser o primeiro escritor de verdade.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS mensagem_lead      TEXT,
  ADD COLUMN IF NOT EXISTS mensagem_ia        TEXT,
  ADD COLUMN IF NOT EXISTS engajamento        TEXT,
  ADD COLUMN IF NOT EXISTS objetivo_principal TEXT,
  ADD COLUMN IF NOT EXISTS tempo_interesse    TEXT;

-- Mesmo critério de getActiveVendedores() (src/contexts/AuthContext.tsx) --
-- notifica todo vendedor/admin ativo no handoff da IA de leads, sem atribuir
-- responsavel_id (decisão explícita: fila aberta, quem pegar primeiro assume).
CREATE OR REPLACE FUNCTION public.notificar_vendedores_ativos(
  p_tipo     TEXT,
  p_titulo   TEXT,
  p_descricao TEXT DEFAULT NULL,
  p_link     TEXT DEFAULT NULL
) RETURNS SETOF UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user_id UUID;
BEGIN
  FOR v_user_id IN
    SELECT id FROM public.profiles WHERE ativo = true AND tipo IN ('vendedor', 'admin')
  LOOP
    RETURN NEXT public.notificar(v_user_id, p_tipo, p_titulo, p_descricao, p_link);
  END LOOP;
END;
$$;
