
alter table public.campanhas_massa drop constraint campanhas_massa_fonte_check;
alter table public.campanhas_massa add constraint campanhas_massa_fonte_check check (fonte in ('lancamento_turma','leads_produto','base_completa','alunos'));
