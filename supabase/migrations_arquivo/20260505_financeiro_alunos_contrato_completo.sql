-- Alinha o financeiro com os dados completos usados no contrato e no Autentique.

ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS forms_respondido boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS forms_respondido_em timestamptz,
  ADD COLUMN IF NOT EXISTS contrato_enviado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS contrato_enviado_em timestamptz,
  ADD COLUMN IF NOT EXISTS contrato_assinado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS contrato_assinado_em timestamptz,
  ADD COLUMN IF NOT EXISTS autentique_documento_id text,
  ADD COLUMN IF NOT EXISTS autentique_link_assinatura text,
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS cidade_estado text,
  ADD COLUMN IF NOT EXISTS pais text DEFAULT 'Brasil',
  ADD COLUMN IF NOT EXISTS dia_vencimento_contrato text,
  ADD COLUMN IF NOT EXISTS forma_pagamento text,
  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS data_matricula date;

UPDATE public.alunos
SET
  forms_respondido = COALESCE(forms_respondido, false),
  contrato_enviado = COALESCE(contrato_enviado, false),
  contrato_assinado = COALESCE(contrato_assinado, false),
  pais = COALESCE(pais, 'Brasil'),
  data_matricula = COALESCE(data_matricula, data_inicio),
  dia_vencimento_contrato = COALESCE(dia_vencimento_contrato, 'dia ' || COALESCE(dia_vencimento, 10)::text);

CREATE INDEX IF NOT EXISTS idx_alunos_turma_pagamento
  ON public.alunos (turma_id, forma_pagamento);

CREATE INDEX IF NOT EXISTS idx_pagamentos_aluno_status
  ON public.pagamentos (aluno_id, status);

CREATE INDEX IF NOT EXISTS idx_pagamentos_produto_vencimento_status
  ON public.pagamentos (produto, data_vencimento, status);
