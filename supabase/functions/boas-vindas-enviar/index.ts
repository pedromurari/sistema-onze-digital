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

type EvoInstance = { id: string; api_url: string; api_key: string; instance_name: string };

// Resolução da instância: override específico do funil (wpp_instance_name) -> instância(s)
// escolhida(s) na tela de Boas-vindas (evolution_task_config, task 'boas_vindas') -> todas
// as instâncias ativas por prioridade global. Mesmo padrão do enviar-cobranca.
async function resolveInstances(
  db: ReturnType<typeof createClient>,
  cfg: { wpp_instance_name?: string | null },
  allActive: EvoInstance[],
): Promise<EvoInstance[]> {
  if (cfg.wpp_instance_name) {
    const scoped = allActive.filter(r => r.instance_name === cfg.wpp_instance_name);
    if (scoped.length) return scoped;
  }

  const { data: taskCfg } = await db
    .from('evolution_task_config')
    .select('instance_ids')
    .eq('task', 'boas_vindas')
    .maybeSingle();
  if (taskCfg?.instance_ids?.length) {
    const byId = new Map(allActive.map(i => [i.id, i]));
    const scoped = (taskCfg.instance_ids as string[]).map(id => byId.get(id)).filter(Boolean) as EvoInstance[];
    if (scoped.length) return scoped;
  }

  return allActive;
}

// A Evolution API pode responder 200 mesmo com a sessão do WhatsApp fechada e só falhar
// silenciosamente na entrega — checa o estado real de conexão antes de usar a instância
// (mesmo mecanismo do disparo-runner e enviar-cobranca).
async function isInstanceConnected(inst: { api_url: string; api_key: string; instance_name: string }): Promise<boolean> {
  const rawBase = inst.api_url.replace(/\/$/, '');
  const base = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
  try {
    const res = await fetch(`${base}/instance/connectionState/${encodeURIComponent(inst.instance_name)}`, {
      headers: { apikey: inst.api_key },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const data = await res.json() as { instance?: { state?: string } };
    return data.instance?.state === 'open';
  } catch {
    return false;
  }
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
        const { data: evoRows } = await supabase
          .from('evolution_config')
          .select('id, api_url, api_key, instance_name')
          .eq('ativo', true)
          .order('prioridade', { ascending: true });

        if (!evoRows?.length) throw new Error('Nenhuma instância Evolution ativa');

        const candidateInstances = await resolveInstances(supabase, cfg, evoRows as EvoInstance[]);
        const connectedFlags = await Promise.all(candidateInstances.map(isInstanceConnected));
        const activeInstances = candidateInstances.filter((_: unknown, i: number) => connectedFlags[i]);

        if (!activeInstances.length) throw new Error('Nenhuma instância conectada disponível (sessão do WhatsApp fechada)');

        const mensagem = applyVars(cfg.wpp_mensagem, vars);
        const number   = toGroupJid(whatsapp);
        const msgType  = (cfg.wpp_message_type as string) || 'text';
        const mediaUrl = msgType !== 'text' ? applyVars(cfg.wpp_media_url ?? '', vars) : '';
        if (msgType !== 'text' && !mediaUrl) throw new Error('wpp_media_url não configurada para o tipo de mensagem escolhido');

        let lastErr: Error | null = null;
        for (const inst of activeInstances) {
          const rawBase = (inst.api_url as string).replace(/\/$/, '');
          const base    = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
          const apikey  = inst.api_key as string;
          const instance = inst.instance_name as string;

          try {
            const endpoint = msgType === 'text' ? `${base}/message/sendText/${instance}` : `${base}/message/sendMedia/${instance}`;
            const payload = msgType === 'text'
              ? { number, text: mensagem, delay: 1200 }
              : { number, mediatype: msgType, media: mediaUrl, caption: mensagem, delay: 1200 };
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey },
              body: JSON.stringify(payload),
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
