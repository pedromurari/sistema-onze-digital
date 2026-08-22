-- Integração com plataformas de pagamento externas
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS asaas_integrado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS asaas_link      TEXT,
  ADD COLUMN IF NOT EXISTS voomp_integrado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS voomp_link      TEXT;
