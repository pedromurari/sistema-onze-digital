-- A publicação Realtime foi cruzada com todas as assinaturas `postgres_changes`
-- do frontend e com o volume acumulado de escrita das tabelas.
--
-- 1. Estes seis domínios usavam REPLICA IDENTITY FULL, mas seus callbacks não leem
--    `payload.old`: eles apenas invalidam o React Query ou recarregam a tela. Todas
--    as tabelas têm chave primária e RLS. DEFAULT mantém INSERT/UPDATE/DELETE e envia
--    a chave antiga quando necessária, sem carregar a linha antiga inteira no WAL.
-- 2. `aula_secreta_eventos` estava na publicação sem qualquer assinatura no código.
--    A tela lê a tabela sob demanda e invalida localmente suas próprias mutações.
--
-- Não retiramos as tabelas movimentadas (`lancamento_leads`, `whatsapp_mensagens`,
-- `alunos`, `pagamentos`): elas têm consumidores reais e remover a publicação faria
-- Kanban, chat ou financeiro deixarem de refletir alterações externas.
--
-- Escrito pelo Codex. NÃO aplicado: o Claude deve revisar e aplicar.

alter table public.alunos             replica identity default;
alter table public.pagamentos         replica identity default;
alter table public.tarefas            replica identity default;
alter table public.turmas              replica identity default;
alter table public.responsaveis        replica identity default;
alter table public.turma_responsaveis  replica identity default;

do $$
begin
  if exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'aula_secreta_eventos'
  ) then
    alter publication supabase_realtime drop table public.aula_secreta_eventos;
  end if;
end $$;

