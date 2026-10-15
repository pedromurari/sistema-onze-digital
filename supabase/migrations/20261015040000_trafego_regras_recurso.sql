-- Registra a tela "Regras de Automação" na matriz de permissões (admin + gestor).
insert into app_recursos (chave, modulo, rotulo, ordem)
values ('trafego_regras', 'marketing', 'Regras de Automação', (select coalesce(max(ordem), 0) + 1 from app_recursos))
on conflict (chave) do nothing;

insert into role_permissoes (papel, recurso, acao)
values
  ('admin', 'trafego_regras', 'ver'),
  ('gestor', 'trafego_regras', 'ver')
on conflict (papel, recurso, acao) do nothing;
