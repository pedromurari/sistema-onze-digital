-- O dedupe de "já cobrei essa fase" era um SELECT count() antes do INSERT,
-- sem trava no banco -- confirmado em produção: pares (pagamento_id,
-- template_id) com 2 envios "enviado" cada, horas de diferença (tick
-- automático e "Disparar agora" manual rodando quase juntos, ou dois ticks
-- sobrepostos, passando os dois pela checagem antes de qualquer um gravar).
-- Esse índice único torna a reserva atômica: o segundo INSERT concorrente
-- pra mesma fase do mesmo pagamento falha com unique_violation em vez de
-- também mandar a mensagem.
CREATE UNIQUE INDEX IF NOT EXISTS ux_cobranca_logs_pagamento_template_ativo
  ON public.cobranca_logs (pagamento_id, template_id)
  WHERE status IN ('pendente', 'enviado');

-- Uma mensagem consolidada agora pode cobrir várias parcelas (uma linha de
-- log por pagamento_id, pra manter o dedupe por fase de cada parcela
-- funcionando individualmente) -- grupo_envio_id amarra essas linhas como
-- "isso foi 1 mensagem só", pra Histórico não mostrar o mesmo envio repetido
-- N vezes.
ALTER TABLE public.cobranca_logs ADD COLUMN IF NOT EXISTS grupo_envio_id UUID;

COMMENT ON COLUMN public.cobranca_logs.grupo_envio_id IS
  'Agrupa as linhas de log geradas por um mesmo envio consolidado (1 mensagem cobrindo várias parcelas do mesmo aluno).';
