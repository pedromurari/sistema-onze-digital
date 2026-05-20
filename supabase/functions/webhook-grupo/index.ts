import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalizes a WhatsApp phone to the 11-digit BR format (DDD + number).
 * Input examples:
 *   "5511987654321@s.whatsapp.net"  → "11987654321"
 *   "5511987654321"                  → "11987654321"
 *   "11987654321"                    → "11987654321"
 */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if ((digits.length === 13 || digits.length === 12) && digits.startsWith('55')) {
    return digits.slice(2);
  }
  return digits.slice(-11);
}

/** Returns the last 8 digits of a normalized phone (core number, no DDD, no 9-prefix). */
function suffix8(phone: string): string {
  return normalizePhone(phone).slice(-8);
}

/**
 * Finds the kanban column id for a given lancamento that best matches
 * a tipo ('lancamento' | 'oferta').
 */
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

    // Optional webhook secret validation (configure via Supabase env var WEBHOOK_SECRET)
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

    // Evolution API v1/v2 event field might be "event" or inside body directly
    const event: string  = (body.event ?? body.type ?? '').toLowerCase();
    const data           = body.data ?? body;

    // Only care about participants joining a group
    const action: string = (data.action ?? '').toLowerCase();
    if (!event.includes('participant') || action !== 'add') {
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

    // Find which lancamento has this group JID (lançamento or oferta)
    const { data: lancamentos } = await supabase
      .from('lancamentos')
      .select('id, grupo_lancamento_jid, grupo_oferta_jid')
      .or(`grupo_lancamento_jid.eq.${groupJid},grupo_oferta_jid.eq.${groupJid}`)
      .limit(5);

    if (!lancamentos?.length) {
      return json200({ ok: true, skipped: true, reason: `no lancamento configured for group "${groupJid}"` });
    }

    const results: Array<{ lancamentoId: string; phone: string; tipo: string; updated: boolean }> = [];

    for (const lancamento of lancamentos) {
      const isLancamentoGroup = lancamento.grupo_lancamento_jid === groupJid;
      const tipo: 'lancamento' | 'oferta' = isLancamentoGroup ? 'lancamento' : 'oferta';
      const fieldName = isLancamentoGroup ? 'no_grupo' : 'grupo_oferta';

      // Find kanban column for this group type
      const colunaId = await findColunaId(supabase, lancamento.id, tipo);

      for (const participant of participants) {
        const s8 = suffix8(participant);

        // Find lead by last 8 digits of whatsapp
        const { data: matchedLeads } = await supabase
          .from('lancamento_leads')
          .select('id, whatsapp, fase')
          .eq('lancamento_id', lancamento.id)
          .filter('whatsapp', 'ilike', `%${s8}`);

        if (!matchedLeads?.length) {
          results.push({ lancamentoId: lancamento.id, phone: participant, tipo, updated: false });
          continue;
        }

        // Update each matched lead
        for (const lead of matchedLeads) {
          const updates: Record<string, unknown> = { [fieldName]: true };
          if (colunaId) updates.fase = colunaId;

          await supabase
            .from('lancamento_leads')
            .update(updates)
            .eq('id', lead.id);

          results.push({ lancamentoId: lancamento.id, phone: normalizePhone(participant), tipo, updated: true });
        }
      }
    }

    return json200({ ok: true, processed: results.length, results });

  } catch (e: unknown) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
