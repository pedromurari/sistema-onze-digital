-- F4: Delay configurável nas boas-vindas + fila de agendamento

-- 1. Delay na configuração existente
ALTER TABLE boas_vindas_config
  ADD COLUMN IF NOT EXISTS delay_minutos integer DEFAULT 0;

-- 2. Fila de boas-vindas agendadas
CREATE TABLE IF NOT EXISTS boas_vindas_agendados (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id   uuid,
  lead_id         uuid NOT NULL,
  lead_tabela     text NOT NULL DEFAULT 'lancamento_leads',
  funnel_name     text NOT NULL,
  nome            text,
  whatsapp        text NOT NULL,
  mensagem        text NOT NULL,
  agendado_para   timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pendente'
    CONSTRAINT bv_status_check CHECK (status IN ('pendente', 'enviado', 'erro')),
  enviado_em      timestamptz,
  erro_msg        text,
  criado_em       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bv_agendados_status_hora
  ON boas_vindas_agendados (status, agendado_para)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_bv_agendados_lead
  ON boas_vindas_agendados (lead_id);

CREATE INDEX IF NOT EXISTS idx_bv_agendados_lancamento
  ON boas_vindas_agendados (lancamento_id);
