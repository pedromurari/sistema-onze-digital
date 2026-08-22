-- Sprint 1.3g — Papel `investidor`.
-- A Keila esta cadastrada como `vendedor` mas e investidora de 2 turmas. Alem de errado
-- no modelo, isso a coloca em `getActiveVendedores()` (AuthContext.tsx:430 filtra
-- vendedor/admin) — ou seja, ela aparece como atribuivel em todo seletor de vendedor,
-- em ranking de equipe e em relatorio de vendas.
-- Valor de enum precisa de transacao separada de onde e usado.

alter type public.app_role add value if not exists 'investidor';
