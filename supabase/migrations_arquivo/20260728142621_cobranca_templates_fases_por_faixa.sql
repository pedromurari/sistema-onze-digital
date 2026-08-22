-- Fase por faixa de dias em vez de dia exato, pra ninguém ficar em limbo sem nunca bater
-- um dia fixo configurado (ver lógica em enviar-cobranca/proximoEnvioElegivel).
ALTER TABLE cobranca_templates ADD COLUMN IF NOT EXISTS dias_offset_fim INTEGER;

UPDATE cobranca_templates SET nome = 'Cobrança 1-3 dias após', dias_offset = 1, dias_offset_fim = 3
  WHERE tipo = 'pos_vencimento' AND ordem = 4;
UPDATE cobranca_templates SET nome = 'Cobrança 4-7 dias após', dias_offset = 4, dias_offset_fim = 7
  WHERE tipo = 'pos_vencimento' AND ordem = 5;
UPDATE cobranca_templates SET nome = 'Cobrança 8-15 dias após', dias_offset = 8, dias_offset_fim = 15
  WHERE tipo = 'pos_vencimento' AND ordem = 6;
UPDATE cobranca_templates SET nome = 'Cobrança 16+ dias após', dias_offset = 16, dias_offset_fim = NULL
  WHERE tipo = 'pos_vencimento' AND ordem = 7;

-- Templates de pré-vencimento/vencimento/quitação continuam por dia exato -- faixa fechada
-- de 1 dia (offset = offset_fim) deixa o range-match do backend funcionar igual ao exato.
UPDATE cobranca_templates SET dias_offset_fim = dias_offset WHERE tipo IN ('pre_vencimento', 'vencimento', 'quitacao');
