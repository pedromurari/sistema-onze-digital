-- Continuação da migração 'recurso_pedagogico_proprio': o RLS de verdade em `aulas` e
-- `presencas` ainda checava o recurso 'rh' direto nas policies SQL -- trocar o
-- RECURSO_POR_VIEW do front não adianta nada se o banco continuar barrando. Troca as
-- 8 policies (4 por tabela) de 'rh' pra 'pedagogico', e completa a matriz do recurso
-- novo pra admin/gestor não perderem acesso que já tinham via 'rh'.

insert into public.role_permissoes (papel, recurso, acao) values
  ('admin',  'pedagogico', 'ver'),
  ('admin',  'pedagogico', 'editar'),
  ('admin',  'pedagogico', 'excluir'),
  ('admin',  'pedagogico', 'ver_todos'),
  ('gestor', 'pedagogico', 'ver_todos')
on conflict (papel, recurso, acao) do nothing;

alter policy aulas_ver        on public.aulas      using (tem_permissao('pedagogico', 'ver'));
alter policy aulas_atualizar  on public.aulas      using (tem_permissao('pedagogico', 'editar')) with check (tem_permissao('pedagogico', 'editar'));
alter policy aulas_excluir    on public.aulas      using (tem_permissao('pedagogico', 'excluir'));
alter policy aulas_inserir    on public.aulas      with check (tem_permissao('pedagogico', 'editar'));

alter policy presencas_ver        on public.presencas using (tem_permissao('pedagogico', 'ver'));
alter policy presencas_atualizar  on public.presencas using (tem_permissao('pedagogico', 'editar')) with check (tem_permissao('pedagogico', 'editar'));
alter policy presencas_excluir    on public.presencas using (tem_permissao('pedagogico', 'excluir'));
alter policy presencas_inserir    on public.presencas with check (tem_permissao('pedagogico', 'editar'));
