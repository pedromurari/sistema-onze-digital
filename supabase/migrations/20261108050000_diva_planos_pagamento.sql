-- Pedido do Pedro (08/11/2026): link de pagamento PADRÃO (sem split
-- automático ainda -- isso é Fase 7, precisa da conversa com o gerente de
-- conta Asaas primeiro) pra cada plano do Divã, pronto pra vendedora
-- (Camila) copiar e mandar pro cliente. PIX/boleto via Asaas, cartão via
-- Mercado Pago -- mesma separação já usada no resto do CRM (ver AGENTS.md).
-- O dinheiro cai direto na conta principal do IDM; o repasse ao terapeuta
-- continua manual (marcar "repassado" na aba Sessões), igual já funciona.
create table public.diva_planos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  quantidade_sessoes integer not null,
  valor numeric not null,
  link_pix_boleto text,
  link_cartao text,
  asaas_link_id text,
  mp_preference_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.diva_planos (nome, quantidade_sessoes, valor) values
  ('1 sessão avulsa', 1, 80),
  ('2 sessões avulsas', 2, 160),
  ('Pacote 3 sessões', 3, 210),
  ('Pacote 4 sessões', 4, 280),
  ('Pacote 5 sessões', 5, 350);

alter table public.diva_planos enable row level security;

create policy diva_planos_ver on public.diva_planos
  for select to authenticated using (tem_permissao('diva', 'ver'));
create policy diva_planos_editar on public.diva_planos
  for all to authenticated using (tem_permissao('diva', 'editar')) with check (tem_permissao('diva', 'editar'));

grant select, insert, update, delete on public.diva_planos to authenticated;
