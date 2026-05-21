import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if ((digits.length === 13 || digits.length === 12) && digits.startsWith('55')) {
    return digits.slice(2);
  }
  return digits.slice(-11);
}

function suffix8(phone: string): string {
  return normalizePhone(phone).slice(-8);
}

async function findColunaId(
  supabase: ReturnType<typeof createClient>,
  lancamentoId: string,
  tipo: 'lancamento' | 'oferta',
): Promise<string | null> {
  const { data } = await supabase
    .from('kanban_colunas')
    .select('id, nome')
    .eq('lancamento_id', lancamentoId);

  if (!data?.length) return null;

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const col of data) {
    const n = norm(col.nome as string);
    if (tipo === 'lancamento' && (n.includes('grupol') || (n.includes('grupo') && n.includes('lancamento')))) {
      return col.id as string;
    }
    if (tipo === 'oferta' && (n.includes('grupoo') || (n.includes('grupo') && n.includes('oferta')))) {
      return col.id as string;
    }
  }
  return null;
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json200 = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const json400 = (msg: string) =>
    new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase   = createClient(supabaseUrl, supabaseKey);

    const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
    if (webhookSecret) {
      const incoming = req.headers.get('x-webhook-secret') ?? new URL(req.url).searchParams.get('secret');
      if (incoming !== webhookSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const body = await req.json();

    const event: string  = (body.event ?? body.type ?? '').toLowerCase();
    const data           = body.data ?? body;
    const action: string = (data.action ?? '').toLowerCase();

    // Log every incoming call so we can debug from Supabase logs
    console.log(JSON.stringify({ event, action, groupId: data.id ?? data.groupId ?? '', ts: new Date().toISOString() }));

    // Accept both direct-add and invite-link joins.
    // Evolution API fires action="add" for both, but some versions use "invite".
    const ACCEPTED_ACTIONS = new Set(['add', 'invite', '']);
    if (!event.includes('participant') || !ACCEPTED_ACTIONS.has(action)) {
      return json200({ ok: true, skipped: true, reason: `event="${event}" action="${action}"` });
    }

    // Group JID (e.g. "120363XXXXXXXXXX@g.us")
    const groupJid: string = data.id ?? data.groupId ?? '';
    if (!groupJid) return json400('groupJid not found in payload');

    // Participants array — each entry is "5511999999999@s.whatsapp.net" or similar
    const participants: string[] = Array.isArray(data.participants)
      ? data.participants
      : typeof data.participant === 'string' ? [data.participant] : [];

    if (!participants.length) return json200({ ok: true, skipped: true, reason: 'no participants' });

    // Find which lancamento has this group JID.
    // IMPORTANT: quote the JID value so PostgREST doesn't misparse '@' and '.' as
    // column accessors — e.g. "120363428224959911@g.us" needs double-quotes in the filter.
    const quotedJid = `"${groupJid}"`;
    const { data: lancamentos, error: lancError } = await supabase
      .from('lancamentos')
      .select('id, grupo_lancamento_jid, grupo_oferta_jid')
      .or(`grupo_lancamento_jid.eq.${quotedJid},grupo_oferta_jid.eq.${quotedJid}`)
      .limit(5);

    if (lancError) {
      console.error('lancamentos query error:', JSON.stringify(lancError));
      throw new Error(`DB error: ${lancError.message}`);
    }

    if (!lancamentos?.length) {
      return json200({ ok: true, skipped: true, reason: `no lancamento configured for group "${groupJid}"` });
    }

    const results: Array<{ lancamentoId: string; phone: string; tipo: string; updated: boolean }> = [];

    for (const lancamento of lancamentos) {
      const isLancamentoGroup = lancamento.grupo_lancamento_jid === groupJid;
      const tipo: 'lancamento' | 'oferta' = isLancamentoGroup ? 'lancamento' : 'oferta';
      const fieldName = isLancamentoGroup ? 'no_grupo' : 'grupo_oferta';

      const colunaId = await findColunaId(supabase, lancamento.id, tipo);

      for (const participant of participants) {
        const s8 = suffix8(participant);

        const { data: matchedLeads } = await supabase
          .from('lancamento_leads')
          .select('id, whatsapp, fase')
          .eq('lancamento_id', lancamento.id)
          .filter('whatsapp', 'ilike', `%${s8}`);

        if (!matchedLeads?.length) {
          console.log(`no lead matched suffix8="${s8}" lancamento="${lancamento.id}"`);
          results.push({ lancamentoId: lancamento.id, phone: participant, tipo, updated: false });
          continue;
        }

        for (const lead of matchedLeads) {
          const updates: Record<string, unknown> = { [fieldName]: true };
          if (colunaId) updates.fase = colunaId;

          const { error: updateError } = await supabase
            .from('lancamento_leads')
            .update(updates)
            .eq('id', lead.id);

          if (updateError) {
            console.error(`update error lead=${lead.id}:`, JSON.stringify(updateError));
          } else {
            console.log(`updated lead=${lead.id} phone=${normalizePhone(participant)} tipo=${tipo} coluna=${colunaId}`);
          }

          results.push({ lancamentoId: lancamento.id, phone: normalizePhone(participant), tipo, updated: !updateError });
        }
      }
    }

    return json200({ ok: true, processed: results.length, results });

  } catch (e: unknown) {
    console.error('webhook-grupo fatal:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
