-- Varredura por policies `USING (true)` que sobreviveram a aplicacao das camadas.
--
-- Motivo da varredura: ao fechar a chave da Evolution, `evolution_config` apareceu com uma
-- policy `SELECT USING (true)` convivendo com a de admin. Policies sao OR — a permissiva
-- vencia, e a tabela nunca esteve protegida apesar de "ter camada". Se uma escapou, valia
-- procurar as outras.
--
-- Encontradas 16. A maioria e a camada D de proposito (catalogo que todo autenticado le e
-- so admin escreve): produtos, turmas, bonus_tipos, bonus_turmas, ddd_regioes,
-- payment_method_rates, kanban_colunas, app_recursos, crm_config, responsaveis,
-- conteudo_clientes. Essas ficam como estao.
--
-- Tres nao sao catalogo e mudam aqui.

-- ── 1. turma_responsaveis: e tabela de REMUNERACAO, nao de catalogo ─────────
--
-- Guarda o split de receita por turma — 8 linhas, percentuais de 50% a 100% entre 3
-- pessoas. Com `USING (true)`, qualquer pessoa logada — vendedor, professora, parceiro —
-- lia quanto cada socio recebe em cada turma. Isso e camada A.
--
-- Quem consome: Balanco, Dashboard, FinanceiroCFO e RepasseTurmasConfig, todas telas de
-- financeiro. Todas tratam o retorno como `data || []`, e `makeGetOwnerShare` devolve 1
-- quando nao ha filtro de socio — entao quem perde o acesso nao ve numero errado, ve o
-- mesmo total de sempre, sem a quebra por dono.
select public.aplicar_camada_multi('turma_responsaveis', array['financeiro']);

comment on table public.turma_responsaveis is
  'Split de receita por turma (quanto cada responsavel recebe). Dado de remuneracao: leitura exige permissao de financeiro.';

-- ── 2 e 3. Tabelas de infra da Evolution ────────────────────────────────────
--
-- `evolution_task_config` diz quais instancias atendem cada tarefa e
-- `evolution_conexao_eventos` guarda o historico de conexao/desconexao. Nao sao segredo,
-- mas descrevem a infraestrutura de disparo e nao interessam a quem nao dispara. Ficam com
-- o mesmo alcance que `evolution_config` passou a ter.
select public.aplicar_camada_multi('evolution_task_config',
         array['settings', 'disparos_monitor', 'lancamentos']);
select public.aplicar_camada_multi('evolution_conexao_eventos',
         array['settings', 'disparos_monitor', 'lancamentos', 'time_comercial']);

-- ── O que NAO foi mexido, e por que ─────────────────────────────────────────
--
-- `notifications` tem `INSERT WITH CHECK (true)`: qualquer pessoa logada cria notificacao
-- para qualquer outra, com titulo, descricao e link livres. E um vetor de forja dentro do
-- sistema. Nao foi fechado porque `TarefasView.tsx` depende disso de forma legitima —
-- atribuir tarefa notifica o colega. Fechar exigiria repensar esse fluxo, o que e mudanca
-- de produto e nao de seguranca. Fica registrado como decisao consciente.
--
-- `lista_espera_cidades` tem INSERT publico para anon: e o formulario de lista de espera
-- de franquia, captura publica real. A LEITURA ja exige `franquia_psi/ver`, que e o que
-- protege nome, whatsapp e email de quem se inscreveu.
