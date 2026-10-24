-- O nome do professor de cada aula vem de `profissionais`, cujo RLS é só-RH de
-- propósito (a tabela guarda pix/valor/documento, dado sensível). Quem só tem o
-- recurso 'pedagogico' (ex: professora/diretora pedagógica) fica sem ver o nome do
-- professor na Agenda de Aulas -- não por falta de acesso ao módulo, mas porque o
-- join trava no RLS da tabela de baixo.
--
-- Em vez de afrouxar o RLS de `profissionais` (exporia pix/valor pra quem só devia
-- ver nome), expõe só id+nome+ativo via function SECURITY DEFINER, que roda com o
-- privilégio do dono (bypassa o RLS restritivo da tabela) mas só devolve essas 3
-- colunas, e só pra quem já tem 'pedagogico' ou 'rh' (ver).
create or replace function public.pedagogico_profissionais_ativos()
returns table(id uuid, nome text, ativo boolean)
language sql
stable security definer
set search_path = public
as $$
  select p.id, p.nome, p.ativo
  from public.profissionais p
  where p.ativo = true
    and (tem_permissao('pedagogico', 'ver') or tem_permissao('rh', 'ver'))
  order by p.nome;
$$;

revoke all on function public.pedagogico_profissionais_ativos() from public, anon;
grant execute on function public.pedagogico_profissionais_ativos() to authenticated;
