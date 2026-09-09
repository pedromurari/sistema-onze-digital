-- Data de corte da operação financeira estruturada.
--
-- Decisão do dono do produto (2026-09-08): "não quero que crie nada de notas,
-- pagamentos, repasses antigos.. quero estrutura para o futuro.. daqui pra
-- frente". Toda automação nova (fila de NFS-e, conciliação por conta, repasse
-- recalculado, geração/cobrança via Asaas) passa a filtrar por esta data e só
-- age no que vier a partir dela.
--
-- Não é um filtro de exibição do histórico: as telas de sempre continuam
-- mostrando tudo. Nada anterior a esta data é criado, alterado ou apagado.
--
-- Aditiva, uma coluna, um default. A linha `onze_digital` já existente recebe
-- 2026-09-01 automaticamente.

alter table public.balanco_config
  add column if not exists inicio_operacao_fiscal date not null default '2026-09-01';

comment on column public.balanco_config.inicio_operacao_fiscal is
  'Data de corte: automações financeiras (NFS-e, conciliação, repasse, Asaas) só agem a partir daqui. Histórico anterior não é tocado nem escondido.';
