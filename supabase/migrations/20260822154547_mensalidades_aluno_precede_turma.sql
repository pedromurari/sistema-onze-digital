-- Gera as parcelas que faltavam, e corrige duas regras erradas na geracao.
--
-- PROBLEMA 1: valor e numero de parcelas do ALUNO eram ignorados — a funcao lia so da
-- TURMA, enquanto `financial-utils.ts` calcula MRR como `aluno.valor ?? turma.valor`.
-- As duas regras discordavam. Aluno SEM turma caia no padrao fixo (14x 109,90) mesmo
-- tendo os proprios valores preenchidos.
--
-- PROBLEMA 2: data base usava `data_inicio` ou HOJE, ignorando data de matricula e o
-- inicio da turma.
--
-- A logica sai do gatilho e vira funcao: precisamos gerar parcelas para alunos que JA
-- existem, e duplicar a regra num backfill garantiria divergencia futura.

create or replace function public.gerar_mensalidades_para(p_aluno_id uuid)
returns integer
language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $fn$
declare
  a record; t record;
  i integer; data_venc date;
  total_parc integer; valor_mens numeric; dia_venc integer; data_base date;
  criadas integer := 0;
begin
  select * into a from public.alunos where id = p_aluno_id;
  if not found then raise exception 'aluno % nao existe', p_aluno_id; end if;

  select * into t from public.turmas where id = a.turma_id;

  -- Precedencia aluno -> turma -> padrao, igual ao que financial-utils.ts ja fazia.
  total_parc := coalesce(a.total_mensalidades, t.total_mensalidades, 14);
  valor_mens := coalesce(a.valor_mensalidade,  t.valor_mensalidade,  109.90);
  dia_venc   := coalesce(a.dia_vencimento,     t.dia_vencimento,     10);
  dia_venc   := least(greatest(dia_venc, 1), 28);

  data_base  := coalesce(a.data_inicio, a.data_matricula, t.data_inicio, a.created_at::date, current_date);

  for i in 1..total_parc loop
    data_venc := (date_trunc('month', data_base) + ((i - 1) * interval '1 month'))::date
                 + (dia_venc - 1);
    data_venc := least(
      data_venc,
      (date_trunc('month', data_venc) + interval '1 month' - interval '1 day')::date
    );

    insert into public.pagamentos (
      aluno_id, turma_id, produto, valor, mes_referencia,
      data_vencimento, numero_parcela, status
    ) values (
      a.id, a.turma_id, a.produto, valor_mens,
      date_trunc('month', data_venc)::date, data_venc, i, 'pendente'
    );
    criadas := criadas + 1;
  end loop;

  return criadas;
end;
$fn$;

comment on function public.gerar_mensalidades_para(uuid) is
  'Gera as parcelas de um aluno. Valor/parcelas/dia caem em cascata: aluno -> turma -> padrao. Usada pelo gatilho de matricula e por backfill — uma regra so.';

create or replace function public.gerar_mensalidades_aluno()
returns trigger
language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $fn$
begin
  perform public.gerar_mensalidades_para(new.id);
  return new;
end;
$fn$;

comment on function public.gerar_mensalidades_aluno() is
  'AFTER INSERT em alunos: delega para gerar_mensalidades_para(). A regra vive num lugar so.';

-- Backfill dos alunos matriculados que ficaram sem nenhuma parcela.
-- A cobranca automatica global esta DESLIGADA agora, entao gerar parcelas vencidas nao
-- dispara mensagem. As vencidas precisam de conferencia antes de religar a cobranca.
do $$
declare r record; criadas integer; total integer := 0;
begin
  for r in
    select a.id, a.nome from public.alunos a
     where a.status not in ('cancelado', 'concluido')
       and not exists (select 1 from public.pagamentos p where p.aluno_id = a.id)
     order by a.nome
  loop
    criadas := public.gerar_mensalidades_para(r.id);
    total := total + criadas;
    raise notice 'aluno % -> % parcelas', r.nome, criadas;
  end loop;
  raise notice 'backfill concluido: % parcelas criadas', total;
end $$;
