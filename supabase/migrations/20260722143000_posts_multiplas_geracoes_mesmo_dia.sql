-- A rotina pode ser disparada quantas vezes for necessario. Cada execucao cria
-- um novo rascunho; a unica duplicidade bloqueada e a de duas tarefas ativas
-- concorrentes para a mesma origem.

CREATE UNIQUE INDEX IF NOT EXISTS equipe_11ds_tarefas_post_cliente_ativo_unique
  ON equipe_11ds_tarefas (cliente_id)
  WHERE tipo = 'post_cliente'
    AND status IN ('pendente', 'em_andamento');

CREATE UNIQUE INDEX IF NOT EXISTS equipe_11ds_tarefas_recorrente_ativo_unique
  ON equipe_11ds_tarefas (recorrente_id)
  WHERE recorrente_id IS NOT NULL
    AND status IN ('pendente', 'em_andamento');

-- A restricao antiga transformava uma segunda geracao no mesmo dia em erro.
-- O id do post preserva cada versao individual; conteudo_calendario continua
-- sendo a visao resumida do dia e aponta para a versao mais recente.
ALTER TABLE conteudo_posts
  DROP CONSTRAINT IF EXISTS conteudo_posts_cliente_data_unique;
