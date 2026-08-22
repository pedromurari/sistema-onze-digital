-- Sprint 2 — Publica no realtime as tabelas que o app ja escutava sem receber nada.
--
-- O Dashboard abre um canal ouvindo mudancas em alunos, pagamentos, lancamento_leads,
-- npa_evento_leads e tarefas. Mas so `lancamento_leads` e `npa_evento_leads` estavam na
-- publication `supabase_realtime` — as outras tres nunca emitiram evento. Ou seja: o
-- Dashboard parecia se atualizar sozinho quando alguem dava baixa num pagamento, e nao
-- se atualizava. Codigo presente, aparentemente correto, que nunca rodou.
--
-- O Realtime respeita RLS, entao com as policies da sprint 1 no lugar cada pessoa so
-- recebe evento de linha que ela poderia ler de qualquer forma.
--
-- REPLICA IDENTITY FULL e necessario para que o payload de UPDATE/DELETE traga os valores
-- antigos; sem isso o Realtime nao consegue avaliar RLS sobre a linha removida.

alter table public.alunos     replica identity full;
alter table public.pagamentos replica identity full;
alter table public.tarefas    replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and schemaname='public' and tablename='alunos') then
    alter publication supabase_realtime add table public.alunos;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and schemaname='public' and tablename='pagamentos') then
    alter publication supabase_realtime add table public.pagamentos;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and schemaname='public' and tablename='tarefas') then
    alter publication supabase_realtime add table public.tarefas;
  end if;
end $$;
