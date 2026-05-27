/**
 * wpp-enviar — envia uma mensagem WhatsApp individual via Evolution API
 * com suporte a anti-ban: indicador de digitação + delay configurável.
 *
 * Body:
 *   numero        string   — número destino (55119...) ou JID
 *   mensagem      string   — texto a enviar
 *   instance_name string?  — instância específica (null = auto-prioridade)
 *   typing_delay_ms number? — ms de digitação antes de enviar (0 = desativado)
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeNumber(raw: string): string {
  const t = raw.trim();
  if (t.endsWith('@g.us') || t.endsWith('@s.whatsapp.net')) return t;
  const digits = t.replace(/\D/g, '');
  // número individual
  return digits;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const {
      numero,
      mensagem,
      instance_name,
      typing_delay_ms = 3000,
    }: {
      numero: string;
      mensagem: string;
      instance_name?: string | null;
      typing_delay_ms?: number;
    } = await req.json();

    if (!numero || !mensagem) {
      return new Response(JSON.stringify({ error: 'numero e mensagem são obrigatórios' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // ── Carrega instâncias Evolution ──────────────────────────────────────────
    const { data: evoRows, error: evoErr } = await supabase
      .from('evolution_config')
      .select('api_url, api_key, instance_name')
      .eq('ativo', true)
      .order('prioridade', { ascending: true });

    if (evoErr || !evoRows?.length) {
      return new Response(JSON.stringify({ error: 'Nenhuma instância Evolution ativa' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Filtra instância específica se pedida
    const candidates = instance_name
      ? evoRows.filter((r: { instance_name: string }) => r.instance_name === instance_name)
      : [];
    const instances: typeof evoRows = candidates.length ? candidates : evoRows;

    const number = normalizeNumber(numero);

    let lastErr: Error | null = null;
    let usedInstance = '';

    for (const inst of instances) {
      const rawBase = (inst.api_url as string).replace(/\/$/, '');
      const base    = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
      const apikey  = inst.api_key as string;
      const instName = inst.instance_name as string;

      try {
        // ── 1. Indicador de digitação (anti-ban) ──────────────────────────────
        if (typing_delay_ms > 0) {
          try {
            await fetch(`${base}/chat/sendPresence/${instName}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey },
              body: JSON.stringify({ number, presence: 'composing', delay: typing_delay_ms }),
            });
            // Aguarda o tempo de digitação antes de enviar
            await new Promise(r => setTimeout(r, typing_delay_ms));
          } catch {
            // Presence não crítica — continua sem ela
          }
        }

        // ── 2. Envio da mensagem ──────────────────────────────────────────────
        const res = await fetch(`${base}/message/sendText/${instName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey },
          body: JSON.stringify({
            number,
            text:  mensagem,
            delay: 1200, // delay interno da Evolution (anti-flood)
          }),
        });
        const txt = await res.text();
        if (!res.ok) throw new Error(`Evolution ${res.status}: ${txt.slice(0, 200)}`);

        lastErr = null;
        usedInstance = instName;
        break;

      } catch (e) {
        lastErr = e as Error;
        console.warn(`wpp-enviar: instância ${instName} falhou:`, (e as Error).message);
      }
    }

    if (lastErr) {
      return new Response(JSON.stringify({ ok: false, error: lastErr.message }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, instance: usedInstance }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  } catch (e: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
