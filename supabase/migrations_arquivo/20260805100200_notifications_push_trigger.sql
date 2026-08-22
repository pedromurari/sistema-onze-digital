-- Dispara a edge function push-enviar toda vez que uma notificação é criada,
-- pra qualquer tipo (inclusive os que já existem hoje, handoff_rodrygo e
-- etapa_desbloqueada) sair também como push do navegador, sem precisar que
-- cada call site lembre de chamar duas coisas -- só precisa inserir em
-- `notifications` (via notificar()/notificar_admins() ou direto) que o push
-- já sai sozinho. push-enviar decide sozinho se o usuário tem alguma
-- inscrição; se não tiver, não faz nada.
CREATE OR REPLACE FUNCTION public.trigger_notification_push()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/push-enviar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key',   'push-enviar-internal-2026'
    ),
    body    := jsonb_build_object(
      'user_id', NEW.user_id,
      'titulo',  NEW.titulo,
      'descricao', NEW.descricao,
      'link',    NEW.link
    ),
    timeout_milliseconds := 15000
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_push_trigger ON public.notifications;

CREATE TRIGGER notifications_push_trigger
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_notification_push();
