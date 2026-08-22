-- Sprint 1.3j — Camadas B/C/D, lote final: as 23 tabelas compartilhadas.
-- Mapeei tela por tela antes de escrever e achei tres armadilhas que teriam quebrado
-- producao num lote cego: `whatsapp_mensagens` alimenta o chat do Time Comercial (nao so
-- a Cobranca); `lead_aquecimento_vendedores` e ESCRITA pelo ChatTimeComercial; e
-- `funnel_configs` e usada pelo NPAKanban alem do FunilLancamento.
-- Corrige tambem regressao de 20260821232214: `parceiros_links` tem policy anon para o
-- /ir/:slug, mas o revoke geral de GRANT derrubou o acesso. Policy sem GRANT nao adianta.

grant select on public.parceiros_links to anon;

create or replace function public.aplicar_camada_multi(p_tabela text, p_recursos text[])
returns void
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  r        record;
  cmd      text;
  cond_ver text;
  cond_edt text;
begin
  -- Preserva policies do papel anon: sao as de captura publica (matricula, inscricao
  -- em evento, resolucao de link encurtado).
  for r in select policyname from pg_policies
            where schemaname = 'public' and tablename = p_tabela
              and roles::text not like '%anon%'
  loop
    execute format('drop policy %I on public.%I', r.policyname, p_tabela);
  end loop;

  select string_agg(format('public.tem_permissao(%L, %L)', x, 'ver'),    ' or ')
    into cond_ver from unnest(p_recursos) x;
  select string_agg(format('public.tem_permissao(%L, %L)', x, 'editar'), ' or ')
    into cond_edt from unnest(p_recursos) x;

  execute format('create policy %I on public.%I for select to authenticated using (%s)',
                 p_tabela || '_ver', p_tabela, cond_ver);
  execute format('create policy %I on public.%I for insert to authenticated with check ((%s) and (%s))',
                 p_tabela || '_inserir', p_tabela, cond_ver, cond_edt);
  foreach cmd in array array['update','delete']
  loop
    execute format('create policy %I on public.%I for %s to authenticated using ((%s) and (%s))',
                   p_tabela || '_' || cmd, p_tabela, cmd, cond_ver, cond_edt);
  end loop;
  execute format('alter policy %I on public.%I with check ((%s) and (%s))',
                 p_tabela || '_update', p_tabela, cond_ver, cond_edt);
end;
$fn$;

comment on function public.aplicar_camada_multi(text, text[]) is
  'Como aplicar_camada, mas aceita varios recursos (basta ter permissao em UM) e NAO derruba policies do papel anon.';

-- Novo recurso: `alunos` e lida por 16 telas, de Financeiro a Time Comercial. Amarrar a
-- `financeiro` teria tirado a tela do vendedor; por isso ganha recurso proprio.
insert into public.app_recursos (chave, modulo, rotulo, ordem)
values ('alunos', 'Geral', 'Cadastro de alunos', 15)
on conflict (chave) do nothing;

insert into public.role_permissoes (papel, recurso, acao)
select p.papel::public.app_role, 'alunos', a.acao
from (values ('admin'),('gestor')) p(papel)
cross join (values ('ver'),('editar'),('excluir'),('ver_todos')) a(acao)
on conflict do nothing;

insert into public.role_permissoes (papel, recurso, acao)
select 'vendedor'::public.app_role, 'alunos', a.acao
from (values ('ver'),('editar'),('ver_todos')) a(acao)
on conflict do nothing;

-- Investidora e professora: `ver` sem `ver_todos` — e a ausencia de ver_todos que faz a
-- policy cair no escopo de allowed_financeiro_turma_ids.
insert into public.role_permissoes (papel, recurso, acao)
values ('investidor'::public.app_role, 'alunos', 'ver'),
       ('professora'::public.app_role, 'alunos', 'ver')
on conflict do nothing;

do $$
declare r record;
begin
  for r in select policyname from pg_policies
            where schemaname='public' and tablename='alunos' and roles::text not like '%anon%'
  loop
    execute format('drop policy %I on public.alunos', r.policyname);
  end loop;
end $$;

create policy alunos_ver on public.alunos
  for select to authenticated
  using (
    public.tem_permissao('alunos','ver')
    and (public.tem_permissao('alunos','ver_todos')
         or turma_id::text = any (public.turmas_financeiro_permitidas()))
  );

create policy alunos_inserir on public.alunos
  for insert to authenticated
  with check (public.tem_permissao('alunos','ver') and public.tem_permissao('alunos','editar'));

create policy alunos_atualizar on public.alunos
  for update to authenticated
  using (
    public.tem_permissao('alunos','ver') and public.tem_permissao('alunos','editar')
    and (public.tem_permissao('alunos','ver_todos')
         or turma_id::text = any (public.turmas_financeiro_permitidas()))
  )
  with check (public.tem_permissao('alunos','ver') and public.tem_permissao('alunos','editar'));

create policy alunos_apagar on public.alunos
  for delete to authenticated
  using (
    public.tem_permissao('alunos','ver') and public.tem_permissao('alunos','excluir')
    and (public.tem_permissao('alunos','ver_todos')
         or turma_id::text = any (public.turmas_financeiro_permitidas()))
  );

comment on table public.alunos is
  'Recurso `alunos`. Quem nao tem `alunos/ver_todos` so alcanca as turmas de allowed_financeiro_turma_ids. A policy de INSERT anonimo (matricula publica) e preservada de proposito.';

-- Tabelas filhas: mesma janela do aluno, via join.
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname='public'
              and tablename in ('aluno_observacoes','aluno_bonus_eventos')
              and roles::text not like '%anon%'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy aluno_observacoes_ver on public.aluno_observacoes
  for select to authenticated
  using (exists (
    select 1 from public.alunos a
     where a.id = aluno_observacoes.aluno_id
       and public.tem_permissao('alunos','ver')
       and (public.tem_permissao('alunos','ver_todos')
            or a.turma_id::text = any (public.turmas_financeiro_permitidas()))));

create policy aluno_observacoes_escreve on public.aluno_observacoes
  for insert to authenticated
  with check (public.tem_permissao('alunos','ver') and public.tem_permissao('alunos','editar'));

create policy aluno_observacoes_atualiza on public.aluno_observacoes
  for update to authenticated
  using (public.tem_permissao('alunos','ver') and public.tem_permissao('alunos','editar'))
  with check (public.tem_permissao('alunos','ver') and public.tem_permissao('alunos','editar'));

create policy aluno_observacoes_apaga on public.aluno_observacoes
  for delete to authenticated
  using (public.tem_permissao('alunos','ver') and public.tem_permissao('alunos','editar'));

create policy aluno_bonus_eventos_ver on public.aluno_bonus_eventos
  for select to authenticated
  using (exists (
    select 1 from public.alunos a
     where a.id = aluno_bonus_eventos.aluno_id
       and public.tem_permissao('alunos','ver')
       and (public.tem_permissao('alunos','ver_todos')
            or a.turma_id::text = any (public.turmas_financeiro_permitidas()))));

create policy aluno_bonus_eventos_escreve on public.aluno_bonus_eventos
  for insert to authenticated
  with check (public.tem_permissao('alunos','ver') and public.tem_permissao('alunos','editar'));

create policy aluno_bonus_eventos_atualiza on public.aluno_bonus_eventos
  for update to authenticated
  using (public.tem_permissao('alunos','ver') and public.tem_permissao('alunos','editar'))
  with check (public.tem_permissao('alunos','ver') and public.tem_permissao('alunos','editar'));

create policy aluno_bonus_eventos_apaga on public.aluno_bonus_eventos
  for delete to authenticated
  using (public.tem_permissao('alunos','ver') and public.tem_permissao('alunos','editar'));

select public.aplicar_camada_multi('lancamento_leads',      array['lancamentos']);
select public.aplicar_camada_multi('lancamento_campanhas',  array['lancamentos']);
select public.aplicar_camada_multi('boas_vindas_agendados', array['lancamentos']);
select public.aplicar_camada_multi('grupo_add_jobs',        array['lancamentos']);

select public.aplicar_camada_multi('npa_evento_leads', array['npa']);

select public.aplicar_camada_multi('disparo_campanhas',          array['disparos_monitor']);
select public.aplicar_camada_multi('disparo_leads',              array['disparos_monitor']);
select public.aplicar_camada_multi('quick_sends',                array['disparos_monitor']);
select public.aplicar_camada_multi('whatsapp_opt_out',           array['disparos_monitor']);
select public.aplicar_camada_multi('lead_aquecimento_campanhas', array['disparos_monitor']);
select public.aplicar_camada_multi('lead_aquecimento_config',    array['disparos_monitor']);
select public.aplicar_camada_multi('lead_aquecimento_fases',     array['disparos_monitor']);
select public.aplicar_camada_multi('lead_aquecimento_leads',     array['disparos_monitor']);

-- O ChatTimeComercial LE, INSERE e APAGA nesta tabela (vendedor -> instancia da Evolution).
select public.aplicar_camada_multi('lead_aquecimento_vendedores',
                                   array['disparos_monitor','time_comercial']);

-- Historico de WhatsApp: alimenta o Chat da Cobranca E o do Time Comercial.
select public.aplicar_camada_multi('whatsapp_mensagens',
                                   array['time_comercial','chat_conversas','disparos_monitor']);

select public.aplicar_camada_multi('funnel_configs',        array['lancamentos','npa','funil_lancamento']);
select public.aplicar_camada_multi('funnel_messages',       array['lancamentos','npa','funil_lancamento']);
select public.aplicar_camada_multi('funnel_poll_respostas', array['lancamentos','npa','funil_lancamento']);

select public.aplicar_camada_multi('parceiros_links',      array['parceiros']);
select public.aplicar_camada_multi('seu_numerologo_leads', array['produtos']);
