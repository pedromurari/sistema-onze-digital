-- Sprint 1.3i — Camadas B/C/D, primeiro lote.
--
-- Das 53 tabelas que ainda estavam com `ALL USING(true)`, este lote fecha as 21 em que o
-- recurso e inequivoco: mapeei tabela -> tela lendo todo o src/, e so entram aqui as que
-- pertencem a UMA area. As que varias telas com permissoes diferentes compartilham
-- (`alunos`, `turmas`, `lancamento_leads`, `whatsapp_mensagens`, `funnel_*`, `disparo_*`)
-- ficam para um passo proprio, com verificacao tela a tela — amarrar essas no chute
-- quebraria o Time Comercial do vendedor.

-- ─── Catalogo (camada D): quem esta logado le, gestor/admin escreve ──────────
create or replace function public.aplicar_camada_catalogo(p_tabela text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r   record;
  cmd text;
begin
  for r in select policyname from pg_policies
            where schemaname = 'public' and tablename = p_tabela
  loop
    execute format('drop policy %I on public.%I', r.policyname, p_tabela);
  end loop;

  execute format($f$
    create policy %I on public.%I for select to authenticated using (true)
  $f$, p_tabela || '_ver', p_tabela);

  execute format($f$
    create policy %I on public.%I
      for insert to authenticated with check (public.is_gestor())
  $f$, p_tabela || '_inserir', p_tabela);

  foreach cmd in array array['update','delete']
  loop
    execute format($f$
      create policy %I on public.%I for %s to authenticated using (public.is_gestor())
    $f$, p_tabela || '_' || cmd, p_tabela, cmd);
  end loop;

  execute format($f$
    alter policy %I on public.%I with check (public.is_gestor())
  $f$, p_tabela || '_update', p_tabela);
end;
$fn$;

comment on function public.aplicar_camada_catalogo(text) is
  'Camada D: leitura para qualquer usuario logado, escrita so para gestor/admin. Para tabela de catalogo que muita tela precisa ler.';

select public.aplicar_camada_catalogo('turmas');
select public.aplicar_camada_catalogo('turma_responsaveis');
select public.aplicar_camada_catalogo('responsaveis');
select public.aplicar_camada_catalogo('bonus_tipos');
select public.aplicar_camada_catalogo('bonus_turmas');
select public.aplicar_camada_catalogo('conteudo_clientes');

-- `kanban_colunas` e configuracao de quadro, usada pelo hook useKanbanColunas em varios
-- modulos. Leitura geral; escrita de gestor pra que um vendedor nao reorganize o funil
-- de todo mundo sem querer.
select public.aplicar_camada_catalogo('kanban_colunas');

-- ─── Aquecimento de Chips (tela admin-only) ──────────────────────────────────
select public.aplicar_camada('aquecimento_chips',             'aquecimento_chips');
select public.aplicar_camada('aquecimento_config',            'aquecimento_chips');
select public.aplicar_camada('aquecimento_grupos',            'aquecimento_chips');
select public.aplicar_camada('aquecimento_jobs',              'aquecimento_chips');
select public.aplicar_camada('aquecimento_mensagens',         'aquecimento_chips');
select public.aplicar_camada('aquecimento_roteiro_mensagens', 'aquecimento_chips');
select public.aplicar_camada('aquecimento_roteiros_dm',       'aquecimento_chips');

-- ─── SDR de IA e agentes: tudo vive dentro da tela Equipe 11DS ───────────────
select public.aplicar_camada('leads_ia_config',                 'equipe_11ds');
select public.aplicar_camada('leads_ia_conhecimento',           'equipe_11ds');
select public.aplicar_camada('leads_ia_conhecimento_sugestoes', 'equipe_11ds');
select public.aplicar_camada('leads_ia_oferta_ativa',           'equipe_11ds');
select public.aplicar_camada('leads_ia_conversas',              'equipe_11ds');
select public.aplicar_camada('leads_ia_mensagens',              'equipe_11ds');
select public.aplicar_camada('equipe_11ds_recorrentes',         'equipe_11ds');

-- ─── Posts ───────────────────────────────────────────────────────────────────
select public.aplicar_camada('conteudo_posts', 'posts');

-- ─── Pipeline: cartas, valores e quadros de lead ─────────────────────────────
select public.aplicar_camada('lead_cartas_usadas',      'pipeline');
select public.aplicar_camada('leads_cartas_negociacao', 'pipeline');
select public.aplicar_camada('leads_diretos_config',    'pipeline');
select public.aplicar_camada('leads_produtos_valores',  'pipeline');
select public.aplicar_camada('leads_quadros',           'pipeline');
select public.aplicar_camada('leads_quadro_cards',      'pipeline');

-- ─── Time Comercial ──────────────────────────────────────────────────────────
select public.aplicar_camada('time_comercial_campanhas', 'time_comercial');
