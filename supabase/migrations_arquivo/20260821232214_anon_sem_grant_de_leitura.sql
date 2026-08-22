-- Sprint 1.1f — Defesa em profundidade na camada de GRANT.
--
-- O default do Supabase da a `anon` privilegio de tabela em TUDO; hoje so a RLS
-- segurava. Consequencia: qualquer tabela nova criada sem policy, ou qualquer RLS
-- desligada por engano, nasce legivel pela internet. Foi exatamente assim que
-- `alunos` e `leads` ficaram expostas.
--
-- Aqui `anon` perde leitura e escrita destrutiva em tudo. INSERT fica intacto em
-- todas as tabelas de proposito: existem fluxos publicos de captura (formularios,
-- quiz, inscricao de evento, sync de planilha) e alguns podem estar em landing pages
-- fora deste repositorio — derrubar INSERT em massa arriscaria perder lead sem
-- ninguem perceber. O INSERT anonimo entra na revisao 1.1g, um fluxo por vez.

revoke select, update, delete, truncate, references, trigger
  on all tables in schema public
  from anon;

-- Unica leitura anonima que permanece: a view do checkout publico (/comprar/:produtoId),
-- que e SECURITY DEFINER de proposito e nao expoe tabela de base.
grant select on public.parceiros_produtos_checkout to anon;

-- Tabela nova nao nasce mais legivel por anonimo.
alter default privileges in schema public
  revoke select, update, delete on tables from anon;

-- Corrige de passagem: `seu_numerologo_leads` estava sem GRANT para o usuario logado,
-- alem de estar sem policy (1.1d). Sem os dois, a view `leads_unificados` quebrava com
-- "permission denied" e o kanban do Seu Numerologo ficava vazio.
grant select, insert, update, delete on public.seu_numerologo_leads to authenticated;
