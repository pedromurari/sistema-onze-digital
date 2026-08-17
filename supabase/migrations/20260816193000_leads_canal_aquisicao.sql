-- Canal de aquisição de um lead do Time Comercial (SDD, Direto, Webinário,
-- Workshop, Retorno/Base, Orgânico). Campo PRÓPRIO, separado de `origem`,
-- porque `origem='Direto'` já é usado pela tela "Leads Diretos" (Pipeline.tsx)
-- pra um funil totalmente diferente -- não dá pra reaproveitar `origem` aqui
-- sem colidir com aqueles dados. Leads do Time Comercial continuam com
-- origem='Time Comercial'; `canal` é a subdivisão por fonte de aquisição
-- dentro desse funil.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS canal text;

COMMENT ON COLUMN public.leads.canal IS
  'Canal de aquisição do lead dentro do funil "Time Comercial" (SDD, Direto, Webinário, Workshop, Retorno/Base, Orgânico). Não confundir com a coluna `origem`, que distingue Leads Diretos (Pipeline.tsx) de Time Comercial (TimeComercial.tsx).';
