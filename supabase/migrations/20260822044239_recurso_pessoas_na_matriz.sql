-- Sprint 3i — A tela Pessoas entra na matriz de acesso.
--
-- Aqui se ve o ganho do modelo da sprint 1.2: tela nova = UMA linha em `app_recursos` mais
-- as linhas de padrao por papel. No modelo antigo seria coluna nova em
-- `user_access_permissions`, migration, quatro pontos no TypeScript e mais um switch.

insert into public.app_recursos (chave, modulo, rotulo, ordem)
values ('pessoas', 'Geral', 'Pessoas', 16)
on conflict (chave) do nothing;

-- Quem ja enxerga a base comercial ganha a busca de pessoas. A RLS de `pessoas` cuida do
-- escopo por turma, entao investidor tambem entra — vendo so as pessoas das turmas dele.
insert into public.role_permissoes (papel, recurso, acao)
select p.papel::public.app_role, 'pessoas', a.acao
from (values ('admin'), ('gestor')) p(papel)
cross join (values ('ver'), ('editar'), ('excluir'), ('ver_todos')) a(acao)
on conflict do nothing;

insert into public.role_permissoes (papel, recurso, acao)
select 'vendedor'::public.app_role, 'pessoas', a.acao
from (values ('ver'), ('editar'), ('ver_todos')) a(acao)
on conflict do nothing;

insert into public.role_permissoes (papel, recurso, acao)
values ('investidor'::public.app_role, 'pessoas', 'ver'),
       ('professora'::public.app_role, 'pessoas', 'ver')
on conflict do nothing;

-- `parceiro` fica de fora de proposito: nao entra no CRM.
