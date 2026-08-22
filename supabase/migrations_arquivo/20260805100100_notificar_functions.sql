-- Cada ponto do código que cria uma notificação insere direto na tabela
-- `notifications` manualmente hoje -- um deles (handoff pro Rodrygo, em
-- Pipeline.tsx) tem um bug real: grava o user_id de quem está logado em vez
-- do destinatário de verdade, porque não tinha um jeito fácil de resolver
-- "o id do Rodrygo" a partir do frontend. Essas duas funções centralizam a
-- criação de notificação (e viram o único lugar que cada call site precisa
-- chamar, já que o trigger da próxima migration cuida do push sozinho).
CREATE OR REPLACE FUNCTION public.notificar(
  p_user_id  UUID,
  p_tipo     TEXT,
  p_titulo   TEXT,
  p_descricao TEXT DEFAULT NULL,
  p_link     TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.notifications (user_id, tipo, titulo, descricao, link)
  VALUES (p_user_id, p_tipo, p_titulo, p_descricao, p_link)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Destinatário = todo mundo com papel admin em `user_roles` (a fonte que o
-- resto do sistema já trata como autoritativa via has_role() nas policies de
-- RLS) -- não `profiles.role`, que existe em paralelo e está desatualizado
-- (só marca 1 admin hoje, enquanto user_roles marca 4).
CREATE OR REPLACE FUNCTION public.notificar_admins(
  p_tipo     TEXT,
  p_titulo   TEXT,
  p_descricao TEXT DEFAULT NULL,
  p_link     TEXT DEFAULT NULL
) RETURNS SETOF UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  FOR v_admin_id IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    RETURN NEXT public.notificar(v_admin_id, p_tipo, p_titulo, p_descricao, p_link);
  END LOOP;
END;
$$;
