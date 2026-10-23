-- Hoje Diretoria Pedagógico, Provas e Trabalhos e Agenda de Aulas pegam carona nos
-- recursos 'mapa_mental'/'rh' (compartilhados com RH) -- não dá pra liberar só o
-- Pedagógico pra alguém sem também abrir Painel de RH e Fechamento de Folha. Cria um
-- recurso próprio e migra o papel 'professora' (zero usuários hoje, seguro redefinir)
-- pra ele + alunos/pessoas (ver). 'gestor' ganha o mesmo recurso espelhando o 'rh' que
-- já tem, pra não perder acesso à Agenda quando a view trocar de recurso no código.

insert into public.app_recursos (chave, modulo, rotulo, ordem)
values ('pedagogico', 'pedagogico', 'Pedagógico', 60)
on conflict (chave) do nothing;

-- Redefine 'professora': remove dashboard/mapa_mental/operacoes (vazava RH e outras
-- áreas), garante pedagogico (ver+editar) + alunos/pessoas (ver, já existiam).
delete from public.role_permissoes
 where papel = 'professora' and recurso in ('dashboard', 'mapa_mental', 'operacoes');

insert into public.role_permissoes (papel, recurso, acao) values
  ('professora', 'pedagogico', 'ver'),
  ('professora', 'pedagogico', 'editar')
on conflict (papel, recurso, acao) do nothing;

-- 'gestor' já tem 'rh'; espelha em 'pedagogico' pra não perder Agenda de Aulas quando
-- a view migrar de recurso.
insert into public.role_permissoes (papel, recurso, acao) values
  ('gestor', 'pedagogico', 'ver'),
  ('gestor', 'pedagogico', 'editar')
on conflict (papel, recurso, acao) do nothing;
