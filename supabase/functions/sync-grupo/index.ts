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
  return String(o?.phoneNumber ?? o?.phone ?? o?.number ?? o?.id ?? o?.jid ?? '');
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
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`safeFetch ${res.status} ${url} body=${body.slice(0, 300)}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    console.warn(`safeFetch error/timeout ${url}:`, (e as Error).message);
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

type EvoInstance = { instance_name: string; api_url: string; api_key: string };

// Nem toda instancia ativa é membro do grupo de cada turma -- a Evolution API
// retorna "forbidden" quando a instancia consultada nao esta no grupo. Por isso
// tenta cada instancia ate achar uma que responda com participantes de verdade,
// em vez de assumir que a primeira "ativo=true" serve.
async function fetchParticipantsAnyInstance(
  instances: EvoInstance[],
  groupJid: string,
): Promise<{ raw: unknown[]; usedInstance: string | null }> {
  const enc = encodeURIComponent(groupJid);

  for (const inst of instances) {
    const evoHeaders = { 'apikey': inst.api_key, 'Content-Type': 'application/json' };
    const part = await safeFetch(`${inst.api_url}/group/participants/${inst.instance_name}?groupJid=${enc}`, { headers: evoHeaders });
    if (!part) continue;

    const raw = toRawList(part);
    if (raw.length) {
      console.log(`fetchParticipantsAnyInstance: sucesso via "${inst.instance_name}", ${raw.length} participantes`);
      return { raw, usedInstance: inst.instance_name };
    }
  }

  return { raw: [], usedInstance: null };
}

async function resolveParticipants(
  instances: EvoInstance[],
  groupJid: string,
): Promise<{ jids: string[]; usedInstance: string | null }> {
  const { raw, usedInstance } = await fetchParticipantsAnyInstance(instances, groupJid);

  const allJids = new Set<string>();
  raw.map(extractJid).filter(s => /\d{8,}/.test(s)).forEach(j => allJids.add(j));

  const phones = [...allJids].filter(isPhoneJid);
  const lids   = [...allJids].filter(isLid);
  console.log(`Combined: ${phones.length} phone JIDs, ${lids.length} @lid`);

  if (phones.length) return { jids: phones, usedInstance };

  if (lids.length && usedInstance) {
    const usedInst = instances.find(i => i.instance_name === usedInstance)!;
    console.log('All @lid — trying contacts resolution...');
    const resolved = await resolveLidsViaContacts(usedInst.api_url, usedInst.instance_name, { apikey: usedInst.api_key, 'Content-Type': 'application/json' }, lids);
    if (resolved.length) {
      console.log(`Resolved ${resolved.length}/${lids.length} via contacts`);
      return { jids: resolved, usedInstance };
    }

    console.log('Trying message history fallback...');
    const msgPhones = await resolveViaMessages(usedInst.api_url, usedInst.instance_name, groupJid, { apikey: usedInst.api_key, 'Content-Type': 'application/json' });
    if (msgPhones.length) {
      console.log(`Message history: ${msgPhones.length} unique senders`);
      return { jids: msgPhones, usedInstance };
    }

    return { jids: lids, usedInstance };
  }

  return { jids: [], usedInstance };
}

async function resolveViaMessages(
  api_url: string,
  instance_name: string,
  groupJid: string,
  evoHeaders: Record<string, string>,
): Promise<string[]> {
  const enc = encodeURIComponent(groupJid);

  const messageCandidates: Array<() => Promise<unknown | null>> = [
    () => safeFetch(`${api_url}/message/findMessages/${instance_name}`, {
      method: 'POST', headers: evoHeaders,
      body: JSON.stringify({ where: { key: { remoteJid: groupJid } }, limit: 200 }),
    }, 20000),
    () => safeFetch(`${api_url}/message/findMessages/${instance_name}`, {
      method: 'POST', headers: evoHeaders,
      body: JSON.stringify({ remoteJid: groupJid, limit: 200 }),
    }, 20000),
    () => safeFetch(
      `${api_url}/message/findMessages/${instance_name}?where[key][remoteJid]=${enc}&limit=200`,
      { headers: evoHeaders }, 20000,
    ),
  ];

  let messages: unknown[] = [];
  for (const attempt of messageCandidates) {
    const res = await attempt();
    if (res) {
      const p = res as Record<string, unknown>;
      const found = Array.isArray(res) ? res
        : Array.isArray(p?.messages) ? p.messages as unknown[]
        : Array.isArray(p?.data)     ? p.data as unknown[]
        : [];
      if (found.length) { messages = found; break; }
    }
  }

  if (!messages.length) { console.log('Message history: no messages found'); return []; }
  console.log(`Message history: ${messages.length} messages`);

  const senders = new Set<string>();
  for (const m of messages) {
    const msg = m as Record<string, unknown>;
    const key = msg?.key as Record<string, unknown> | undefined;
    const participant = String(key?.participant ?? msg?.participant ?? '');
    if (isPhoneJid(participant)) senders.add(participant);
  }

  return [...senders];
}

async function resolveLidsViaContacts(
  api_url: string,
  instance_name: string,
  evoHeaders: Record<string, string>,
  lids: string[],
): Promise<string[]> {
  let contactList: unknown[] = [];

  const candidates: Array<() => Promise<unknown | null>> = [
    () => safeFetch(`${api_url}/contact/findContacts/${instance_name}`, {
      method: 'POST', headers: evoHeaders, body: JSON.stringify({ where: {} }),
    }),
    () => safeFetch(`${api_url}/contact/fetchContacts/${instance_name}`, { headers: evoHeaders }),
    () => safeFetch(`${api_url}/contact/findContacts/${instance_name}`, { headers: evoHeaders }),
    () => safeFetch(`${api_url}/chat/findContacts/${instance_name}`, {
      method: 'POST', headers: evoHeaders, body: JSON.stringify({ where: {} }),
    }),
  ];

  for (const attempt of candidates) {
    const res = await attempt();
    if (res) {
      contactList = Array.isArray(res) ? res : toRawList(res);
      if (contactList.length) break;
    }
  }

  if (!contactList.length) return [];
  console.log(`Contacts fetched: ${contactList.length}. Sample:`, JSON.stringify(contactList.slice(0, 2)));

  const lidMap = new Map<string, string>();
  for (const c of contactList) {
    const contact = c as Record<string, unknown>;
    const phoneJid = String(contact.id ?? contact.jid ?? '');
    const lidVal   = String(contact.lid ?? contact.auxiliaryPhoneId ?? '');
    if (isPhoneJid(phoneJid) && lidVal) {
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

    const { data: lanc } = await supabase
      .from('lancamentos')
      .select('id, grupo_lancamento_jid, grupo_oferta_jid')
      .eq('id', lancamentoId)
      .single();

    const groupJid = tipo === 'lancamento' ? lanc?.grupo_lancamento_jid : lanc?.grupo_oferta_jid;
    if (!groupJid) return respond({ error: `grupo_${tipo}_jid not configured for this lancamento` }, 400);

    const { data: instances } = await supabase
      .from('evolution_config')
      .select('instance_name, api_url, api_key')
      .eq('ativo', true)
      .order('prioridade', { ascending: true });

    if (!instances?.length) return respond({ error: 'No active Evolution API instance found' }, 400);

    const { jids: participants, usedInstance } = await resolveParticipants(instances as EvoInstance[], groupJid);

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
        _debug: { sampleParticipants: participants.slice(0, 5), format: '@lid', usedInstance },
      }, 422);
    }

    const phoneParticipants = participants.filter(p => !isLid(p));
    const groupSuffix8 = new Set(phoneParticipants.map(p => suffix8(p)));
    console.log(`suffix8 set size: ${groupSuffix8.size}, sample: ${[...groupSuffix8].slice(0, 5).join(', ')}, usedInstance: ${usedInstance}`);

    const colunaId = await findColunaId(supabase, lancamentoId, tipo);
    const fieldName = tipo === 'lancamento' ? 'no_grupo' : 'grupo_oferta';

    const { data: leads, error: leadsError } = await supabase
      .from('lancamento_leads')
      .select('id, whatsapp')
      .eq('lancamento_id', lancamentoId);

    if (leadsError) throw new Error(leadsError.message);
    if (!leads?.length) return respond({ ok: true, updated: 0, notFound: phoneParticipants.length, total: 0 });

    console.log(`Leads: ${leads.length}. Sample: ${leads.slice(0, 3).map(l => l.whatsapp).join(', ')}`);

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
      usedInstance,
    });

  } catch (e: unknown) {
    console.error('sync-grupo error:', (e as Error).message);
    return respond({ error: (e as Error).message }, 500);
  }
});
