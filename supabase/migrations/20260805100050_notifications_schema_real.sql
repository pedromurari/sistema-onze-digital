-- A tabela `notifications` em produção nunca teve o schema que o código sempre esperou.
-- A migration original (20260324134125...sql) usou CREATE TABLE IF NOT EXISTS, mas uma
-- tabela `notifications` genérica (id, title, message, read, created_at) já existia antes
-- disso (herdada do scaffold inicial do projeto) -- IF NOT EXISTS então virou um no-op
-- silencioso, e as colunas user_id/tipo/titulo/descricao/link/lida nunca foram criadas de
-- verdade. Resultado: todo insert em `notifications` (handoff pro Rodrygo, notificação de
-- tarefa) falhava silenciosamente desde sempre -- confirmado: a tabela está vazia (0
-- linhas) em produção. Corrige o schema de vez; sem dado nenhum pra preservar.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tipo TEXT,
  ADD COLUMN IF NOT EXISTS titulo TEXT,
  ADD COLUMN IF NOT EXISTS descricao TEXT,
  ADD COLUMN IF NOT EXISTS link TEXT,
  ADD COLUMN IF NOT EXISTS lida BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.notifications DROP COLUMN IF EXISTS title;
ALTER TABLE public.notifications DROP COLUMN IF EXISTS message;
ALTER TABLE public.notifications DROP COLUMN IF EXISTS read;

ALTER TABLE public.notifications ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN tipo SET NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN titulo SET NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Insert notifications" ON public.notifications;
CREATE POLICY "Insert notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);
