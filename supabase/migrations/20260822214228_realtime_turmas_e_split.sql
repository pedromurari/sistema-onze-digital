-- Publica no realtime as tabelas de configuracao que as telas financeiras compartilham.
--
-- ── O QUE ESTAVA MEIO PRONTO ────────────────────────────────────────────────
-- `src/lib/db/realtime.ts` ja escutava `turmas`, mas a tabela nunca esteve na publicacao
-- `supabase_realtime` — o canal assinava e nada chegava. E a mesma armadilha que o
-- comentario daquele arquivo descreve sobre o Dashboard antigo: parecia reativo e nao era.
--
-- `turma_responsaveis` e `responsaveis` nem estavam no mapa, e sao justamente as que o
-- Balanco e o FinanceiroCFO editam (o split de receita por turma).
--
-- ── POR QUE ESTAS TRES ──────────────────────────────────────────────────────
-- Sao pequenas e mudam pouco: 13 turmas, 10 linhas de split, 3 socios. O custo de
-- publica-las e proximo de zero e o ganho e concreto — o Pedro cadastrar uma turma nova
-- ou corrigir um split passa a aparecer na tela do Igor sem F5.
--
-- `leads` fica DE FORA de proposito. Tem 11.778 linhas e, durante um lancamento, recebe
-- centenas de insercoes por minuto; publicar transformaria cada lead novo em recarga de
-- uma lista grande. Ela tambem sai do mapa no frontend, porque escutar uma tabela nao
-- publicada e so codigo morto que finge funcionar.

alter table public.turmas             replica identity full;
alter table public.turma_responsaveis replica identity full;
alter table public.responsaveis       replica identity full;

do $$
begin
  -- `add table` estoura se a tabela ja estiver na publicacao; conferir antes deixa a
  -- migration reexecutavel num banco limpo.
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and schemaname='public' and tablename='turmas') then
    alter publication supabase_realtime add table public.turmas;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and schemaname='public' and tablename='turma_responsaveis') then
    alter publication supabase_realtime add table public.turma_responsaveis;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and schemaname='public' and tablename='responsaveis') then
    alter publication supabase_realtime add table public.responsaveis;
  end if;
end $$;
