-- can_view_time_comercial já era lido/escrito pelo código (src/lib/access-control.ts)
-- mas a coluna nunca foi criada — toda tentativa de persistir essa permissão
-- vinha falhando silenciosamente e caindo no default (true) do código.
ALTER TABLE public.user_access_permissions
  ADD COLUMN IF NOT EXISTS can_view_time_comercial BOOLEAN NOT NULL DEFAULT TRUE;
