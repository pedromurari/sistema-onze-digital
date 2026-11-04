-- Libera o painel interno do Webinário apenas para administradores.
-- Outros papéis podem receber acesso depois pela matriz de permissões.
begin;

insert into public.role_permissoes (papel, recurso, acao)
values
  ('admin', 'webinario', 'ver'),
  ('admin', 'webinario', 'editar')
on conflict do nothing;

commit;
