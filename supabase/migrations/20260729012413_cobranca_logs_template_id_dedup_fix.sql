-- Dedup por template_id (estável) em vez de template_nome (texto) -- renomear um
-- template não pode fazer o sistema "esquecer" que já mandou aquela fase e reenviar
-- duplicado (bug real: lead recebeu duas mensagens da mesma fase após rename de template).
ALTER TABLE cobranca_logs ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES cobranca_templates(id) ON DELETE SET NULL;
