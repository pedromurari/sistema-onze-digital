-- "Olhinho" na tabela Minhas Vendas (aba do Time Comercial): a vendedora precisa
-- conseguir ver e corrigir os DADOS PESSOAIS do aluno que ela fechou (nome,
-- e-mail, whatsapp, cpf, rg, nascimento, endereco) sem precisar pedir pro dono
-- toda vez que percebe um erro (ex: contrato foi mandado pro e-mail errado).
-- Ela NUNCA ve parcelas/pagamentos -- isso continua só no Financeiro.
--
-- Duas RPCs, mesma trava de permissão de time_comercial_minhas_vendas
-- (admin/gestor vê qualquer um; vendedora só o próprio vendedor_id):
--   time_comercial_aluno_dados_pessoais(p_aluno_id)   -- leitura
--   time_comercial_aluno_atualizar_dados_pessoais(...) -- escrita, só nesses campos

CREATE OR REPLACE FUNCTION public.time_comercial_aluno_dados_pessoais(p_aluno_id uuid)
RETURNS TABLE(
  id uuid, nome text, email text, whatsapp text, cpf text, rg text,
  data_nascimento date, sexo text, pais text, cep text, cidade_estado text, endereco text,
  vendedor_id text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role);
  v_nome text := (SELECT p.nome FROM public.profiles p WHERE p.id = auth.uid());
BEGIN
  RETURN QUERY
  SELECT a.id, a.nome, a.email, a.whatsapp, a.cpf, a.rg,
    a.data_nascimento, a.sexo, a.pais, a.cep, a.cidade_estado, a.endereco,
    a.vendedor_id
  FROM public.alunos a
  WHERE a.id = p_aluno_id AND a.vendedor_id IS NOT NULL AND (v_admin OR a.vendedor_id = v_nome);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.time_comercial_aluno_dados_pessoais(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.time_comercial_aluno_atualizar_dados_pessoais(
  p_aluno_id uuid, p_nome text, p_email text, p_whatsapp text, p_cpf text, p_rg text,
  p_data_nascimento date, p_sexo text, p_pais text, p_cep text, p_cidade_estado text, p_endereco text
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role);
  v_nome text := (SELECT p.nome FROM public.profiles p WHERE p.id = auth.uid());
  v_dono text;
BEGIN
  SELECT a.vendedor_id INTO v_dono FROM public.alunos a WHERE a.id = p_aluno_id;
  IF v_dono IS NULL THEN
    RETURN json_build_object('ok', false, 'erro', 'aluno_nao_encontrado');
  END IF;
  IF NOT (v_admin OR v_dono = v_nome) THEN
    RETURN json_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;
  IF coalesce(trim(p_nome), '') = '' THEN
    RETURN json_build_object('ok', false, 'erro', 'nome_obrigatorio');
  END IF;

  UPDATE public.alunos SET
    nome = trim(p_nome),
    email = nullif(trim(p_email), ''),
    whatsapp = nullif(trim(p_whatsapp), ''),
    cpf = nullif(trim(p_cpf), ''),
    rg = nullif(trim(p_rg), ''),
    data_nascimento = p_data_nascimento,
    sexo = nullif(trim(p_sexo), ''),
    pais = nullif(trim(p_pais), ''),
    cep = nullif(trim(p_cep), ''),
    cidade_estado = nullif(trim(p_cidade_estado), ''),
    endereco = nullif(trim(p_endereco), '')
  WHERE id = p_aluno_id;

  RETURN json_build_object('ok', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.time_comercial_aluno_atualizar_dados_pessoais(
  uuid, text, text, text, text, text, date, text, text, text, text, text
) TO authenticated;
