-- Correção: 'tipo' não é coluna de public.profiles (essa tabela só tem
-- role/cargo) -- o "tipo" de usuário (vendedor/admin) vem de user_roles.role,
-- igual ao que AuthContext.tsx.fetchUsers()/getActiveVendedores() já fazem no
-- frontend (default 'vendedor' quando não há linha em user_roles).
CREATE OR REPLACE FUNCTION public.notificar_vendedores_ativos(
  p_tipo     TEXT,
  p_titulo   TEXT,
  p_descricao TEXT DEFAULT NULL,
  p_link     TEXT DEFAULT NULL
) RETURNS SETOF UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user_id UUID;
BEGIN
  FOR v_user_id IN
    SELECT p.id
    FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.ativo = true
      AND COALESCE(ur.role, 'vendedor') IN ('vendedor', 'admin')
  LOOP
    RETURN NEXT public.notificar(v_user_id, p_tipo, p_titulo, p_descricao, p_link);
  END LOOP;
END;
$$;
