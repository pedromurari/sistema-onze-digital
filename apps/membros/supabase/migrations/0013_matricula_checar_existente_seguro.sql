-- Funcao segura para o formulario publico de matricula (idmpsi.com.br/matricula.html)
-- checar se ja existe lead/aluno com o mesmo email/telefone, sem precisar dar
-- GRANT SELECT em leads/alunos pro role anon (o que exporia CPF/RG/dados de
-- todo mundo publicamente, ja que a anon key fica no HTML). SECURITY DEFINER
-- roda com privilegio elevado so dentro da funcao, sem tocar nas permissoes do
-- chamador.
--
-- Aplicada diretamente via MCP Supabase em produção; este arquivo é só o
-- registro histórico no repositório.
create or replace function public.matricula_checar_existente(p_email text, p_phone9 text)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'lead_id', (
      select id from leads
      where email = p_email or (p_phone9 <> '' and whatsapp ilike '%' || p_phone9 || '%')
      order by criado_em desc nulls last
      limit 1
    ),
    'aluno_id', (
      select id from alunos
      where email = p_email
      limit 1
    )
  );
$$;

grant execute on function public.matricula_checar_existente(text, text) to anon;
