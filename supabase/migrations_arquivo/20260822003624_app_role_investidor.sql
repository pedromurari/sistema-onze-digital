-- Sprint 1.3g — Papel `investidor`.
--
-- A Keila estava cadastrada como `vendedor` mas e investidora de 2 turmas. Alem de errado
-- no modelo, isso a colocava em `getActiveVendedores()` (src/contexts/AuthContext.tsx:430
-- filtra vendedor/admin) — ou seja, ela aparecia como atribuivel em todo seletor de
-- vendedor, em ranking de equipe e em relatorio de vendas por vendedor.
--
-- Valor de enum precisa de transacao separada de onde e usado (ver 20260822003642).

alter type public.app_role add value if not exists 'investidor';
