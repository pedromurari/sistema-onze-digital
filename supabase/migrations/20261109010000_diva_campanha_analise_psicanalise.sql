-- Campanha Divã IDM (09/11/2026): pergunta aos alunos ativos e EM DIA de
-- Psicanálise se já começaram a própria análise (parte do tripé da
-- formação) e oferece o Divã como caminho social pra isso. Pedido do
-- Pedro: 1 envio a cada 30min, em horário comercial, pelo número
-- dedicado "Divã IDM". Fila própria (não reaproveita diva_terapeutas,
-- são pessoas diferentes) pra poder rodar de novo sem duplicar envio.

create table public.diva_campanha_analise_leads (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.pessoas(id),
  aluno_id uuid not null references public.alunos(id),
  nome text not null,
  whatsapp text not null,
  enviado_em timestamptz,
  created_at timestamptz not null default now()
);

create unique index diva_campanha_analise_leads_pessoa_idx on public.diva_campanha_analise_leads(pessoa_id);

insert into public.diva_campanha_analise_leads (pessoa_id, aluno_id, nome, whatsapp)
select distinct on (a.pessoa_id) a.pessoa_id, a.id, p.nome, p.telefone
from public.alunos a
join public.pessoas p on p.id = a.pessoa_id
where a.status = 'ativo' and a.produto = 'psicanalise'
and not exists (
  select 1 from public.pagamentos pg
  where pg.aluno_id = a.id and pg.status <> 'pago' and pg.data_vencimento < current_date
)
and p.telefone is not null;

alter table public.diva_campanha_analise_leads enable row level security;

create policy diva_campanha_analise_leads_ver on public.diva_campanha_analise_leads
  for select to authenticated using (tem_permissao('diva', 'ver'));
create policy diva_campanha_analise_leads_editar on public.diva_campanha_analise_leads
  for all to authenticated using (tem_permissao('diva', 'editar')) with check (tem_permissao('diva', 'editar'));

grant select, insert, update, delete on public.diva_campanha_analise_leads to authenticated;
