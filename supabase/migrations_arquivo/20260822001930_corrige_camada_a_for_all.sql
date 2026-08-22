-- Sprint 1.3c — Corrige a camada A: `FOR ALL` estava reabrindo a leitura.
--
-- Erro da migration anterior: a policy de escrita foi criada como `FOR ALL`, e no Postgres
-- `FOR ALL` tambem cobre SELECT. Como o padrao do papel vendedor tem `editar` em financeiro
-- (herdado do modelo antigo, onde nao existia distincao entre ver e editar), a policy de
-- escrita reabriu a leitura: a vendedora Helen, com `financeiro/ver` NEGADO, continuava
-- lendo os 2.462 pagamentos pela API.
--
-- Duas correcoes:
--   1. Escrita deixa de ser `FOR ALL` e passa a ser INSERT/UPDATE/DELETE explicitos, pra
--      que o SELECT seja governado exclusivamente pela policy de leitura.
--   2. Escrever passa a exigir `ver` E `editar`. Poder editar o que nao se pode ver nao
--      faz sentido, e sem isso qualquer override que negue `ver` seria contornavel —
--      os overrides migrados da tela antiga so cobrem `ver`, porque `editar` nem existia.

create or replace function public.aplicar_camada(
  p_tabela  text,
  p_recurso text
)
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
    create policy %I on public.%I
      for select to authenticated
      using (public.tem_permissao(%L, 'ver'))
  $f$, p_tabela || '_ver', p_tabela, p_recurso);

  -- INSERT so aceita WITH CHECK; UPDATE e DELETE usam USING. Nada de FOR ALL aqui.
  execute format($f$
    create policy %I on public.%I
      for insert to authenticated
      with check (public.tem_permissao(%L, 'ver') and public.tem_permissao(%L, 'editar'))
  $f$, p_tabela || '_inserir', p_tabela, p_recurso, p_recurso);

  foreach cmd in array array['update','delete']
  loop
    execute format($f$
      create policy %I on public.%I
        for %s to authenticated
        using (public.tem_permissao(%L, 'ver') and public.tem_permissao(%L, 'editar'))
    $f$, p_tabela || '_' || cmd, p_tabela, cmd, p_recurso, p_recurso);
  end loop;

  -- UPDATE tambem precisa de WITH CHECK, senao a linha pode ser gravada num estado
  -- que o proprio usuario nao poderia enxergar depois.
  execute format($f$
    alter policy %I on public.%I
      with check (public.tem_permissao(%L, 'ver') and public.tem_permissao(%L, 'editar'))
  $f$, p_tabela || '_update', p_tabela, p_recurso, p_recurso);
end;
$fn$;

comment on function public.aplicar_camada(text, text) is
  'Troca todas as policies de uma tabela por: SELECT amarrado a `ver`, e INSERT/UPDATE/DELETE amarrados a `ver` + `editar`. Nunca usar FOR ALL aqui — FOR ALL cobre SELECT e reabre a leitura.';

-- Reaplica em todas as tabelas da camada A.
select public.aplicar_camada('pagamentos',            'financeiro');
select public.aplicar_camada('fechamentos',           'financeiro');
select public.aplicar_camada('balanco_config',        'balanco');
select public.aplicar_camada('balanco_itens',         'balanco');
select public.aplicar_camada('cobranca_config',       'cobranca');
select public.aplicar_camada('cobranca_templates',    'cobranca');
select public.aplicar_camada('cobranca_logs',         'cobranca');
select public.aplicar_camada('cobranca_ia_conversas', 'cobranca');
select public.aplicar_camada('cobranca_ia_mensagens', 'cobranca');
select public.aplicar_camada('cobranca_turmas_ativas','cobranca');
select public.aplicar_camada('canais_cobranca',       'cobranca');
select public.aplicar_camada('email_config',          'settings');
