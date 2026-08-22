-- Corrige `gerar_mensalidades_aluno`: aluno sem dia de vencimento nao gerava parcela.
--
-- Bug encontrado ao subir o banco local pela primeira vez. A funcao fazia:
--   data_venc := (...)::DATE + (NEW.dia_vencimento - 1);
-- Com `dia_vencimento` NULL, `data_venc` vira NULL, `mes_referencia` vira NULL, e o
-- NOT NULL de `pagamentos` derruba o INSERT INTEIRO do aluno.
--
-- Nao e teorico: em producao ha 2 alunos sem `dia_vencimento`, e 1 deles esta SEM NENHUMA
-- PARCELA — matriculado e fora da cobranca, sem aparecer na inadimplencia.
--
-- Agora cai em cascata: dia do aluno -> dia da turma -> 10. Melhor gerar a parcela num dia
-- padrao e alguem corrigir depois do que nao gerar parcela nenhuma e ninguem perceber.

create or replace function public.gerar_mensalidades_aluno()
returns trigger
language plpgsql
set search_path to 'public', 'extensions', 'net', 'cron', 'pg_temp'
as $function$
declare
  i          integer;
  data_venc  date;
  total_parc integer;
  valor_mens numeric;
  data_base  date;
  dia_venc   integer;
  dia_turma  integer;
begin
  select total_mensalidades, valor_mensalidade, dia_vencimento
    into total_parc, valor_mens, dia_turma
    from public.turmas where id = new.turma_id;

  if total_parc is null then total_parc := 14; end if;
  if valor_mens is null then valor_mens := 109.90; end if;

  -- Cascata do dia de vencimento. Sem isto, aluno sem dia nao gerava parcela nenhuma.
  dia_venc := coalesce(new.dia_vencimento, dia_turma, 10);
  -- Trava contra dado invalido vindo de importacao (dia 0, 45, negativo).
  dia_venc := least(greatest(dia_venc, 1), 28);

  data_base := coalesce(new.data_inicio, current_date);

  for i in 1..total_parc loop
    data_venc := (date_trunc('month', data_base) + ((i - 1) * interval '1 month'))::date
                 + (dia_venc - 1);

    -- Evita estourar o mes (ex: dia 31 em fevereiro).
    data_venc := least(
      data_venc,
      (date_trunc('month', data_venc) + interval '1 month' - interval '1 day')::date
    );

    insert into public.pagamentos (
      aluno_id, turma_id, produto,
      valor, mes_referencia, data_vencimento,
      numero_parcela, status
    ) values (
      new.id, new.turma_id, new.produto,
      valor_mens,
      date_trunc('month', data_venc)::date,
      data_venc,
      i,
      'pendente'
    );
  end loop;

  return new;
end;
$function$;

comment on function public.gerar_mensalidades_aluno() is
  'Gera as parcelas ao matricular. Dia de vencimento cai em cascata: aluno -> turma -> 10, e e limitado a 1..28. Antes, aluno sem dia nao gerava parcela e o INSERT falhava inteiro.';
