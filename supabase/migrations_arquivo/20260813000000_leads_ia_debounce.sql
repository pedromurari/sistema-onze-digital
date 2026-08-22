-- Buffer de debounce para mensagens rápidas em sequência do mesmo lead.
-- Evita que 2 mensagens mandadas em poucos segundos (ex.: lead manda "Din"
-- e "Sim" 3s depois) disparem leads-ia-responder duas vezes em paralelo,
-- gerando respostas sobrepostas/perdidas no WhatsApp.
create table if not exists leads_ia_debounce (
  telefone text primary key,
  lead_id uuid not null,
  evolution_instance text not null,
  mensagens jsonb not null default '[]'::jsonb,
  marcador text not null,
  atualizado_em timestamptz not null default now()
);
