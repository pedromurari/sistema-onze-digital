-- ============================================================
-- IDM Tools — Pedidos SyncPay (checkout público, sem login)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pedidos_syncpay (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_slug        TEXT NOT NULL,
  produto_nome        TEXT NOT NULL,
  valor               DECIMAL(10,2) NOT NULL,
  comprador_nome      TEXT NOT NULL,
  comprador_cpf       TEXT NOT NULL,
  comprador_email     TEXT NOT NULL,
  comprador_telefone  TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  syncpay_identifier  TEXT,
  pix_code            TEXT,
  split_config        JSONB,
  acesso_liberado     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pedidos_syncpay_status_check CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'med'))
);

CREATE INDEX IF NOT EXISTS idx_pedidos_syncpay_identifier ON public.pedidos_syncpay(syncpay_identifier);
CREATE INDEX IF NOT EXISTS idx_pedidos_syncpay_produto    ON public.pedidos_syncpay(produto_slug);

CREATE OR REPLACE FUNCTION public.update_pedidos_syncpay_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pedidos_syncpay_updated_at
  BEFORE UPDATE ON public.pedidos_syncpay
  FOR EACH ROW EXECUTE FUNCTION public.update_pedidos_syncpay_updated_at();

-- RLS ativado, sem policies: acesso só via service role (rotas server-side).
-- Guarda CPF/telefone do comprador, não deve ser lido direto pelo client.
ALTER TABLE public.pedidos_syncpay ENABLE ROW LEVEL SECURITY;
