-- Mudanças manuais em campanhas/orçamentos exigem permissão de edição,
-- separada da permissão de leitura já existente.
insert into public.role_permissoes (papel, recurso, acao)
values
  ('admin', 'trafego_gestor', 'editar'),
  ('gestor', 'trafego_gestor', 'editar')
on conflict (papel, recurso, acao) do nothing;
