-- Sprint 1.3k — Cauda longa: as tabelas que sobraram com policy frouxa.
-- Cada tabela foi mapeada para a tela que a usa lendo todo o src/, nao por palpite.
-- `aplicar_camada_multi` preserva policies do papel anon, entao a captura publica
-- (quiz IDM, lista de espera, clique em link de parceiro) continua funcionando.

select public.aplicar_camada_multi('lancamentos',        array['lancamentos']);
select public.aplicar_camada_multi('lancamento_eventos', array['lancamentos']);

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

select public.aplicar_camada_multi('boas_vindas_config',   array['lancamentos','disparos_monitor','funil_lancamento']);
select public.aplicar_camada_multi('boas_vindas_logs',     array['lancamentos','disparos_monitor','funil_lancamento']);
select public.aplicar_camada_multi('turma_disparo_config', array['alunos','time_comercial','lancamentos']);

select public.aplicar_camada_multi('npa_eventos',     array['npa']);
select public.aplicar_camada_multi('npa_eventos_log', array['npa']);

select public.aplicar_camada_multi('aula_secreta_eventos', array['aula_secreta']);
select public.aplicar_camada_multi('aula_secreta_leads',   array['aula_secreta']);
select public.aplicar_camada_multi('aula_secreta_log',     array['aula_secreta']);

-- `tarefas` e o exemplo do problema: tinha `select_tarefas` (dono ou admin) E
-- `tarefas_select` (qualquer logado). A segunda anulava a primeira.
select public.aplicar_camada_multi('tarefas',             array['operacoes']);
select public.aplicar_camada_multi('tarefas_checklists',  array['operacoes']);
select public.aplicar_camada_multi('tarefas_comentarios', array['operacoes']);
select public.aplicar_camada_multi('tarefas_etapas',      array['operacoes']);
select public.aplicar_camada_multi('conteudo_calendario', array['operacoes']);
select public.aplicar_camada_multi('equipe',              array['operacoes']);
select public.aplicar_camada_multi('eventos_calendario',  array['operacoes','dashboard']);

select public.aplicar_camada_multi('mind_map_pages',       array['mapa_mental']);
select public.aplicar_camada_multi('mind_map_nodes',       array['mapa_mental']);
select public.aplicar_camada_multi('mind_map_connections', array['mapa_mental']);

select public.aplicar_camada_multi('franquia_leads',       array['franquia_psi']);
select public.aplicar_camada_multi('franquia_campanha',    array['franquia_psi']);
select public.aplicar_camada_multi('lista_espera_cidades', array['franquia_psi']);

select public.aplicar_camada_multi('video_assets',  array['reels_idm']);
select public.aplicar_camada_multi('video_jobs',    array['reels_idm']);
select public.aplicar_camada_multi('video_scripts', array['reels_idm']);
select public.aplicar_camada_multi('midia_imagens_reaproveitaveis', array['posts','reels_idm']);

select public.aplicar_camada_multi('equipe_11ds_agentes',    array['equipe_11ds']);
select public.aplicar_camada_multi('equipe_11ds_blueprints', array['equipe_11ds']);
select public.aplicar_camada_multi('equipe_11ds_mensagens',  array['equipe_11ds']);
select public.aplicar_camada_multi('equipe_11ds_tarefas',    array['equipe_11ds']);
select public.aplicar_camada_multi('equipe_11ds_times',      array['equipe_11ds']);

select public.aplicar_camada_multi('idm_quiz_leads',        array['produtos']);
select public.aplicar_camada_multi('seu_numerologo_config', array['produtos']);

select public.aplicar_camada_multi('parceiros_cliques', array['parceiros']);
