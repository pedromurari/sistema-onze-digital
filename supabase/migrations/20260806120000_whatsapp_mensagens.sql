-- Historico bidirecional de conversa de WhatsApp, por telefone.
--
-- Ate aqui o sistema so guardava a ULTIMA mensagem recebida, sobrescrita a cada
-- resposta nova (disparo_leads.ultima_resposta, boas_vindas_logs.ultima_resposta,
-- cobranca_logs.ultima_resposta). lead_respostas guarda historico, mas so pra quem
-- casa com lancamento_leads; cobranca_ia_mensagens guarda os dois lados, mas so pro
-- fluxo de IA de cobranca. Esta tabela e a versao generica: uma linha por mensagem,
-- nos dois sentidos, alimentada por evo-resposta (inbound) e pelas 3 funcoes de
-- envio (disparo-runner, boas-vindas-enviar, enviar-cobranca).
--
-- Tabela isolada de proposito: sem FK pra alunos/pagamentos/leads. A conversa e
-- identificada so pelo telefone normalizado -- quem e o dono daquele telefone e
-- resolvido na leitura (leads_unificados, com fallback pra disparo_leads), porque
-- o mesmo numero pode ser lead hoje e aluno amanha.

CREATE TABLE IF NOT EXISTS public.whatsapp_mensagens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Normalizado pra 11 digitos BR (sem +55), mesmo formato de normalizePhone()
  -- em evo-resposta -- as 4 funcoes precisam gravar igual senao a conversa racha
  -- em duas.
  telefone            TEXT NOT NULL,
  direcao             TEXT NOT NULL CHECK (direcao IN ('recebida', 'enviada')),
  conteudo            TEXT NOT NULL,
  tipo                TEXT NOT NULL DEFAULT 'text',
  origem              TEXT NOT NULL CHECK (origem IN ('inbound', 'disparo', 'boas_vindas', 'cobranca')),
  evolution_instance  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Serve tanto a thread de uma conversa (WHERE telefone = ... ORDER BY created_at)
-- quanto a lista lateral (ultima mensagem por telefone).
CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_telefone_created
  ON public.whatsapp_mensagens (telefone, created_at DESC);

ALTER TABLE public.whatsapp_mensagens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'whatsapp_mensagens' AND policyname = 'whatsapp_mensagens_auth'
  ) THEN
    CREATE POLICY "whatsapp_mensagens_auth" ON public.whatsapp_mensagens
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Realtime pra thread aberta atualizar sozinha quando chega resposta.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'whatsapp_mensagens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_mensagens;
  END IF;
END $$;
