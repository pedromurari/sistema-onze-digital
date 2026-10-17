-- Corrige a regra anterior: tutoria começa às 20h, mas não exige 1h30.
-- Ajusta somente horários futuros que ficaram exatamente em 21h30 pela regra anterior.
begin;

create or replace function public.normalizar_horario_tutoria()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.modulo is not null and btrim(new.modulo) ~* '^tutoria' then
    new.horario_inicio := time '20:00';
    if new.horario_fim is null or new.horario_fim <= time '20:00' then
      new.horario_fim := time '21:00';
    end if;
  end if;
  return new;
end;
$$;

update public.aulas
set horario_fim = time '21:00'
where data >= (now() at time zone 'America/Sao_Paulo')::date
  and modulo is not null
  and btrim(modulo) ~* '^tutoria'
  and horario_inicio = time '20:00'
  and horario_fim = time '21:30';

commit;
