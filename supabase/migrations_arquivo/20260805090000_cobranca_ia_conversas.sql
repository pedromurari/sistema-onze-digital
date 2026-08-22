-- Agente de IA que assume a conversa quando um aluno responde a uma mensagem
-- de cobranca_logs: cria rapport, entende a situacao do atraso e coleta uma
-- data estimada de pagamento, depois entrega pro time humano (aba "Conversas
-- IA" na tela de Cobranca). Escopo raso de proposito -- a IA nunca negocia
-- valor/desconto/cancelamento, so coleta a data e passa adiante.

CREATE TABLE IF NOT EXISTS public.cobranca_ia_conversas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id            UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  pagamento_id        UUID REFERENCES public.pagamentos(id) ON DELETE SET NULL,
  aluno_nome          TEXT NOT NULL DEFAULT '',
  telefone            TEXT NOT NULL,
  evolution_instance  TEXT NOT NULL,
  cobranca_log_id     UUID REFERENCES public.cobranca_logs(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'ativo'
                        CHECK (status IN ('ativo', 'dado_coletado', 'aguardando_humano', 'encerrado')),
  data_prometida      DATE,
  resumo_ia           TEXT,
  motivo_handoff      TEXT
                        CHECK (motivo_handoff IS NULL OR motivo_handoff IN
                          ('dado_coletado', 'fora_de_escopo', 'pedido_negociacao',
                           'reclamacao', 'baixa_confianca', 'erro_ia', 'limite_turnos')),
  turnos_ia           INTEGER NOT NULL DEFAULT 0,
  ultima_mensagem_em  TIMESTAMPTZ,
  resolvido_por       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolvido_em        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nunca mais de uma conversa aberta por aluno -- protege contra retry de
-- webhook da Evolution ou respostas quase simultaneas gerando 2 threads.
CREATE UNIQUE INDEX IF NOT EXISTS ux_cobranca_ia_conversas_aluno_aberta
  ON public.cobranca_ia_conversas(aluno_id)
  WHERE status <> 'encerrado';

CREATE INDEX IF NOT EXISTS cobranca_ia_conversas_status_idx
  ON public.cobranca_ia_conversas(status);
CREATE INDEX IF NOT EXISTS cobranca_ia_conversas_ultima_msg_idx
  ON public.cobranca_ia_conversas(ultima_mensagem_em DESC);

ALTER TABLE public.cobranca_ia_conversas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cobranca_ia_conversas' AND policyname = 'cobranca_ia_conversas_authenticated') THEN
    CREATE POLICY "cobranca_ia_conversas_authenticated" ON public.cobranca_ia_conversas
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.cobranca_ia_mensagens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id  UUID NOT NULL REFERENCES public.cobranca_ia_conversas(id) ON DELETE CASCADE,
  papel        TEXT NOT NULL CHECK (papel IN ('lead', 'agente')),
  conteudo     TEXT NOT NULL,
  meta         JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cobranca_ia_mensagens_conversa_idx
  ON public.cobranca_ia_mensagens(conversa_id, created_at);

ALTER TABLE public.cobranca_ia_mensagens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cobranca_ia_mensagens' AND policyname = 'cobranca_ia_mensagens_authenticated') THEN
    CREATE POLICY "cobranca_ia_mensagens_authenticated" ON public.cobranca_ia_mensagens
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
