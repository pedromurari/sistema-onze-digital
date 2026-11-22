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
  /** De onde veio o e-mail: 'boas_vindas' | 'campanha_massa' | ... */
  origem?: string;
  /** Id do destinatario/lead/campanha na origem, pra cruzar depois. */
  referencia_id?: string;
  /** true desliga o pixel de abertura neste envio (transacional interno). */
  sem_rastreio?: boolean;
}

const FUNCTIONS_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;

/**
 * Injeta o pixel 1x1 de abertura antes do </body> (ou no fim, se nao houver).
 * Rastreio nunca pode derrubar envio: qualquer erro aqui devolve o HTML cru.
 */
function injetarPixel(html: string, envioId: string): string {
  try {
    const img = `<img src="${FUNCTIONS_URL}/email-pixel?e=${envioId}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;outline:none;" />`;
    const i = html.toLowerCase().lastIndexOf('</body>');
    return i === -1 ? html + img : html.slice(0, i) + img + html.slice(i);
  } catch {
    return html;
  }
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

    // ── Rastreio de abertura ────────────────────────────────────────────────
    // Best-effort em todas as pontas: se gravar o registro falhar, o e-mail
    // sai sem pixel em vez de nao sair. Medicao nunca derruba entrega.
    let envioId: string | null = null;
    if (!payload.sem_rastreio) {
      try {
        const { data: envio } = await supabase
          .from('email_envios')
          .insert({
            destinatario: payload.to,
            nome: payload.to_name ?? null,
            assunto: payload.subject,
            origem: payload.origem ?? 'avulso',
            referencia_id: payload.referencia_id ?? null,
            provider: cfg.provider ?? 'resend',
          })
          .select('id')
          .single();
        envioId = envio?.id ?? null;
      } catch (e) {
        console.error('email-enviar: falha ao registrar envio (segue sem rastreio):', (e as Error).message);
      }
    }

    const payloadFinal: EmailPayload = envioId
      ? { ...payload, html: injetarPixel(payload.html, envioId) }
      : payload;

    let result: unknown;
    try {
      switch (cfg.provider) {
        case 'sendgrid': result = await sendSendgrid(payloadFinal, cfg); break;
        case 'brevo':    result = await sendBrevo(payloadFinal, cfg);    break;
        default:         result = await sendResend(payloadFinal, cfg);   break; // resend
      }
    } catch (erroEnvio) {
      if (envioId) {
        await supabase.from('email_envios')
          .update({ erro: (erroEnvio as Error).message.slice(0, 400) })
          .eq('id', envioId)
          .then(() => {}, () => {});
      }
      throw erroEnvio;
    }

    if (envioId) {
      const provider_id = (result as { id?: string } | null)?.id ?? null;
      if (provider_id) {
        await supabase.from('email_envios').update({ provider_id }).eq('id', envioId)
          .then(() => {}, () => {});
      }
    }

    return new Response(JSON.stringify({ ok: true, result, envio_id: envioId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
