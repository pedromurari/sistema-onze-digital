-- ================================================================
-- Opt-out global de WhatsApp — registro único por telefone (normalizado,
-- mesmo padrão de normalizePhone() usado em evo-resposta: DDI 55 removido,
-- 11 dígitos). Existiam 3 funções de envio (disparo-runner, funil-processar,
-- enviar-cobranca) sem NENHUMA checagem de "pare de me mandar mensagem" --
-- risco real de denúncia/ban de número, achado numa auditoria de
-- conhecimento em 20260730. Esta tabela é o único portão: uma linha aqui
-- = nunca mais enviar pra esse telefone em nenhum canal de disparo/funil/
-- cobrança, até decisão manual de remover.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_opt_out (
  telefone      TEXT PRIMARY KEY,
  origem        TEXT NOT NULL,          -- de onde veio a deteccao, ex: 'evo-resposta'
  gatilho       TEXT,                   -- trecho da mensagem que disparou a deteccao (auditoria)
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_opt_out ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='whatsapp_opt_out' AND policyname='whatsapp_opt_out_authenticated') THEN
    CREATE POLICY "whatsapp_opt_out_authenticated" ON public.whatsapp_opt_out
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.whatsapp_opt_out IS
  'Telefones que pediram pra parar de receber mensagem (qualquer canal). Checado antes de enviar em disparo-runner, funil-processar e enviar-cobranca. Gravado por evo-resposta ao detectar palavra-chave de parada numa mensagem inbound.';
