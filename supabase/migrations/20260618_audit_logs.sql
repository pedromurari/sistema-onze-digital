-- Tabela de auditoria para operações sensíveis
-- Registra: criação/deleção de usuários, contratos assinados, etc.
-- NIST SP 800-53 AU-2: Event Logging

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid,                          -- quem executou (null = sistema/webhook)
  action      text        NOT NULL,          -- ex: 'delete_user', 'create_user', 'contrato_assinado'
  target_id   text,                          -- ID do recurso afetado
  details     jsonb,                         -- dados adicionais sem dados pessoais sensíveis
  ip_address  text,                          -- IP do caller (se disponível)
  created_at  timestamptz DEFAULT now()
);

-- Índices para queries de auditoria por período e ator
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id   ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON public.audit_logs (action);

-- RLS: somente admins leem, ninguém insere diretamente (só via service_role nas Edge Functions)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ler audit_logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Nenhum usuário autenticado insere diretamente — só service_role (Edge Functions)
CREATE POLICY "Nenhum insert direto de usuarios" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (false);
