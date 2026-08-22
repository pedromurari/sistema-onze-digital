-- IDM PSI Franquias estava com acesso liberado fixo (true) pra qualquer não-admin
-- em canAccessView (src/lib/access-control.ts), ignorando permissões por usuário.
-- Agora vira uma permissão de verdade, com o comportamento atual (visível) como default.
ALTER TABLE public.user_access_permissions
  ADD COLUMN IF NOT EXISTS can_view_franquia_psi BOOLEAN NOT NULL DEFAULT TRUE;
