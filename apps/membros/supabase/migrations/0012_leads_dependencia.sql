create table if not exists leads_dependencia (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  whatsapp text not null,
  email_enviado boolean not null default false,
  wpp_enviado boolean not null default false,
  comprou boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text
);
