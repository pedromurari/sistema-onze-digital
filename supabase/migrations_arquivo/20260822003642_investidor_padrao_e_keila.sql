-- Sprint 1.3h — Padrao do papel `investidor` e migracao da Keila.
--
-- Investidor ve o financeiro das PROPRIAS turmas e nada mais. Nao entra em Balanco
-- (waterfall da empresa inteira), nao entra em Pipeline, nao aparece em seletor de
-- vendedor. `ver_todos` fica de fora de proposito: e justamente a ausencia dele que faz
-- a RLS de `pagamentos` cair no escopo de `allowed_financeiro_turma_ids`.

insert into public.role_permissoes (papel, recurso, acao)
values ('investidor'::public.app_role, 'financeiro', 'ver')
on conflict do nothing;

-- Keila: vendedor -> investidor
update public.user_roles
   set role = 'investidor'::public.app_role
 where user_id = (select id from public.profiles where nome = 'Keila')
   and role = 'vendedor'::public.app_role;

-- Limpa os overrides que viraram redundantes com o novo padrao. Sobra so o que de fato
-- diverge — que e a regra da tabela de excecao.
delete from public.user_permissao_override o
 where o.user_id = (select id from public.profiles where nome = 'Keila')
   and (
     -- `financeiro/ver` agora vem do papel
     (o.recurso = 'financeiro' and o.acao = 'ver' and o.permitido)
     -- `ver_todos` ja e negado por padrao (o papel nao tem a linha)
     or (o.recurso = 'financeiro' and o.acao = 'ver_todos' and not o.permitido)
     -- recursos que o papel nao concede: negacao explicita virou redundante
     or (o.recurso <> 'financeiro' and not o.permitido)
   );

-- ATENCAO: o `financeiro/editar` da Keila NAO foi removido. Ela tinha escrita antes
-- (todo mundo tinha), e tirar em silencio poderia quebrar algo que ela faz no dia a dia.
-- Fica como excecao explicita ate o dono confirmar se investidora deve ser so leitura.
insert into public.user_permissao_override (user_id, recurso, acao, permitido)
select id, 'financeiro', 'editar', true from public.profiles where nome = 'Keila'
on conflict (user_id, recurso, acao) do update set permitido = true;

comment on type public.app_role is
  'admin, gestor, vendedor, professora, parceiro, investidor. Investidor ve o financeiro so das turmas em allowed_financeiro_turma_ids.';
