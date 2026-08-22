-- kanban_colunas_single_module exigia exatamente 1 dono entre lancamento/npa/aula_secreta;
-- leads_quadro_id (adicionado nesta sessão) não entrava na conta, então qualquer coluna
-- de um quadro de leads violava o check (soma = 0). Inclui leads_quadro_id na contagem.
ALTER TABLE public.kanban_colunas
  DROP CONSTRAINT kanban_colunas_single_module;

ALTER TABLE public.kanban_colunas
  ADD CONSTRAINT kanban_colunas_single_module CHECK (
    ((lancamento_id IS NOT NULL)::int
     + (npa_evento_id IS NOT NULL)::int
     + (aula_secreta_evento_id IS NOT NULL)::int
     + (leads_quadro_id IS NOT NULL)::int) = 1
  );
