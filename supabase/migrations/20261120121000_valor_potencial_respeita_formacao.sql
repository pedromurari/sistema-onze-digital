-- O trigger forçava valor_potencial = 109,90 (mensalidade da Psicanálise) em
-- todo lead que não fosse NPA/Direto. Lead de formação de preço único (ex:
-- Despertar Sistêmico, R$497) entrava com o valor errado e sujava o valor do
-- pipeline no Kanban. Ramo novo é aditivo: só pega leads cujo interesse_produto
-- bate com uma oferta de formação cadastrada -- nenhum lead existente muda.
CREATE OR REPLACE FUNCTION public.set_valor_potencial()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
AS $function$
DECLARE
  v_preco numeric;
BEGIN
  IF NEW.interesse_produto IS NOT NULL THEN
    SELECT preco INTO v_preco
      FROM public.formacao_ofertas
     WHERE interesse_produto = NEW.interesse_produto
     LIMIT 1;
  END IF;

  IF v_preco IS NOT NULL THEN
    NEW.valor_potencial = v_preco;
  ELSIF NEW.produto = 'npa' THEN
    NEW.valor_potencial = 397;
  ELSIF NEW.origem = 'Direto' THEN
    NEW.valor_potencial = NULL;
  ELSE
    NEW.valor_potencial = 109.90;
  END IF;
  RETURN NEW;
END;
$function$;
