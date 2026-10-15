-- RH: historico de pagamentos por profissional -- comprovante + nota fiscal
-- anexados por lancamento, filtro por mes, descricao livre referenciando
-- turma/aula. Pedido do Pedro 15/10/2026 (ex: pagamentos da Ellen/Vinicius).
begin;

create table public.profissionais_pagamentos (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references public.profissionais(id) on delete cascade,
  data_pagamento date not null,
  valor numeric(12,2) not null check (valor >= 0),
  descricao text,
  turma_id uuid references public.turmas(id) on delete set null,
  aula_id uuid references public.aulas(id) on delete set null,
  comprovante_arquivo_url text,
  comprovante_arquivo_nome text,
  nota_fiscal_arquivo_url text,
  nota_fiscal_arquivo_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profissionais_pagamentos_profissional_idx
  on public.profissionais_pagamentos (profissional_id, data_pagamento desc);

alter table public.profissionais_pagamentos enable row level security;
revoke all on public.profissionais_pagamentos from public, anon;
grant select, insert, update, delete on public.profissionais_pagamentos to authenticated;

create policy profissionais_pagamentos_ver on public.profissionais_pagamentos
  for select using (( select public.tem_permissao('rh'::text, 'ver'::text) ));
create policy profissionais_pagamentos_inserir on public.profissionais_pagamentos
  for insert with check (( select public.tem_permissao('rh'::text, 'editar'::text) ));
create policy profissionais_pagamentos_atualizar on public.profissionais_pagamentos
  for update using (( select public.tem_permissao('rh'::text, 'editar'::text) ))
             with check (( select public.tem_permissao('rh'::text, 'editar'::text) ));
create policy profissionais_pagamentos_excluir on public.profissionais_pagamentos
  for delete using (( select public.tem_permissao('rh'::text, 'excluir'::text) ));

create trigger profissionais_pagamentos_set_updated_at before update on public.profissionais_pagamentos
  for each row execute function public.set_updated_at();

commit;
