-- Webhook e polling podem confirmar a mesma transação do Mercado Pago ao mesmo tempo.
-- A regra de negócio é 1 transação MP = 1 linha financeira; a constraint torna essa
-- idempotência atômica no banco, em vez de depender de dois SELECTs concorrentes.
--
-- Pré-requisito de aplicação: confirmar que a consulta abaixo não retorna linhas:
--   select mp_payment_id, count(*) from pagamentos where mp_payment_id is not null
--   group by mp_payment_id having count(*) > 1;
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.pagamentos'::regclass
       and conname = 'pagamentos_mp_payment_id_unique'
  ) then
    alter table public.pagamentos
      add constraint pagamentos_mp_payment_id_unique unique (mp_payment_id);
  end if;
end $$;
