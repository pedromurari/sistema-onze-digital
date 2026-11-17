-- Recebimento dos eventos de Webhook da Voomp (Assinatura paga/nao paga/etc,
-- configurado por produto na Voomp -- ver supabase/functions/voomp-webhook).
-- So grava o payload cru + o resultado do processamento automatico; nao
-- substitui `pagamentos`, so apoia a auditoria/depuracao de cada evento.

create table if not exists public.voomp_webhook_logs (
  id uuid primary key default gen_random_uuid(),
  recebido_em timestamptz not null default now(),
  query_params jsonb,
  headers jsonb,
  payload jsonb,
  processado boolean not null default false,
  resultado text
);

alter table public.voomp_webhook_logs enable row level security;

create policy "voomp_webhook_logs_select_financeiro"
  on public.voomp_webhook_logs
  for select to authenticated
  using (tem_permissao('financeiro', 'ver'));

grant select on public.voomp_webhook_logs to authenticated;
