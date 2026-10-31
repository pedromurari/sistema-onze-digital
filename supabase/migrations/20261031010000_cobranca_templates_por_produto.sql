-- Separar cobrança automática/lembretes por produto (pedido do Pedro,
-- 31/10/2026). Hoje os templates (cobranca_templates) e a elegibilidade
-- (get_alunos_para_cobranca) são globais -- isso trava qualquer tentativa
-- de ter regras diferentes pra Sociedade IDM, NPS, etc. Mudança
-- retrocompatível: produto NULL = aplica pra todo mundo (igual hoje),
-- produto preenchido = só pra esse produto, com prioridade sobre o global.

alter table public.cobranca_templates add column if not exists produto text;
comment on column public.cobranca_templates.produto is 'NULL = vale pra todos os produtos (comportamento padrão/legado). Preenchido = só pra esse produto (alunos.produto), tem prioridade sobre o template global do mesmo tipo/offset.';

-- RPC ganha a coluna produto (de alunos.produto), pra enviar-cobranca poder
-- escolher o template certo por produto.
drop function if exists public.get_alunos_para_cobranca(date);

create function public.get_alunos_para_cobranca(p_data date default current_date)
returns table(
  aluno_id uuid, aluno_nome text, telefone text, pagamento_id uuid, valor numeric,
  parcela integer, data_vencimento date, dias_offset integer, link_pagamento text,
  pagamento_status text, data_prevista_pagamento date, cobranca_ia_ativa boolean,
  cobranca_ativa boolean, produto text
)
language sql
stable
set search_path to 'public', 'extensions', 'net', 'cron', 'pg_temp'
as $function$
  select
    a.id            as aluno_id,
    a.nome          as aluno_nome,
    coalesce(a.cobranca_telefone, a.whatsapp) as telefone,
    p.id            as pagamento_id,
    p.valor,
    p.numero_parcela as parcela,
    p.data_vencimento,
    (p_data - p.data_vencimento)::integer as dias_offset,
    coalesce(p.link_pagamento_asaas, p.link_pagamento_mp, a.asaas_link, a.voomp_link, '') as link_pagamento,
    p.status        as pagamento_status,
    p.data_prevista_pagamento,
    a.cobranca_ia_ativa,
    a.cobranca_ativa,
    a.produto
  from public.pagamentos p
  join public.alunos     a   on a.id = p.aluno_id
  join public.cobranca_turmas_ativas cta on cta.turma_id = a.turma_id
  where
    a.status not in ('cancelado', 'concluido')
    and a.forma_pagamento = 'boleto'
    and (
      p.status = 'atrasado'
      or (p.status = 'pendente' and date_trunc('month', p.data_vencimento) = date_trunc('month', p_data))
      or (p.status = 'pendente' and p.data_vencimento < p_data)
    )
    and coalesce(a.cobranca_telefone, a.whatsapp) is not null
    and coalesce(a.cobranca_telefone, a.whatsapp) <> ''
  order by a.nome, p.data_vencimento;
$function$;

grant execute on function public.get_alunos_para_cobranca(date) to authenticated, service_role;
