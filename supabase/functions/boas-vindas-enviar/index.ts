import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function applyVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function toGroupJid(value: string): string {
  const trimmed = value.trim();
  if (trimmed.endsWith('@g.us')) return trimmed;
  if (/^\d+$/.test(trimmed)) return `${trimmed}@g.us`;
  return trimmed; // número individual
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const {
      funnel_name,
      nome        = '',
      whatsapp    = '',
      email       = '',
    }: {
      funnel_name: string;
      nome?: string;
      whatsapp?: string;
      email?: string;
    } = body;

    if (!funnel_name) {
      return new Response(JSON.stringify({ error: 'funnel_name obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Carrega configuração de boas-vindas ───────────────────────────────────
    const { data: cfg } = await supabase
      .from('boas_vindas_config')
      .select('*')
      .eq('funnel_name', funnel_name)
      .maybeSingle();

    if (!cfg?.ativo) {
      return new Response(JSON.stringify({ error: 'Boas-vindas não está ativo para este funil' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const vars: Record<string, string> = {
      nome,
      turma: funnel_name,
      whatsapp,
      email,
    };

    let wppStatus  = 'skipped';
    let emailStatus = 'skipped';
    let wppError: string | null = null;
    let emailError: string | null = null;

    // ── Envio WhatsApp ────────────────────────────────────────────────────────
    if (cfg.wpp_ativo && whatsapp) {
      try {
        // Instâncias Evolution
        const query = supabase
          .from('evolution_config')
          .select('api_url, api_key, instance_name')
          .eq('ativo', true)
          .order('prioridade', { ascending: true });

        const { data: evoRows } = await query;

        if (!evoRows?.length) throw new Error('Nenhuma instância Evolution ativa');

        // Filtra instância específica se configurada
        const instances = cfg.wpp_instance_name
          ? evoRows.filter((r: { instance_name: string }) => r.instance_name === cfg.wpp_instance_name)
          : evoRows;

        const activeInstances = instances.length ? instances : evoRows;

        const mensagem = applyVars(cfg.wpp_mensagem, vars);
        const number   = toGroupJid(whatsapp);

        let lastErr: Error | null = null;
        for (const inst of activeInstances) {
          const rawBase = (inst.api_url as string).replace(/\/$/, '');
          const base    = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
          const apikey  = inst.api_key as string;
          const instance = inst.instance_name as string;

          try {
            const res = await fetch(`${base}/message/sendText/${instance}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey },
              body: JSON.stringify({ number, text: mensagem, delay: 1200 }),
            });
            const txt = await res.text();
            if (!res.ok) throw new Error(`Evolution ${res.status}: ${txt.slice(0, 200)}`);
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e as Error;
          }
        }

        if (lastErr) throw lastErr;
        wppStatus = 'sent';

      } catch (e: unknown) {
        wppStatus = 'error';
        wppError  = (e as Error).message;
      }
    }

    // ── Envio Email ───────────────────────────────────────────────────────────
    if (cfg.email_ativo && email) {
      try {
        const assunto = applyVars(cfg.email_assunto, vars);
        const corpo   = applyVars(cfg.email_corpo, vars);

        const { data: emailRes } = await supabase.functions.invoke('email-enviar', {
          body: {
            to:      email,
            to_name: nome || undefined,
            subject: assunto,
            html:    corpo,
          },
        });

        if ((emailRes as any)?.error) throw new Error((emailRes as any).error);
        emailStatus = 'sent';

      } catch (e: unknown) {
        emailStatus = 'error';
        emailError  = (e as Error).message;
      }
    }

    // ── Log ───────────────────────────────────────────────────────────────────
    await supabase.from('boas_vindas_logs').insert({
      funnel_name,
      nome:         nome || null,
      whatsapp:     whatsapp || null,
      email:        email || null,
      wpp_status:   wppStatus,
      email_status: emailStatus,
      wpp_error:    wppError,
      email_error:  emailError,
    });

    const allOk = (wppStatus !== 'error') && (emailStatus !== 'error');

    return new Response(JSON.stringify({
      ok: allOk,
      wpp_status:   wppStatus,
      email_status: emailStatus,
      wpp_error:    wppError,
      email_error:  emailError,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
