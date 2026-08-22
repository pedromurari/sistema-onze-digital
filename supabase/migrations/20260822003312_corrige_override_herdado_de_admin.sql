-- Sprint 1.3f — Remove override herdado de flag decorativa de admin.
--
-- Regressao pega no teste: o Pedro, ja como gestor, ficou vendo 0 pagamentos.
--
-- Causa: enquanto ele era admin, as colunas de `user_access_permissions` dele eram
-- decorativas — `canAccessView` liberava admin antes de olhar flag, entao ninguem nunca
-- percebeu que estavam quase todas desligadas. A migration da 1.2 sabia disso e pulou
-- admins de proposito. Mas a 1.3a promoveu o Pedro a gestor ANTES da 1.3e migrar os
-- `ver_todos` — e ai as flags mortas dele entraram como restricao de verdade.
--
-- Licao pro resto da migracao: ao trocar o papel de alguem, a linha antiga de
-- `user_access_permissions` dessa pessoa nao vale mais nada e nao deve ser importada.

delete from public.user_permissao_override o
 where o.user_id = (select id from public.profiles where nome = 'Pedro Murari')
   and o.recurso = 'financeiro'
   and o.acao    = 'ver_todos';
