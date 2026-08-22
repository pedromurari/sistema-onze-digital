-- Sprint 1.3k — Cauda longa: as tabelas que sobraram com policy frouxa.
--
-- A sprint 1 fechou as tabelas grandes e deixou ~40 para trás. O inventário
-- (`scripts/auditoria-rls.sql`) apontou duas categorias:
--
--   * tabela sem nenhuma regra de permissão;
--   * tabela COM a regra certa e uma policy frouxa convivendo — e essa é a traiçoeira,
--     porque RLS soma com OU: a frouxa vence e a restritiva vira enfeite. Foi o caso de
--     `tarefas` e `mind_map_*`, que tinham policy por dono e outra liberando geral.
--
-- Cada tabela foi mapeada para a tela que a usa lendo todo o src/
-- (`scripts/mapear-tabelas-para-telas.py`), não por palpite.
--
-- `aplicar_camada_multi` preserva policies do papel `anon`, então a captura pública
-- (quiz IDM, lista de espera, clique em link de parceiro) continua funcionando.

-- ─── Lançamentos ─────────────────────────────────────────────────────────────
select public.aplicar_camada_multi('lancamentos',        array['lancamentos']);
select public.aplicar_camada_multi('lancamento_eventos', array['lancamentos']);

-- Os 12 espelhos de planilha. São dados brutos que sincronizam para `lancamento_leads`,
-- e juntos guardam milhares de leads reais — estavam legíveis por qualquer pessoa logada.
do $$
declare t text;
begin
  foreach t in array array[
    'sheet_leads_36','sheet_leads_37','sheet_leads_38','sheet_leads_39','sheet_leads_40',
    'sheet_leads_41','sheet_leads_42','sheet_leads_43','sheet_leads_44','sheet_leads_45',
    'sheet_leads_46','sheet_leads_47'
  ] loop
    perform public.aplicar_camada_multi(t, array['lancamentos']);
  end loop;
end $$;

-- ─── Boas-vindas e disparo ───────────────────────────────────────────────────
-- `boas_vindas_logs` tem 4.593 linhas com telefone de lead. Era a maior tabela ainda
-- aberta depois da sprint 1.
select public.aplicar_camada_multi('boas_vindas_config',  array['lancamentos','disparos_monitor','funil_lancamento']);
select public.aplicar_camada_multi('boas_vindas_logs',    array['lancamentos','disparos_monitor','funil_lancamento']);
select public.aplicar_camada_multi('turma_disparo_config', array['alunos','time_comercial','lancamentos']);

-- ─── NPA ─────────────────────────────────────────────────────────────────────
select public.aplicar_camada_multi('npa_eventos',     array['npa']);
select public.aplicar_camada_multi('npa_eventos_log', array['npa']);

-- ─── Aula Secreta ────────────────────────────────────────────────────────────
select public.aplicar_camada_multi('aula_secreta_eventos', array['aula_secreta']);
select public.aplicar_camada_multi('aula_secreta_leads',   array['aula_secreta']);
select public.aplicar_camada_multi('aula_secreta_log',     array['aula_secreta']);

-- ─── Operações: tarefas e calendários ────────────────────────────────────────
-- `tarefas` é o exemplo do problema: tinha `select_tarefas` (dono ou admin) E
-- `tarefas_select` (qualquer logado). A segunda anulava a primeira.
select public.aplicar_camada_multi('tarefas',             array['operacoes']);
select public.aplicar_camada_multi('tarefas_checklists',  array['operacoes']);
select public.aplicar_camada_multi('tarefas_comentarios', array['operacoes']);
select public.aplicar_camada_multi('tarefas_etapas',      array['operacoes']);
select public.aplicar_camada_multi('conteudo_calendario', array['operacoes']);
select public.aplicar_camada_multi('equipe',              array['operacoes']);

-- Dashboard também mostra os próximos eventos, por isso aceita os dois recursos.
select public.aplicar_camada_multi('eventos_calendario', array['operacoes','dashboard']);

-- ─── Mapa Mental ─────────────────────────────────────────────────────────────
select public.aplicar_camada_multi('mind_map_pages',       array['mapa_mental']);
select public.aplicar_camada_multi('mind_map_nodes',       array['mapa_mental']);
select public.aplicar_camada_multi('mind_map_connections', array['mapa_mental']);

-- ─── Franquias ───────────────────────────────────────────────────────────────
select public.aplicar_camada_multi('franquia_leads',    array['franquia_psi']);
select public.aplicar_camada_multi('franquia_campanha', array['franquia_psi']);
-- Captura pública de cidade interessada: o INSERT anônimo é preservado pelo helper.
select public.aplicar_camada_multi('lista_espera_cidades', array['franquia_psi']);

-- ─── Mídia ───────────────────────────────────────────────────────────────────
select public.aplicar_camada_multi('video_assets',  array['reels_idm']);
select public.aplicar_camada_multi('video_jobs',    array['reels_idm']);
select public.aplicar_camada_multi('video_scripts', array['reels_idm']);
select public.aplicar_camada_multi('midia_imagens_reaproveitaveis', array['posts','reels_idm']);

-- ─── Equipe 11DS ─────────────────────────────────────────────────────────────
select public.aplicar_camada_multi('equipe_11ds_agentes',    array['equipe_11ds']);
select public.aplicar_camada_multi('equipe_11ds_blueprints', array['equipe_11ds']);
select public.aplicar_camada_multi('equipe_11ds_mensagens',  array['equipe_11ds']);
select public.aplicar_camada_multi('equipe_11ds_tarefas',    array['equipe_11ds']);
select public.aplicar_camada_multi('equipe_11ds_times',      array['equipe_11ds']);

-- ─── Produtos ────────────────────────────────────────────────────────────────
-- O quiz IDM e o Seu Numerólogo vivem dentro da tela Produtos.
select public.aplicar_camada_multi('idm_quiz_leads',        array['produtos']);
select public.aplicar_camada_multi('seu_numerologo_config', array['produtos']);

-- ─── Parceiros ───────────────────────────────────────────────────────────────
-- O INSERT anônimo (clique no link encurtado /ir/:slug) é preservado.
select public.aplicar_camada_multi('parceiros_cliques', array['parceiros']);
