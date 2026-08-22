-- Vincula um aluno ao vendedor (Time Comercial) que fechou a venda. Ainda
-- não há usuários reais de vendedor no sistema (Helen/Miguel/Aline são
-- estado local em TimeComercial.tsx), então por enquanto isso guarda o
-- NOME do vendedor como texto livre, não um FK -- migrar para uuid
-- referenciando profiles/user_roles quando as contas reais existirem.
--
-- Sem automação ainda: o formulario matricula.html (externo, mantido pelo
-- Igor) não envia o parametro `v=` pra cá, então esse campo é preenchido
-- manualmente pelo proprio vendedor (ver TimeComercial.tsx, aba Operação)
-- até existir um jeito de capturar isso automaticamente na matrícula.

ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS vendedor_id text;

COMMENT ON COLUMN public.alunos.vendedor_id IS
  'Nome do vendedor do Time Comercial que fechou essa matrícula (texto livre por enquanto -- sem contas reais ainda). Preenchido manualmente na aba Operação do CRM Time Comercial.';
