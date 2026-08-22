-- Sprint 1.1e — Views deixam de ignorar a RLS.
-- 11 views estavam SECURITY DEFINER (advisor ERROR): rodavam com a permissao de quem
-- criou a view, nao de quem consulta — o que tornaria inuteis as policies da sprint 1.3.
-- Hoje virar a chave e no-op (usuario logado ainda ve tudo); o efeito aparece quando
-- as tabelas forem apertadas. Por isso vira agora, antes e nao depois.
-- Excecao: parceiros_produtos_checkout continua DEFINER (pagina publica /comprar).

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
