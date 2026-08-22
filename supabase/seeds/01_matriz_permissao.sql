-- ============================================================================
-- Matriz de permissão — dados de CONFIGURAÇÃO do banco local.
--
-- POR QUE ESTE ARQUIVO EXISTE:
-- `supabase db dump` traz o schema, não os dados. Sem `app_recursos` e
-- `role_permissoes` populadas, `tem_permissao()` responde `false` para tudo e o banco
-- local nasce com todo mundo vendo zero — o que fez os primeiros testes de RLS
-- reportarem falha em tudo, como se as policies estivessem quebradas.
--
-- Isto não é dado de negócio: é a configuração que define quem pode o quê. Precisa
-- acompanhar o schema, do mesmo jeito que uma migration.
--
-- Espelha produção em 22/08/2026: 27 recursos, 195 linhas de padrão por papel.
-- Se mudar lá (pelo TeamManagement ou por migration), regerar aqui com:
--
--   select string_agg(format('  (%L, %L, %L)', papel, recurso, acao), E',\n')
--     from public.role_permissoes;
-- ============================================================================

insert into public.app_recursos (chave, modulo, rotulo, ordem) values
  ('dashboard', 'Geral', 'Início', 10),
  ('alunos', 'Geral', 'Cadastro de alunos', 15),
  ('pessoas', 'Geral', 'Pessoas', 16),
  ('pipeline', 'Comercial', 'Leads (Pipeline)', 20),
  ('time_comercial', 'Comercial', 'Time Comercial', 21),
  ('franquia_psi', 'Comercial', 'IDM PSI Franquias', 22),
  ('aquecimento_chips', 'Comercial', 'Aquecimento de Chips', 23),
  ('lancamentos', 'Lançamentos', 'Lançamentos', 30),
  ('funil_lancamento', 'Lançamentos', 'Funil de Lançamento', 31),
  ('disparos_monitor', 'Lançamentos', 'Monitor de Disparos', 32),
  ('chat_conversas', 'Lançamentos', 'Chat / Conversas', 33),
  ('npa', 'Eventos', 'NPA', 40),
  ('aula_secreta', 'Eventos', 'Aula Secreta', 41),
  ('financeiro', 'Financeiro', 'Financeiro', 50),
  ('financeiro_cfo', 'Financeiro', 'Análise CFO', 51),
  ('balanco', 'Financeiro', 'Balanço', 52),
  ('cobranca', 'Financeiro', 'Cobrança', 53),
  ('operacoes', 'Operações', 'Tarefas e calendários', 60),
  ('mapa_mental', 'Operações', 'Mapa Mental', 61),
  ('rodrygo', 'Operações', 'Rodrygo', 62),
  ('posts', 'Mídia', 'Posts', 70),
  ('reels_idm', 'Mídia', 'Reels IDM', 71),
  ('equipe_11ds', 'Mídia', 'Equipe 11DS', 72),
  ('parceiros', 'Parceiros', 'Parceiros', 80),
  ('produtos', 'Configuração', 'Produtos', 90),
  ('team', 'Configuração', 'Equipe e permissões', 91),
  ('settings', 'Configuração', 'Configurações', 92)
on conflict (chave) do nothing;

-- admin: tudo. gestor: opera o negócio, não mexe em configuração nem mídia.
-- vendedor: comercial, sem financeiro (decisão do dono em 22/08).
-- investidor: só financeiro/alunos/pessoas, e escopado por turma na RLS.
-- parceiro: NENHUMA linha, de propósito — usa o ParceiroPortal, não o CRM.
insert into public.role_permissoes (papel, recurso, acao) values
  ('admin', 'alunos', 'editar'), ('admin', 'alunos', 'excluir'), ('admin', 'alunos', 'ver'), ('admin', 'alunos', 'ver_todos'),
  ('admin', 'aquecimento_chips', 'editar'), ('admin', 'aquecimento_chips', 'excluir'), ('admin', 'aquecimento_chips', 'ver'), ('admin', 'aquecimento_chips', 'ver_todos'),
  ('admin', 'aula_secreta', 'editar'), ('admin', 'aula_secreta', 'excluir'), ('admin', 'aula_secreta', 'ver'), ('admin', 'aula_secreta', 'ver_todos'),
  ('admin', 'balanco', 'editar'), ('admin', 'balanco', 'excluir'), ('admin', 'balanco', 'ver'), ('admin', 'balanco', 'ver_todos'),
  ('admin', 'chat_conversas', 'editar'), ('admin', 'chat_conversas', 'excluir'), ('admin', 'chat_conversas', 'ver'), ('admin', 'chat_conversas', 'ver_todos'),
  ('admin', 'cobranca', 'editar'), ('admin', 'cobranca', 'excluir'), ('admin', 'cobranca', 'ver'), ('admin', 'cobranca', 'ver_todos'),
  ('admin', 'dashboard', 'editar'), ('admin', 'dashboard', 'excluir'), ('admin', 'dashboard', 'ver'), ('admin', 'dashboard', 'ver_todos'),
  ('admin', 'disparos_monitor', 'editar'), ('admin', 'disparos_monitor', 'excluir'), ('admin', 'disparos_monitor', 'ver'), ('admin', 'disparos_monitor', 'ver_todos'),
  ('admin', 'equipe_11ds', 'editar'), ('admin', 'equipe_11ds', 'excluir'), ('admin', 'equipe_11ds', 'ver'), ('admin', 'equipe_11ds', 'ver_todos'),
  ('admin', 'financeiro', 'editar'), ('admin', 'financeiro', 'excluir'), ('admin', 'financeiro', 'ver'), ('admin', 'financeiro', 'ver_todos'),
  ('admin', 'financeiro_cfo', 'editar'), ('admin', 'financeiro_cfo', 'excluir'), ('admin', 'financeiro_cfo', 'ver'), ('admin', 'financeiro_cfo', 'ver_todos'),
  ('admin', 'franquia_psi', 'editar'), ('admin', 'franquia_psi', 'excluir'), ('admin', 'franquia_psi', 'ver'), ('admin', 'franquia_psi', 'ver_todos'),
  ('admin', 'funil_lancamento', 'editar'), ('admin', 'funil_lancamento', 'excluir'), ('admin', 'funil_lancamento', 'ver'), ('admin', 'funil_lancamento', 'ver_todos'),
  ('admin', 'lancamentos', 'editar'), ('admin', 'lancamentos', 'excluir'), ('admin', 'lancamentos', 'ver'), ('admin', 'lancamentos', 'ver_todos'),
  ('admin', 'mapa_mental', 'editar'), ('admin', 'mapa_mental', 'excluir'), ('admin', 'mapa_mental', 'ver'), ('admin', 'mapa_mental', 'ver_todos'),
  ('admin', 'npa', 'editar'), ('admin', 'npa', 'excluir'), ('admin', 'npa', 'ver'), ('admin', 'npa', 'ver_todos'),
  ('admin', 'operacoes', 'editar'), ('admin', 'operacoes', 'excluir'), ('admin', 'operacoes', 'ver'), ('admin', 'operacoes', 'ver_todos'),
  ('admin', 'parceiros', 'editar'), ('admin', 'parceiros', 'excluir'), ('admin', 'parceiros', 'ver'), ('admin', 'parceiros', 'ver_todos'),
  ('admin', 'pessoas', 'editar'), ('admin', 'pessoas', 'excluir'), ('admin', 'pessoas', 'ver'), ('admin', 'pessoas', 'ver_todos'),
  ('admin', 'pipeline', 'editar'), ('admin', 'pipeline', 'excluir'), ('admin', 'pipeline', 'ver'), ('admin', 'pipeline', 'ver_todos'),
  ('admin', 'posts', 'editar'), ('admin', 'posts', 'excluir'), ('admin', 'posts', 'ver'), ('admin', 'posts', 'ver_todos'),
  ('admin', 'produtos', 'editar'), ('admin', 'produtos', 'excluir'), ('admin', 'produtos', 'ver'), ('admin', 'produtos', 'ver_todos'),
  ('admin', 'reels_idm', 'editar'), ('admin', 'reels_idm', 'excluir'), ('admin', 'reels_idm', 'ver'), ('admin', 'reels_idm', 'ver_todos'),
  ('admin', 'rodrygo', 'editar'), ('admin', 'rodrygo', 'excluir'), ('admin', 'rodrygo', 'ver'), ('admin', 'rodrygo', 'ver_todos'),
  ('admin', 'settings', 'editar'), ('admin', 'settings', 'excluir'), ('admin', 'settings', 'ver'), ('admin', 'settings', 'ver_todos'),
  ('admin', 'team', 'editar'), ('admin', 'team', 'excluir'), ('admin', 'team', 'ver'), ('admin', 'team', 'ver_todos'),
  ('admin', 'time_comercial', 'editar'), ('admin', 'time_comercial', 'excluir'), ('admin', 'time_comercial', 'ver'), ('admin', 'time_comercial', 'ver_todos'),
  ('gestor', 'alunos', 'editar'), ('gestor', 'alunos', 'excluir'), ('gestor', 'alunos', 'ver'), ('gestor', 'alunos', 'ver_todos'),
  ('gestor', 'aquecimento_chips', 'editar'), ('gestor', 'aquecimento_chips', 'ver'), ('gestor', 'aquecimento_chips', 'ver_todos'),
  ('gestor', 'aula_secreta', 'editar'), ('gestor', 'aula_secreta', 'ver'), ('gestor', 'aula_secreta', 'ver_todos'),
  ('gestor', 'balanco', 'editar'), ('gestor', 'balanco', 'ver'), ('gestor', 'balanco', 'ver_todos'),
  ('gestor', 'chat_conversas', 'editar'), ('gestor', 'chat_conversas', 'ver'), ('gestor', 'chat_conversas', 'ver_todos'),
  ('gestor', 'cobranca', 'editar'), ('gestor', 'cobranca', 'ver'), ('gestor', 'cobranca', 'ver_todos'),
  ('gestor', 'dashboard', 'editar'), ('gestor', 'dashboard', 'ver'), ('gestor', 'dashboard', 'ver_todos'),
  ('gestor', 'disparos_monitor', 'editar'), ('gestor', 'disparos_monitor', 'ver'), ('gestor', 'disparos_monitor', 'ver_todos'),
  ('gestor', 'financeiro', 'editar'), ('gestor', 'financeiro', 'ver'), ('gestor', 'financeiro', 'ver_todos'),
  ('gestor', 'financeiro_cfo', 'editar'), ('gestor', 'financeiro_cfo', 'ver'), ('gestor', 'financeiro_cfo', 'ver_todos'),
  ('gestor', 'franquia_psi', 'editar'), ('gestor', 'franquia_psi', 'ver'), ('gestor', 'franquia_psi', 'ver_todos'),
  ('gestor', 'funil_lancamento', 'editar'), ('gestor', 'funil_lancamento', 'ver'), ('gestor', 'funil_lancamento', 'ver_todos'),
  ('gestor', 'lancamentos', 'editar'), ('gestor', 'lancamentos', 'ver'), ('gestor', 'lancamentos', 'ver_todos'),
  ('gestor', 'mapa_mental', 'editar'), ('gestor', 'mapa_mental', 'ver'), ('gestor', 'mapa_mental', 'ver_todos'),
  ('gestor', 'npa', 'editar'), ('gestor', 'npa', 'ver'), ('gestor', 'npa', 'ver_todos'),
  ('gestor', 'operacoes', 'editar'), ('gestor', 'operacoes', 'ver'), ('gestor', 'operacoes', 'ver_todos'),
  ('gestor', 'pessoas', 'editar'), ('gestor', 'pessoas', 'excluir'), ('gestor', 'pessoas', 'ver'), ('gestor', 'pessoas', 'ver_todos'),
  ('gestor', 'pipeline', 'editar'), ('gestor', 'pipeline', 'ver'), ('gestor', 'pipeline', 'ver_todos'),
  ('gestor', 'rodrygo', 'editar'), ('gestor', 'rodrygo', 'ver'), ('gestor', 'rodrygo', 'ver_todos'),
  ('gestor', 'time_comercial', 'editar'), ('gestor', 'time_comercial', 'ver'), ('gestor', 'time_comercial', 'ver_todos'),
  ('investidor', 'alunos', 'ver'), ('investidor', 'financeiro', 'ver'), ('investidor', 'pessoas', 'ver'),
  ('professora', 'alunos', 'ver'),
  ('professora', 'dashboard', 'editar'), ('professora', 'dashboard', 'ver'),
  ('professora', 'mapa_mental', 'editar'), ('professora', 'mapa_mental', 'ver'),
  ('professora', 'operacoes', 'editar'), ('professora', 'operacoes', 'ver'),
  ('professora', 'pessoas', 'ver'),
  ('vendedor', 'alunos', 'editar'), ('vendedor', 'alunos', 'ver'), ('vendedor', 'alunos', 'ver_todos'),
  ('vendedor', 'aula_secreta', 'editar'), ('vendedor', 'aula_secreta', 'ver'),
  ('vendedor', 'dashboard', 'editar'), ('vendedor', 'dashboard', 'ver'),
  ('vendedor', 'franquia_psi', 'editar'), ('vendedor', 'franquia_psi', 'ver'),
  ('vendedor', 'lancamentos', 'editar'), ('vendedor', 'lancamentos', 'ver'), ('vendedor', 'lancamentos', 'ver_todos'),
  ('vendedor', 'mapa_mental', 'editar'), ('vendedor', 'mapa_mental', 'ver'),
  ('vendedor', 'npa', 'editar'), ('vendedor', 'npa', 'ver'),
  ('vendedor', 'operacoes', 'editar'), ('vendedor', 'operacoes', 'ver'),
  ('vendedor', 'pessoas', 'editar'), ('vendedor', 'pessoas', 'ver'), ('vendedor', 'pessoas', 'ver_todos'),
  ('vendedor', 'pipeline', 'editar'), ('vendedor', 'pipeline', 'ver'),
  ('vendedor', 'rodrygo', 'editar'), ('vendedor', 'rodrygo', 'ver'),
  ('vendedor', 'time_comercial', 'editar'), ('vendedor', 'time_comercial', 'ver')
on conflict do nothing;
