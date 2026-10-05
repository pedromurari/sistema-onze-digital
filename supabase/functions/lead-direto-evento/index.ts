import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Recebe eventos de navegação do site lead-direto (formacao.idmpsi.com.br) via
// api/evento do próprio site -- nunca direto do navegador, a chave
// (WEBHOOK_API_KEY) fica só no servidor do site. Guarda em lead_direto_eventos
// pra medir o funil: visita -> modal -> cadastro -> vídeo -> clique no WhatsApp.
// Não guarda dado pessoal (nome/telefone): só visitor_id anônimo e, no
// cadastro, o id do lead.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EVENTOS = ['pageview', 'modal_aberto', 'cadastro', 'video_play', 'clique_whatsapp'] as const;

const texto = (max: number) => z.string().max(max).optional().nullable();

const BodySchema = z.object({
  evento: z.enum(EVENTOS),
  pagina: texto(200),
  host: texto(100),
  visitor_id: texto(64),
  lead_id: z.string().uuid().optional().nullable(),
  event_id: texto(100),
  utm_source: texto(200),
  utm_medium: texto(200),
  utm_campaign: texto(300),
  utm_content: texto(300),
  referrer: texto(500),
  user_agent: texto(500),
  detalhe: texto(200),
});

const BOT_REGEX = /bot|crawler|spider|facebookexternalhit|facebot|meta-externalagent|slurp|preview|headless|lighthouse|pingdom|uptime/i;

function dispositivo(ua: string): string {
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  if (/mobi|android|iphone/i.test(ua)) return 'mobile';
  return 'desktop';
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
    const validApiKey = Deno.env.get('WEBHOOK_API_KEY');

    if (!validApiKey) {
      console.error('WEBHOOK_API_KEY environment variable is not configured');
      return jsonResponse({ error: 'Server configuration error' }, 500);
    }
    if (!apiKey || apiKey !== validApiKey) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed. Use POST.' }, 405);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(await req.text());
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400);
    }

    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonResponse({
        error: 'Validation failed',
        details: parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
      }, 400);
    }
    const b = parsed.data;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing Supabase environment variables');
      return jsonResponse({ error: 'Server configuration error' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const ua = b.user_agent ?? '';

    // ignoreDuplicates: reenvio do mesmo event_id (retry/beacon duplicado) não conta duas vezes.
    const { error } = await supabaseAdmin.from('lead_direto_eventos').upsert({
      evento: b.evento,
      pagina: b.pagina ?? null,
      host: b.host ?? null,
      visitor_id: b.visitor_id ?? null,
      lead_id: b.lead_id ?? null,
      event_id: b.event_id ?? null,
      utm_source: b.utm_source ?? null,
      utm_medium: b.utm_medium ?? null,
      utm_campaign: b.utm_campaign ?? null,
      utm_content: b.utm_content ?? null,
      referrer: b.referrer ?? null,
      dispositivo: dispositivo(ua),
      detalhe: b.detalhe ?? null,
      is_bot: BOT_REGEX.test(ua),
    }, { onConflict: 'event_id', ignoreDuplicates: true });

    if (error) {
      console.error('Falha ao gravar evento:', error);
      return jsonResponse({ error: 'Falha ao gravar evento' }, 500);
    }

    return jsonResponse({ success: true }, 200);
  } catch (error) {
    console.error('Erro ao registrar evento:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
