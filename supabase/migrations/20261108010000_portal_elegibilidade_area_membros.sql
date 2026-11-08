-- Fase 1 do plano "Unificar sistema + Área de Membros real": schema de
-- ligação entre o CRM (alunos reais) e a área de membros (apps/membros,
-- Supabase próprio). RPC security definer no mesmo padrão de
-- portal_aluno_por_token/portal_contrato_por_token, mas: (a) chave é
-- pessoa_id (uma pessoa pode ter mais de uma matrícula), não um token
-- secreto -- por isso o grant fica só pra service_role (chamado pelo
-- cliente sistema11.ts do outro app, nunca do navegador/anon); (b)
-- superfície bem mais restrita que portal_contrato_por_token (sem CPF,
-- endereço etc.), é só o necessário pra decidir elegibilidade de conteúdo.

create or replace function public.portal_elegibilidade_por_pessoa(p_pessoa_id uuid)
returns table(
  aluno_id uuid,
  produto text,
  turma_id uuid,
  turma_nome text,
  status text,
  data_matricula date
)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    a.id, a.produto, a.turma_id, t.nome, a.status, a.data_matricula
  from public.alunos a
  left join public.turmas t on t.id = a.turma_id
  where a.pessoa_id = p_pessoa_id;
$$;

comment on function public.portal_elegibilidade_por_pessoa(uuid) is
  'Elegibilidade de conteudo na area de membros (apps/membros), por pessoa -- chamado server-side via service_role (sistema11.ts), nunca anon/authenticated direto.';

revoke all on function public.portal_elegibilidade_por_pessoa(uuid) from public;
grant execute on function public.portal_elegibilidade_por_pessoa(uuid) to service_role;

-- Rastreio de provisionamento de acesso (Fase 2 do plano: cron que chama
-- membros-provisionar-acesso quando alunos.status vira 'ativo').
alter table public.alunos add column if not exists acesso_membros_url text;
alter table public.alunos add column if not exists acesso_membros_liberado_em timestamptz;
