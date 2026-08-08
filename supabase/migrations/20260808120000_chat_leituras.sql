-- Leitura de conversa por usuario -- suporta o badge de nao lidas do chat
-- flutuante (ChatWidget.tsx) e da aba completa (ChatConversas.tsx). Mesmo
-- padrao de "1 linha por usuario, RLS propria" de push_subscriptions
-- (20260805100000_push_subscriptions.sql), mas chave composta em vez de
-- UNIQUE, porque aqui so importa 1 timestamp por (usuario, telefone).
CREATE TABLE IF NOT EXISTS public.chat_leituras (
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telefone TEXT NOT NULL,
  lida_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, telefone)
);

ALTER TABLE public.chat_leituras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own chat_leituras"
  ON public.chat_leituras FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
