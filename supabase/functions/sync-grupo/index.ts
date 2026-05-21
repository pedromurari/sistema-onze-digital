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

function isPhoneJid(s: string): boolean {
  return s.endsWith('@s.whatsapp.net') || s.endsWith('@c.us');
}

function isLid(s: string): boolean {
  return s.endsWith('@lid');
}

function extractJid(p: unknown): string {
  if (typeof p === 'string') return p;
  const o = p as Record<string, unknown>;
  return String(o?.id ?? o?.jid ?? o?.phone ?? o?.phoneNumber ?? o?.number ?? '');
}

function toRawList(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  const j = json as Record<string, unknown>;
  if (Array.isArray(j?.participants)) return j.participants as unknown[];
  if (Array.isArray(j?.data)) return j.data as unknown[];
  if (Array.isArray((j?.data as Record<string, unknown>)?.participants))
    return (j.data as Record<string, unknown>).participants as unknown[];
  return [];
}

async function safeFetch(url: string, opts: RequestInit, timeoutMs = 15000): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) { console.warn(`${url} → ${res.status}`); return null; }
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    console.warn(`fetch error/timeout ${url}:`, (e as Error).message);
    return null;
  }
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

async function resolveParticipants(
  api_url: string,
  instance_name: string,
  groupJid: string,
  evoHeaders: Record<string, string>,
): Promise<string[]> {
  const enc = encodeURIComponent(groupJid);

  // Call both endpoints in parallel — whichever answers fastest wins
  const [info, part] = await Promise.all([
    safeFetch(`${api_url}/group/findGroupInfos/${instance_name}?groupJid=${enc}`, { headers: evoHeaders }),
    safeFetch(`${api_url}/group/findParticipants/${instance_name}?groupJid=${enc}`, { headers: evoHeaders }),
  ]);

  console.log('findGroupInfos sample:', JSON.stringify(info).slice(0, 300));
  console.log('findParticipants sample:', JSON.stringify(part).slice(0, 300));

  // Merge all JIDs from both responses
  const allJids = new Set<string>();
  for (const json of [info, part]) {
    if (!json) continue;
    toRawList(json).map(extractJid).filter(s => /\d{8,}/.test(s)).forEach(j => allJids.add(j));
  }

  const phones = [...allJids].filter(isPhoneJid);
  const lids   = [...allJids].filter(isLid);
  console.log(`Combined: ${phones.length} phone JIDs, ${lids.length} @lid`);

  if (phones.length) return phones;

  if (lids.length) {
    console.log('All @lid — trying contacts resolution...');
    const resolved = await resolveLidsViaContacts(api_url, instance_name, evoHeaders, lids);
    if (resolved.length) {
      console.log(`Resolved ${resolved.length}/${lids.length} via contacts`);
      return resolved;
    }
    return lids; // Return @lid so caller can report 422
  }

  return [];
}

// Build @lid → @s.whatsapp.net map from Evolution's contact store, then resolve
async function resolveLidsViaContacts(
  api_url: string,
  instance_name: string,
  evoHeaders: Record<string, string>,
  lids: string[],
): Promise<string[]> {
  // POST /contact/findContacts — some versions accept a where filter
  const postRes = await safeFetch(`${api_url}/contact/findContacts/${instance_name}`, {
    method: 'POST',
    headers: evoHeaders,
    body: JSON.stringify({ where: {} }),
  });

  let contactList: unknown[] = [];
  if (postRes) {
    contactList = Array.isArray(postRes) ? postRes : toRawList(postRes);
  } else {
    // Fallback: GET fetchContacts
    const getRes = await safeFetch(`${api_url}/contact/fetchContacts/${instance_name}`, { headers: evoHeaders });
    if (getRes) contactList = Array.isArray(getRes) ? getRes : toRawList(getRes);
  }

  if (!contactList.length) return [];
  console.log(`Contacts fetched: ${contactList.length}. Sample:`, JSON.stringify(contactList.slice(0, 2)));

  // Build lid → phone map: contacts may have a `lid` field alongside `id` (@s.whatsapp.net)
  const lidMap = new Map<string, string>();
  for (const c of contactList) {
    const contact = c as Record<string, unknown>;
    const phoneJid = String(contact.id ?? contact.jid ?? '');
    const lidVal   = String(contact.lid ?? contact.auxiliaryPhoneId ?? '');
    if (isPhoneJid(phoneJid) && lidVal) {
      // Normalize lid key
      const key = lidVal.includes('@') ? lidVal : `${lidVal}@lid`;
      lidMap.set(key, phoneJid);
    }
  }

  console.log(`lid map size: ${lidMap.size}`);
  return lids.map(l => lidMap.get(l) ?? '').filter(Boolean);
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
    const evoHeaders = { 'apikey': api_key, 'Content-Type': 'application/json' };

    // 3. Resolve participants (multi-strategy, @lid resolution included)
    const participants = await resolveParticipants(api_url, instance_name, groupJid, evoHeaders);

    if (!participants.length) {
      return respond({ error: 'No participants returned from Evolution API. Check instance config and group JID.' }, 400);
    }

    const allLid = participants.every(isLid);
    if (allLid) {
      return respond({
        error: 'Evolution API returned apenas IDs internos (@lid) e não foi possível resolver para números de telefone. ' +
               'Isso ocorre quando o WhatsApp usa protocolo multi-device. ' +
               'Reconecte a instância ou adicione os leads manualmente.',
        participants: participants.length,
        _debug: { sampleParticipants: participants.slice(0, 5), format: '@lid' },
      }, 422);
    }

    // 4. Build suffix8 set (only phone-format participants)
    const phoneParticipants = participants.filter(p => !isLid(p));
    const groupSuffix8 = new Set(phoneParticipants.map(p => suffix8(p)));
    console.log(`suffix8 set size: ${groupSuffix8.size}, sample: ${[...groupSuffix8].slice(0, 5).join(', ')}`);

    // 5. Find kanban column
    const colunaId = await findColunaId(supabase, lancamentoId, tipo);
    const fieldName = tipo === 'lancamento' ? 'no_grupo' : 'grupo_oferta';

    // 6. Load all leads
    const { data: leads, error: leadsError } = await supabase
      .from('lancamento_leads')
      .select('id, whatsapp')
      .eq('lancamento_id', lancamentoId);

    if (leadsError) throw new Error(leadsError.message);
    if (!leads?.length) return respond({ ok: true, updated: 0, notFound: phoneParticipants.length, total: 0 });

    console.log(`Leads: ${leads.length}. Sample: ${leads.slice(0, 3).map(l => l.whatsapp).join(', ')}`);

    // 7. Match and update
    const matched = leads.filter(l => l.whatsapp && groupSuffix8.has(suffix8(l.whatsapp)));
    console.log(`Matched: ${matched.length}`);

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
      notFound: phoneParticipants.length - matched.length,
      total: leads.length,
      participants: phoneParticipants.length,
    });

  } catch (e: unknown) {
    console.error('sync-grupo error:', (e as Error).message);
    return respond({ error: (e as Error).message }, 500);
  }
});
