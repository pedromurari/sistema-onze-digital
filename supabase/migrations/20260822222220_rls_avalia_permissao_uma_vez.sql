-- As policies chamavam `tem_permissao()` UMA VEZ POR LINHA.
--
-- ── A MEDICAO ───────────────────────────────────────────────────────────────
-- `select count(*)` como admin, com a RLS ligada:
--     leads      (11.778 linhas)  785 ms
--     pagamentos ( 2.507 linhas)  218 ms
--     alunos     (   198 linhas)   24 ms
-- Escala linear com o numero de linhas — ~67 microssegundos por linha. Nao e a consulta
-- que e lenta: e a permissao sendo recalculada para cada registro.
--
-- ── POR QUE ACONTECE ────────────────────────────────────────────────────────
-- Uma policy escrita como `using (tem_permissao('financeiro','ver'))` e tratada pelo
-- planejador como expressao que depende da linha, entao ele executa por linha. Envolver em
-- `(select ...)` transforma num InitPlan: roda uma vez e o resultado e reaproveitado.
-- A resposta e identica; muda so quantas vezes a funcao e chamada.
--
-- O gerador de camadas produzia a forma lenta, entao TODAS as policies que ele criou
-- herdaram o problema. Consertar o gerador e reaplicar corrige em bloco, sem reescrever
-- policy na mao — que seria manipulacao de texto em cima de regra de seguranca viva.

create or replace function public.aplicar_camada_multi(p_tabela text, p_recursos text[])
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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

  -- `(select ...)` em vez da chamada direta: vira InitPlan e roda UMA vez por consulta,
  -- em vez de uma vez por linha. Ver a medicao no cabecalho desta migration.
  select string_agg(format('(select public.tem_permissao(%L, %L))', x, 'ver'),    ' or ')
    into cond_ver from unnest(p_recursos) x;
  select string_agg(format('(select public.tem_permissao(%L, %L))', x, 'editar'), ' or ')
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
$function$;

comment on function public.aplicar_camada_multi(text, text[]) is
  'Aplica a camada de permissao numa tabela. As condicoes saem envolvidas em (select ...) de proposito: sem isso o planejador chama tem_permissao() uma vez POR LINHA — media de 785 ms num count em leads.';

revoke execute on function public.aplicar_camada_multi(text, text[]) from public, anon, authenticated;
