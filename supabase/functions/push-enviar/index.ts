import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Chamada pelo trigger notifications_push_trigger toda vez que uma linha é
// inserida em `notifications` -- manda um Web Push nativo do SO pra cada
// inscrição (navegador/dispositivo) do destinatário, mesmo com a aba
// fechada. Autenticação por segredo compartilhado (mesmo padrão do
// enviar-cobranca/enviar-cobranca-tick), já que quem chama é o Postgres via
// net.http_post, sem JWT de usuário.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET") ?? "push-enviar-internal-2026";
  if (req.headers.get("x-cron-key") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body inválido" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { user_id, titulo, descricao, link } = body;
  if (!user_id || !titulo) {
    return new Response(JSON.stringify({ error: "user_id e titulo são obrigatórios" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const vapidPublic  = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    return new Response(JSON.stringify({ error: "VAPID não configurado (secrets ausentes)" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", user_id);

  if (!subs?.length) {
    return new Response(JSON.stringify({ ok: true, enviados: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = JSON.stringify({ title: titulo, body: descricao ?? "", link: link ?? "/" });

  let enviados = 0;
  const expiradas: string[] = [];
  await Promise.all(subs.map(async (sub: any) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      enviados++;
    } catch (e: any) {
      // 404/410 = a inscrição não existe mais no lado do navegador (aba
      // desinstalada, permissão revogada etc.) -- remove pra não tentar de
      // novo pra sempre. Outros erros só logam, sem apagar a inscrição.
      const status = e?.statusCode ?? e?.status;
      if (status === 404 || status === 410) {
        expiradas.push(sub.id);
      } else {
        console.warn(`push-enviar: falha ao enviar pra inscrição ${sub.id}:`, e?.message ?? e);
      }
    }
  }));

  if (expiradas.length) {
    await db.from("push_subscriptions").delete().in("id", expiradas);
  }

  return new Response(JSON.stringify({ ok: true, enviados, removidas: expiradas.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
