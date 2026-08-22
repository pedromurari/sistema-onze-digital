-- Sprint 3h — Escopo da ficha da pessoa.
--
-- Brecha que o teste por perfil expos: a investidora Keila via as 12.121 pessoas — nome,
-- telefone e e-mail da base inteira — mesmo tendo acesso a apenas 42 alunos. Juntar tudo
-- numa identidade unica cria um atalho novo para o dado, e o atalho precisa da mesma
-- tranca das tabelas de origem, senao a unificacao vira vazamento.
--
-- Regra: quem enxerga a base comercial inteira (pipeline, time comercial ou alunos com
-- `ver_todos`) ve todas as pessoas. Quem so tem turmas especificas ve so as pessoas
-- ligadas a alunos dessas turmas. Parceiro nao ve ninguem.
--
-- `pessoa_identificadores` e `pessoa_vinculos` herdam a regra por EXISTS sobre `pessoas`,
-- em vez de repetir a condicao — assim so existe um lugar pra mudar quando a regra mudar.

drop policy if exists pessoas_ver on public.pessoas;
create policy pessoas_ver on public.pessoas
  for select to authenticated
  using (
    public.tem_permissao('alunos', 'ver_todos')
    or public.tem_permissao('pipeline', 'ver')
    or public.tem_permissao('time_comercial', 'ver')
    or exists (
      select 1 from public.alunos a
       where a.pessoa_id = pessoas.id
         and a.turma_id::text = any (public.turmas_financeiro_permitidas())
    )
  );

drop policy if exists pessoa_identificadores_ver on public.pessoa_identificadores;
create policy pessoa_identificadores_ver on public.pessoa_identificadores
  for select to authenticated
  using (
    exists (select 1 from public.pessoas p where p.id = pessoa_identificadores.pessoa_id)
  );

drop policy if exists pessoa_vinculos_ver on public.pessoa_vinculos;
create policy pessoa_vinculos_ver on public.pessoa_vinculos
  for select to authenticated
  using (
    exists (select 1 from public.pessoas p where p.id = pessoa_vinculos.pessoa_id)
  );

comment on table public.pessoas is
  'Um ser humano, uma linha. Leitura escopada: sem `alunos/ver_todos`, pipeline ou time_comercial, so as pessoas das turmas em allowed_financeiro_turma_ids.';
comment on table public.pessoa_identificadores is
  'Telefone/email/cpf -> pessoa. Visivel apenas para quem enxerga a pessoa dona da chave (o EXISTS herda a RLS de `pessoas`).';
comment on table public.pessoa_vinculos is
  'Uma linha por registro de origem. Visivel apenas para quem enxerga a pessoa (o EXISTS herda a RLS de `pessoas`).';
