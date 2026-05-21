import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if ((digits.length === 13 || digits.length === 12) && digits.startsWith('55')) return digits.slice(2);
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
  const { data } = await supabase.from('kanban_colunas').select('id, nome').eq('lancamento_id', lancamentoId);
  if (!data?.length) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const col of data) {
    const n = norm(col.nome as string);
    if (tipo === 'lancamento' && (n.includes('grupol') || (n.includes('grupo') && n.includes('lancamento')))) return col.id as string;
    if (tipo === 'oferta'     && (n.includes('grupoo') || (n.includes('grupo') && n.includes('oferta'))))     return col.id as string;
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase   = createClient(supabaseUrl, supabaseKey);

    const { lancamentoId, tipo = 'lancamento' } = await req.json() as {
      lancamentoId: string;
      tipo?: 'lancamento' | 'oferta';
    };

    if (!lancamentoId) return respond({ error: 'lancamentoId required' }, 400);

    // 1. Get lancamento group JID
    const { data: lanc } = await supabase
      .from('lancamentos')
      .select('id, grupo_lancamento_jid, grupo_oferta_jid')
      .eq('id', lancamentoId)
      .single();

    const groupJid = tipo === 'lancamento' ? lanc?.grupo_lancamento_jid : lanc?.grupo_oferta_jid;
    if (!groupJid) return respond({ error: `grupo_${tipo}_jid not configured for this lancamento` }, 400);

    // 2. Get active Evolution API instance
    const { data: instances } = await supabase
      .from('evolution_config')
      .select('instance_name, api_url, api_key')
      .eq('ativo', true)
      .limit(1);

    if (!instances?.length) return respond({ error: 'No active Evolution API instance found' }, 400);

    const { instance_name, api_url, api_key } = instances[0];
    const headers = { 'apikey': api_key, 'Content-Type': 'application/json' };

    // 3. Fetch group participants from Evolution API (server-side, no CORS issues)
    let participants: string[] = [];
    const endpoints = [
      `${api_url}/group/findParticipants/${instance_name}?groupJid=${encodeURIComponent(groupJid)}`,
      `${api_url}/group/participants/${instance_name}?groupJid=${encodeURIComponent(groupJid)}`,
    ];

    for (const endpoint of endpoints) {
      let res: Response;
      try { res = await fetch(endpoint, { headers }); } catch (e) {
        console.warn(`fetch failed for ${endpoint}:`, e);
        continue;
      }
      if (!res.ok) { console.warn(`${endpoint} → ${res.status}`); continue; }

      const json = await res.json();
      console.log('Evolution API response sample:', JSON.stringify(json).slice(0, 300));

      // Handle various response shapes
      let raw: unknown[] = [];
      if (Array.isArray(json)) raw = json;
      else if (Array.isArray(json?.participants)) raw = json.participants;
      else if (Array.isArray(json?.data)) raw = json.data;
      else if (Array.isArray(json?.data?.participants)) raw = json.data.participants;

      participants = raw
        .map((p: any) => {
          // Handle both object and string entries
          if (typeof p === 'string') return p;
          return String(p?.id ?? p?.jid ?? p?.phone ?? p?.phoneNumber ?? p?.number ?? '');
        })
        .filter(s => /\d{8,}/.test(s));

      console.log(`Found ${participants.length} participants from ${endpoint}`);
      if (participants.length) break;
    }

    if (!participants.length) {
      return respond({ error: 'No participants returned from Evolution API. Check instance config and group JID.' }, 400);
    }

    // 4. Build suffix8 set
    const groupSuffix8 = new Set(participants.map(p => suffix8(p)));
    console.log(`suffix8 sample: ${[...groupSuffix8].slice(0, 5).join(', ')}`);

    // 5. Find kanban column
    const colunaId = await findColunaId(supabase, lancamentoId, tipo);
    const fieldName = tipo === 'lancamento' ? 'no_grupo' : 'grupo_oferta';

    // 6. Load all leads for this lancamento
    const { data: leads, error: leadsError } = await supabase
      .from('lancamento_leads')
      .select('id, whatsapp')
      .eq('lancamento_id', lancamentoId);

    if (leadsError) throw new Error(leadsError.message);
    if (!leads?.length) return respond({ ok: true, updated: 0, notFound: participants.length, total: 0 });

    console.log(`Loaded ${leads.length} leads. Sample whatsapps: ${leads.slice(0, 5).map(l => l.whatsapp).join(', ')}`);

    // 7. Match and update
    const matched = leads.filter(l => l.whatsapp && groupSuffix8.has(suffix8(l.whatsapp)));
    console.log(`Matched ${matched.length} leads`);

    const updates: Record<string, unknown> = { [fieldName]: true };
    if (colunaId) updates.fase = colunaId;

    const BATCH = 100;
    let updated = 0;
    for (let i = 0; i < matched.length; i += BATCH) {
      const ids = matched.slice(i, i + BATCH).map(l => l.id);
      const { error } = await supabase.from('lancamento_leads').update(updates).in('id', ids);
      if (!error) updated += ids.length;
    }

    return respond({
      ok: true,
      updated,
      notFound: participants.length - matched.length,
      total: leads.length,
      participants: participants.length,
    });

  } catch (e: unknown) {
    console.error('sync-grupo error:', (e as Error).message);
    return respond({ error: (e as Error).message }, 500);
  }
});
