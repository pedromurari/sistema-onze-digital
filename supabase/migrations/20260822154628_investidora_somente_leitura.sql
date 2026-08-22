-- Investidora passa a ser somente leitura no financeiro (decisao do dono).
--
-- A Keila mantinha `financeiro/editar` como excecao explicita porque sempre teve escrita
-- — todo mundo tinha, antes da sprint 1. Preservar foi proposital na hora da migracao
-- (nao revogar acesso sem ordem), e agora a ordem veio.
--
-- O papel `investidor` ja nascia so com `financeiro/ver`; apagar a excecao a devolve ao
-- padrao do papel. Ela continua enxergando os 576 pagamentos das duas turmas dela —
-- so nao altera mais nada.

delete from public.user_permissao_override o
 where o.user_id = (select id from public.profiles where nome = 'Keila')
   and o.recurso = 'financeiro'
   and o.acao    = 'editar';

comment on type public.app_role is
  'admin, gestor, vendedor, professora, parceiro, investidor. Investidor: SOMENTE LEITURA do financeiro, e so das turmas em allowed_financeiro_turma_ids.';
