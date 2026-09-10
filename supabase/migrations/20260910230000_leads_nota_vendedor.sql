-- Nota do vendedor sobre o lead, separada de `observacoes` (que o
-- webhook-leads preenche com UTM/FBCLID/origem no import). Antes os dois
-- disputavam o mesmo campo: a anotacao do vendedor ("so compra em
-- dezembro") ficava soterrada no meio do bloco de UTM. Agora o CRM Time
-- Comercial le/escreve a nota aqui, e a origem (UTM) fica camuflada num
-- disclosure.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS nota_vendedor text;

COMMENT ON COLUMN public.leads.nota_vendedor IS
  'Anotacao livre do vendedor sobre o lead (aba Funil do CRM Time Comercial). Separada de observacoes, que guarda a origem/UTM do import.';
