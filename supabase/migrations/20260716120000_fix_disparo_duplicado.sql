-- Correcao do bug de mensagens duplicadas em grupo (disparo/funil WhatsApp).
--
-- Causa raiz encontrada em 2026-07-16:
-- Existiam DOIS cron jobs chamando a mesma edge function `funil-processar`:
--   - 'process-funil-messages'  (* * * * *)   <- criado fora de migration, duplicado
--   - 'funil-processar-cron'    (*/5 * * * *) <- job oficial, com janela de 6min
-- Os dois disparavam simultaneamente (confirmado nos logs, invocacoes com
-- menos de 2s de diferenca), aumentando a chance de sobreposicao. Combinado
-- com um bug de retry nao-idempotente (a funcao reenviava a mensagem inteira
-- em outra instancia Evolution quando a resposta dava timeout, mesmo que a
-- mensagem ja tivesse sido entregue), isso causava disparos duplicados em
-- grupo. O bug de retry foi corrigido no codigo das edge functions
-- funil-processar e disparo-runner (nao reenvia mais em erro ambiguo/timeout).
--
-- Este migration remove o job duplicado, mantendo apenas 'funil-processar-cron'.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-funil-messages') THEN
    PERFORM cron.unschedule('process-funil-messages');
  END IF;
END $$;
