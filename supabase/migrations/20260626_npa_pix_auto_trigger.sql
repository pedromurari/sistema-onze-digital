-- Trigger automático de envio de PIX NPA
-- Dispara a edge function npa-pix-trigger via pg_net sempre que
-- pix_codigo for definido num lead que ainda não recebeu o PIX

CREATE OR REPLACE FUNCTION public.trigger_npa_pix_auto()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.pix_codigo IS NOT NULL
     AND (OLD.pix_codigo IS DISTINCT FROM NEW.pix_codigo)
     AND (NEW.pix_enviado IS NOT true)
     AND NEW.whatsapp IS NOT NULL
  THEN
    PERFORM net.http_post(
      url     := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/npa-pix-trigger',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := json_build_object('lead_id', NEW.id)::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS npa_pix_auto ON public.npa_evento_leads;

CREATE TRIGGER npa_pix_auto
  AFTER INSERT OR UPDATE OF pix_codigo
  ON public.npa_evento_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_npa_pix_auto();
