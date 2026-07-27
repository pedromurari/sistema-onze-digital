-- Tabela de configuração de instâncias WhatsApp por tarefa
-- Usada pelo EvolutionTaskPanel (frontend) e pelas edge functions de cobrança/funil

create table if not exists evolution_task_config (
  task         text        primary key
    constraint evolution_task_config_task_check
    check (task = any (array['cobranca'::text, 'funil'::text, 'disparo'::text, 'boas_vindas'::text])),
  instance_ids text[]      not null default '{}',
  updated_at   timestamptz not null default now()
);

-- RLS
alter table evolution_task_config enable row level security;

create policy "Autenticados podem ler e escrever evolution_task_config"
  on evolution_task_config
  for all
  to authenticated
  using (true)
  with check (true);
