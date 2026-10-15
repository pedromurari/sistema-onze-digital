-- Registra as telas novas de Marketing (Diretoria e Gestor de Tráfego) na matriz
-- de permissões e libera visualização para admin e gestor. Pedro loga como
-- 'gestor', não 'admin' -- sem isso as telas ficam invisíveis pra ele mesmo.
insert into app_recursos (chave, modulo, rotulo, ordem)
values
  ('marketing_diretoria', 'marketing', 'Diretoria (Marketing)', (select coalesce(max(ordem), 0) + 1 from app_recursos)),
  ('trafego_gestor', 'marketing', 'Gestor de Tráfego', (select coalesce(max(ordem), 0) + 2 from app_recursos))
on conflict (chave) do nothing;

insert into role_permissoes (papel, recurso, acao)
values
  ('admin', 'marketing_diretoria', 'ver'),
  ('admin', 'trafego_gestor', 'ver'),
  ('gestor', 'marketing_diretoria', 'ver'),
  ('gestor', 'trafego_gestor', 'ver')
on conflict (papel, recurso, acao) do nothing;
