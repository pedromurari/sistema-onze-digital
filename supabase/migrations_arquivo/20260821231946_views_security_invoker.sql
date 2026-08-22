-- Sprint 1.1e — Views deixam de ignorar a RLS.
--
-- 11 views estavam como SECURITY DEFINER (advisor nivel ERROR): elas rodam com a
-- permissao de quem CRIOU a view, nao de quem consulta. Ou seja, `vw_alunos_financeiro`,
-- `financeiro_resumo` e cia devolviam tudo independentemente de qualquer policy —
-- e continuariam devolvendo depois da sprint 1.3, tornando as novas policies inuteis.
--
-- `security_invoker = true` faz a view respeitar a RLS do usuario da consulta.
-- Hoje isso e um no-op (usuario logado ainda ve tudo pelas policies USING(true));
-- o efeito real aparece quando a sprint 1.3 apertar as tabelas — que e exatamente
-- o motivo de virar a chave agora, antes e nao depois.
--
-- Excecao: `parceiros_produtos_checkout` fica SECURITY DEFINER de proposito. E a
-- unica lida pela pagina publica /comprar/:produtoId com a chave anonima, e o anon
-- nao tem (nem deve ter) SELECT nas tabelas de base.

alter view public.vw_alunos_financeiro    set (security_invoker = true);
alter view public.alunos_financeiro       set (security_invoker = true);
alter view public.financeiro_resumo       set (security_invoker = true);
alter view public.vw_cfo_turmas           set (security_invoker = true);
alter view public.vw_receita_por_fonte    set (security_invoker = true);
alter view public.dashboard_metricas      set (security_invoker = true);
alter view public.v_pipeline_contratos    set (security_invoker = true);
alter view public.lancamento_kanban       set (security_invoker = true);
alter view public.npa_kanban              set (security_invoker = true);
alter view public.leads_unificados        set (security_invoker = true);

comment on view public.parceiros_produtos_checkout is
  'SECURITY DEFINER de proposito: lida pela pagina publica /comprar/:produtoId com a chave anonima.';
