-- Tutorias futuras começam às 20h (Brasília) e duram no mínimo 1h30.
-- Não altera registros históricos de presença ou horários de aulas passadas.
begin;

update public.aulas
set horario_inicio = time '20:00',
    horario_fim = greatest(coalesce(horario_fim, time '21:30'), time '21:30')
where data >= (now() at time zone 'America/Sao_Paulo')::date
  and modulo is not null
  and btrim(modulo) ~* '^tutoria'
  and (horario_inicio is distinct from time '20:00' or horario_fim is null or horario_fim < time '21:30');

create or replace function public.normalizar_horario_tutoria()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.modulo is not null and btrim(new.modulo) ~* '^tutoria' then
    new.horario_inicio := time '20:00';
    if new.horario_fim is null or new.horario_fim < time '21:30' then
      new.horario_fim := time '21:30';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists aulas_horario_tutoria on public.aulas;
create trigger aulas_horario_tutoria
before insert or update of modulo, data, horario_inicio, horario_fim on public.aulas
for each row execute function public.normalizar_horario_tutoria();

commit;
