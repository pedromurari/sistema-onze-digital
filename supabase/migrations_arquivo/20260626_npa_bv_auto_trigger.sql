-- Trigger automático de boas-vindas NPA
-- Dispara a edge function npa-bv-trigger (via pg_net) sempre que
-- ingresso_pago mudar para true, independente de como o lead chegou
-- (vega-webhook, manual, planilha, etc.)

CREATE OR REPLACE FUNCTION public.trigger_npa_bv_auto()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.ingresso_pago = true
     AND (OLD.ingresso_pago IS DISTINCT FROM true)
     AND (NEW.bv_enviado IS NOT true)
     AND NEW.whatsapp IS NOT NULL
  THEN
    PERFORM net.http_post(
      url     := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/npa-bv-trigger',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := json_build_object('lead_id', NEW.id)::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS npa_bv_auto ON public.npa_evento_leads;

CREATE TRIGGER npa_bv_auto
  AFTER INSERT OR UPDATE OF ingresso_pago
  ON public.npa_evento_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_npa_bv_auto();
