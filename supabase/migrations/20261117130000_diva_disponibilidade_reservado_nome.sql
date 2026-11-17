alter table public.diva_disponibilidade_dias
  add column reservado_nome text;

comment on column public.diva_disponibilidade_dias.reservado_nome is
  'Nome do cliente quando o horario esta ocupado por um compromisso que a terapeuta ja tem (agenda dela), mas que ainda nao virou uma venda registrada no sistema (sessao_id null). Quando a venda sair e for vinculada, sessao_id passa a ser a fonte de verdade do nome.';
