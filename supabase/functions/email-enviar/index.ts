import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailPayload {
  to: string;
  to_name?: string;
  subject: string;
  html: string;
  text?: string;
}

// ── Resend ────────────────────────────────────────────────────────────────────
async function sendResend(payload: EmailPayload, cfg: Record<string, string>) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.api_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${cfg.from_name} <${cfg.from_email}>`,
      to:   [payload.to_name ? `${payload.to_name} <${payload.to}>` : payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

// ── SendGrid ──────────────────────────────────────────────────────────────────
async function sendSendgrid(payload: EmailPayload, cfg: Record<string, string>) {
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.api_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: payload.to, name: payload.to_name }] }],
      from: { email: cfg.from_email, name: cfg.from_name },
      subject: payload.subject,
      content: [
        { type: 'text/html',  value: payload.html },
        ...(payload.text ? [{ type: 'text/plain', value: payload.text }] : []),
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SendGrid ${res.status}: ${body.slice(0, 300)}`);
  }
  return { ok: true };
}

// ── Brevo ─────────────────────────────────────────────────────────────────────
async function sendBrevo(payload: EmailPayload, cfg: Record<string, string>) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': cfg.api_key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender:  { name: cfg.from_name, email: cfg.from_email },
      to:      [{ email: payload.to, name: payload.to_name }],
      subject: payload.subject,
      htmlContent: payload.html,
      textContent: payload.text,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

// ── Handler ───────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const payload: EmailPayload = await req.json();
    if (!payload.to || !payload.subject || !payload.html) {
      return new Response(JSON.stringify({ error: 'to, subject e html são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Busca configuração ativa
    const { data: cfg, error: cfgErr } = await supabase
      .from('email_config')
      .select('*')
      .eq('ativo', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cfgErr || !cfg) {
      return new Response(JSON.stringify({ error: 'Email não configurado. Acesse Configurações > Email.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!cfg.api_key) {
      return new Response(JSON.stringify({ error: 'API key de email não configurada.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result: unknown;
    switch (cfg.provider) {
      case 'sendgrid': result = await sendSendgrid(payload, cfg); break;
      case 'brevo':    result = await sendBrevo(payload, cfg);    break;
      default:         result = await sendResend(payload, cfg);   break; // resend
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
