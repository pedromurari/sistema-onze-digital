-- Captura de respostas de enquetes do funil (Semana do Despertar e afins).
-- A Evolution API tem bug conhecido na decodificação do voto (chega
-- criptografado, ver github.com/EvolutionAPI/evolution-api/issues/1644) --
-- por isso essa tabela guarda o payload bruto + metadados que já dão pra
-- usar (quem votou, quando, em qual enquete/funil) mesmo antes de decodificar
-- a opção escolhida. A decodificação da opção fica pra uma fase seguinte,
-- depois de inspecionar um payload real de produção.
create table if not exists funnel_poll_respostas (
  id uuid primary key default gen_random_uuid(),
  funnel_message_id uuid references funnel_messages(id) on delete set null,
  funnel_name text,
  group_jid text not null,
  poll_creation_message_id text,
  poll_name text,
  voter_jid text,
  voter_phone text,
  evolution_instance text,
  event_type text not null,
  selected_options_hash jsonb,
  selected_option_text text,
  raw_payload jsonb not null,
  received_at timestamptz not null default now()
);

create index if not exists funnel_poll_respostas_funnel_message_id_idx
  on funnel_poll_respostas (funnel_message_id);
create index if not exists funnel_poll_respostas_group_jid_idx
  on funnel_poll_respostas (group_jid);
create index if not exists funnel_poll_respostas_voter_phone_idx
  on funnel_poll_respostas (voter_phone);

alter table funnel_poll_respostas enable row level security;

create policy "Autenticados podem ler e escrever funnel_poll_respostas"
  on funnel_poll_respostas
  for all
  to authenticated
  using (true)
  with check (true);
