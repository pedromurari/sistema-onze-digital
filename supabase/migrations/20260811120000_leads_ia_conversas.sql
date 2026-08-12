-- Agente de IA (SDR) que responde leads diretos do anúncio "Formação em
-- Psicanálise Integrativa do IDM" no WhatsApp. Mesmo espírito de
-- cobranca_ia_conversas/cobranca_ia_mensagens (20260805090000): qualifica o
-- lead (motivação, urgência, capacidade de investimento) e entrega pro time
-- humano fechar -- nunca fecha venda sozinho. Ver supabase/functions/leads-ia-responder.

CREATE TABLE IF NOT EXISTS public.leads_ia_conversas (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  lead_nome              TEXT NOT NULL DEFAULT '',
  telefone               TEXT NOT NULL,
  evolution_instance     TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'ativo'
                           CHECK (status IN ('ativo', 'aguardando_humano', 'encerrado')),
  engajamento            TEXT,
  objetivo_principal     TEXT,
  tempo_interesse        TEXT,
  resumo_ia              TEXT,
  motivo_handoff         TEXT
                           CHECK (motivo_handoff IS NULL OR motivo_handoff IN
                             ('lead_qualificado', 'pedido_direto_avancar', 'duvida_sem_resposta',
                              'fora_de_escopo', 'reclamacao', 'baixa_confianca', 'erro_ia', 'limite_turnos')),
  -- Só preenchido quando motivo_handoff = 'duvida_sem_resposta' -- é a pergunta
  -- exata do lead que a IA não soube responder, usada pra montar a sugestão de
  -- conhecimento se um humano resolver na mesma conversa (ver evo-resposta).
  duvida_nao_respondida  TEXT,
  -- Evita duplicar sugestão de conhecimento se o humano mandar várias mensagens
  -- seguidas depois do handoff.
  sugestao_capturada     BOOLEAN NOT NULL DEFAULT false,
  turnos_ia              INTEGER NOT NULL DEFAULT 0,
  ultima_mensagem_em     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nunca mais de uma conversa aberta por lead -- protege contra retry de
-- webhook da Evolution ou respostas quase simultâneas gerando 2 threads.
CREATE UNIQUE INDEX IF NOT EXISTS ux_leads_ia_conversas_lead_aberta
  ON public.leads_ia_conversas(lead_id)
  WHERE status <> 'encerrado';

CREATE INDEX IF NOT EXISTS leads_ia_conversas_status_idx
  ON public.leads_ia_conversas(status);
CREATE INDEX IF NOT EXISTS leads_ia_conversas_ultima_msg_idx
  ON public.leads_ia_conversas(ultima_mensagem_em DESC);
-- Usado pela captura de resolução humana (evo-resposta): achar a conversa em
-- aguardando_humano/duvida_sem_resposta a partir do telefone que respondeu.
CREATE INDEX IF NOT EXISTS leads_ia_conversas_telefone_idx
  ON public.leads_ia_conversas(telefone);

ALTER TABLE public.leads_ia_conversas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leads_ia_conversas' AND policyname = 'leads_ia_conversas_authenticated') THEN
    CREATE POLICY "leads_ia_conversas_authenticated" ON public.leads_ia_conversas
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.leads_ia_mensagens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id  UUID NOT NULL REFERENCES public.leads_ia_conversas(id) ON DELETE CASCADE,
  papel        TEXT NOT NULL CHECK (papel IN ('lead', 'agente')),
  conteudo     TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_ia_mensagens_conversa_idx
  ON public.leads_ia_mensagens(conversa_id, created_at);

ALTER TABLE public.leads_ia_mensagens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leads_ia_mensagens' AND policyname = 'leads_ia_mensagens_authenticated') THEN
    CREATE POLICY "leads_ia_mensagens_authenticated" ON public.leads_ia_mensagens
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
