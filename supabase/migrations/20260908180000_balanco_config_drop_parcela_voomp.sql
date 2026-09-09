-- Reverte parte da 20260908170000. `parcela_voomp_extensao` foi adicionada com
-- o modelo errado: eu tinha entendido que a parcela nº X do aluno ia pela Voomp.
--
-- O real (correção do dono do produto): o aluno paga 100% das parcelas pelo
-- Asaas. A extensão universitária Anhanguera é OUTRO boleto, gerado na Voomp no
-- nome do aluno, que a EMPRESA paga por fora pra registrar o vínculo. É despesa
-- da empresa, não uma parcela -- não tem nada pra "pular" no parcelário.
--
-- `asaas_novos_ativo` continua (essa parte estava certa).

alter table public.balanco_config
  drop column if exists parcela_voomp_extensao;
