-- ============================================================
-- IDM Tools — Certificado por Palavras-Chave (Aula Pública)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tentativas_certificado (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           TEXT        NOT NULL,
  telefone       TEXT        NOT NULL,
  email          TEXT        NOT NULL,
  ip             TEXT,
  acertou        BOOLEAN     NOT NULL DEFAULT FALSE,
  data_tentativa TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para as consultas de bloqueio e rate-limit
CREATE INDEX IF NOT EXISTS idx_tentativas_email    ON public.tentativas_certificado(email);
CREATE INDEX IF NOT EXISTS idx_tentativas_telefone ON public.tentativas_certificado(telefone);
CREATE INDEX IF NOT EXISTS idx_tentativas_ip_data  ON public.tentativas_certificado(ip, data_tentativa);

-- RLS: somente o service role (API route) acessa — anon/alunos não lêem dados alheios
ALTER TABLE public.tentativas_certificado ENABLE ROW LEVEL SECURITY;

-- Inserção liberada para o server-side (service role bypassa RLS de qualquer forma)
-- Esta policy é para o anon key caso necessário
CREATE POLICY "tentativas_insert_service"
  ON public.tentativas_certificado FOR INSERT
  WITH CHECK (TRUE);

-- Leitura somente pelo admin (painel)
CREATE POLICY "tentativas_select_admin"
  ON public.tentativas_certificado FOR SELECT
  USING (public.is_admin());
