-- Campanha Divã IDM (09/11/2026) pro público frio: leads da Turma #44 da
-- Semana do Despertar (curso gratuito) que participaram de verdade
-- (entraram no grupo) e nunca viraram aluno pagante. Copy diferente da
-- campanha de Psicanálise (essa não tem o gancho do "tripé da formação",
-- vende transformação/próximo passo). Mesma fila-própria + cron 30min em
-- horário comercial, mesmo número "Divã IDM".
create table public.diva_campanha_despertar_leads (
  id uuid primary key default gen_random_uuid(),
  lancamento_lead_id uuid not null references public.lancamento_leads(id),
  nome text not null,
  whatsapp text not null,
  enviado_em timestamptz,
  created_at timestamptz not null default now()
);

create unique index diva_campanha_despertar_leads_lead_idx on public.diva_campanha_despertar_leads(lancamento_lead_id);

insert into public.diva_campanha_despertar_leads (lancamento_lead_id, nome, whatsapp)
select ll.id, ll.nome, ll.whatsapp
from public.lancamento_leads ll
where ll.lancamento_id = '9ab03336-fc8c-47bc-9466-411df7d610b9' -- Turma #44
and ll.no_grupo
and ll.whatsapp is not null and ll.whatsapp <> ''
and not exists (
  select 1 from public.alunos a
  join public.pessoas p on p.id = a.pessoa_id
  where regexp_replace(p.telefone,'\D','','g') = regexp_replace(ll.whatsapp,'\D','','g')
);

alter table public.diva_campanha_despertar_leads enable row level security;

create policy diva_campanha_despertar_leads_ver on public.diva_campanha_despertar_leads
  for select to authenticated using (tem_permissao('diva', 'ver'));
create policy diva_campanha_despertar_leads_editar on public.diva_campanha_despertar_leads
  for all to authenticated using (tem_permissao('diva', 'editar')) with check (tem_permissao('diva', 'editar'));

grant select, insert, update, delete on public.diva_campanha_despertar_leads to authenticated;
