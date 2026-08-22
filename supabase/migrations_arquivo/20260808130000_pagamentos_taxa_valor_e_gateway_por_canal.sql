-- ================================================================
-- 1) Trava a taxa calculada no momento da confirmação do pagamento.
--    Antes, a taxa era sempre recalculada ao vivo a partir de
--    payment_method_rates — editar as taxas no futuro mudava também o
--    valor de pagamentos antigos já confirmados. Agora, ao confirmar
--    (Balanço ou ficha do Financeiro), grava-se o valor exato aqui;
--    pagamentos sem taxa_valor (ainda não confirmados, ou confirmados
--    antes desta migração) continuam caindo no cálculo ao vivo.
-- ================================================================
ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS taxa_valor NUMERIC;

COMMENT ON COLUMN public.pagamentos.taxa_valor IS
  'Taxa de gateway (R$) travada no momento da confirmação do pagamento, calculada via payment_method_rates usando o canal_cobranca escolhido naquele instante. NULL = ainda não confirmado (calcular ao vivo).';

-- ================================================================
-- 2) payment_method_rates.gateway passa a ser o nome de um canal real
--    (public.canais_cobranca.nome, ex: "Voomp - Recorrência") em vez do
--    enum fixo (asaas/vega/stripe/outros) que nunca foi de fato
--    comparado com o canal do pagamento. '*' = curinga, aplica a
--    qualquer canal (comportamento atual, preservado).
--    Todas as linhas hoje têm gateway='outros' mas cada uma já
--    corresponde, na prática, a um canal específico (ver observacao) —
--    como isso nunca foi filtrado por canal até agora, normalizamos
--    para '*' e o usuário reatribui o canal certo por linha na tela de
--    Config quando quiser taxas por canal.
-- ================================================================
UPDATE public.payment_method_rates SET gateway = '*' WHERE gateway <> '*';

COMMENT ON COLUMN public.payment_method_rates.gateway IS
  'Canal de cobrança (public.canais_cobranca.nome) ao qual esta taxa se aplica, ou ''*'' para qualquer canal. Regra mais específica (produto+forma+canal) prevalece sobre curingas.';

-- ================================================================
-- 3) Expõe taxa_valor na view usada por Balanço/CFO (acrescentada no
--    fim da lista de colunas — CREATE OR REPLACE VIEW não permite
--    reordenar colunas existentes), para que o cálculo ao vivo
--    (fallback) e a exibição possam preferir o valor travado quando
--    existir.
-- ================================================================
CREATE OR REPLACE VIEW public.vw_receita_por_fonte AS
SELECT
  p.id,
  p.aluno_id,
  p.turma_id,
  p.valor,
  p.status,
  p.data_pagamento,
  p.mes_referencia,
  p.numero_parcela,
  p.produto,
  COALESCE(a.forma_pagamento, 'boleto')               AS forma_pagamento,
  CASE p.produto
    WHEN 'psicanalise' THEN 'PSI'
    WHEN 'npa'         THEN 'NPA'
    WHEN 'numerologia' THEN 'NPA'
    ELSE COALESCE(pr.nome, COALESCE(p.produto, 'Outro'))
  END                                                 AS produto_label,
  p.canal_cobranca,
  a.nome                                              AS aluno_nome,
  p.conferido_em,
  p.conferido_por,
  p.taxa_valor
FROM public.pagamentos  p
LEFT JOIN public.alunos   a  ON a.id   = p.aluno_id
LEFT JOIN public.produtos pr ON pr.slug = p.produto
WHERE p.status        = 'pago'
  AND p.data_pagamento IS NOT NULL;
