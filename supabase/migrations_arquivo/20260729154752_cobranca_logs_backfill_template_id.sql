-- Bug real de producao: logs enviados antes da coluna template_id existir ficaram com
-- template_id NULL, e o dedup por template_id (cobranca_logs_template_id_dedup_fix) nao
-- reconhecia esses envios como "ja cobrado nesta fase" -- resultado: reenvio pra quem ja
-- tinha sido cobrado. Backfill infere o template correto pela faixa de dias entre
-- enviado_em (fuso Sao Paulo) e a data de vencimento do pagamento, mesma logica de
-- proximoEnvioElegivel em enviar-cobranca/index.ts.
UPDATE cobranca_logs cl
SET template_id = t.id
FROM pagamentos p, cobranca_templates t
WHERE cl.pagamento_id = p.id
  AND cl.template_id IS NULL
  AND cl.status = 'enviado'
  AND t.tipo = cl.template_tipo
  AND (
    (cl.template_tipo = 'pos_vencimento' AND
     (cl.enviado_em AT TIME ZONE 'America/Sao_Paulo')::date - p.data_vencimento >= t.dias_offset
     AND (t.dias_offset_fim IS NULL OR (cl.enviado_em AT TIME ZONE 'America/Sao_Paulo')::date - p.data_vencimento <= t.dias_offset_fim)
    )
    OR
    (cl.template_tipo <> 'pos_vencimento' AND
     (cl.enviado_em AT TIME ZONE 'America/Sao_Paulo')::date - p.data_vencimento = t.dias_offset
    )
  );
