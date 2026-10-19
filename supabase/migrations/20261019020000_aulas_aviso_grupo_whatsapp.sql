-- Aviso no grupo de WhatsApp da turma antes da aula (pedido do Pedro 19/10/2026).
-- Envio fica desligado (aviso_meet_config.ativo = false) até o Pedro aprovar o modelo.

alter table public.turmas add column if not exists grupo_whatsapp_jid text;

alter table public.aulas
  add column if not exists aviso_status text check (aviso_status in ('enviado', 'falhou')),
  add column if not exists aviso_enviado_em timestamptz,
  add column if not exists aviso_erro text,
  add column if not exists aviso_tentativas int not null default 0;

create table public.aviso_meet_config (
  id int primary key default 1 check (id = 1),
  ativo boolean not null default false,
  instance_name text,
  antecedencia_minutos int not null default 20 check (antecedencia_minutos between 5 and 60),
  mensagem_modelo text not null default 'Olá, pessoal da {{turma}}! 👋

Hoje temos aula: {{modulo}}, às {{hora}} (horário de Brasília).

Entrem pelo Google Meet:
{{link_meet}}

Até já!'
);

insert into public.aviso_meet_config (id) values (1);

alter table public.aviso_meet_config enable row level security;
revoke all on public.aviso_meet_config from public, anon;
grant select, update on public.aviso_meet_config to authenticated;

create policy aviso_meet_config_ver on public.aviso_meet_config
  for select using (( select public.tem_permissao('rh'::text, 'ver'::text) ));
create policy aviso_meet_config_editar on public.aviso_meet_config
  for update using (( select public.tem_permissao('rh'::text, 'editar'::text) ))
             with check (( select public.tem_permissao('rh'::text, 'editar'::text) ));

create table public.cron_segredos_internos (
  nome text primary key,
  valor text not null
);
alter table public.cron_segredos_internos enable row level security;
revoke all on public.cron_segredos_internos from public, anon, authenticated;

insert into public.cron_segredos_internos (nome, valor) values ('aviso_meet', encode(gen_random_bytes(24), 'hex'));

create or replace function public.get_aviso_meet_cron_secret()
returns text
language sql
security definer
set search_path = public
as $$
  select valor from public.cron_segredos_internos where nome = 'aviso_meet';
$$;
revoke all on function public.get_aviso_meet_cron_secret() from public, anon, authenticated;

select cron.unschedule('aulas-aviso-meet') where exists (select 1 from cron.job where jobname = 'aulas-aviso-meet');
select cron.schedule('aulas-aviso-meet', '* * * * *', $$
  select net.http_post(
    url := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/aulas-aviso-meet',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', public.get_aviso_meet_cron_secret()),
    timeout_milliseconds := 55000
  );
$$);
