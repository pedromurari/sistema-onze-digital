-- Sprint 1.1f — Defesa em profundidade na camada de GRANT.
-- O default do Supabase da a `anon` privilegio de tabela em TUDO; so a RLS segurava.
-- Assim qualquer tabela nova sem policy nasce legivel pela internet.
-- INSERT fica intacto de proposito (fluxos publicos de captura, alguns possivelmente
-- em landing pages fora deste repo); sera revisado em 1.1g, um fluxo por vez.

revoke select, update, delete, truncate, references, trigger
  on all tables in schema public
  from anon;

grant select on public.parceiros_produtos_checkout to anon;

alter default privileges in schema public
  revoke select, update, delete on tables from anon;

-- Corrige de passagem: seu_numerologo_leads estava sem GRANT para authenticated,
-- alem de sem policy (1.1d). Sem os dois, `leads_unificados` quebrava com
-- "permission denied" e o kanban do Seu Numerologo ficava vazio.
grant select, insert, update, delete on public.seu_numerologo_leads to authenticated;
