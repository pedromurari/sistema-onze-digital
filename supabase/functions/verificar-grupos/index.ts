import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

// ── Helpers (mesma lógica robusta do sync-grupo) ──────────────────────────────

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
    if (!res.ok) { console.warn(`safeFetch ${res.status} ${url}`); return null; }
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    console.warn(`safeFetch timeout/error ${url}:`, (e as Error).message);
    return null;
  }
}

async function resolveLidsViaContacts(
  api_url: string, instance_name: string,
  evoHeaders: Record<string, string>, lids: string[],
): Promise<string[]> {
  let contactList: unknown[] = [];
  const candidates = [
    () => safeFetch(`${api_url}/contact/findContacts/${instance_name}`, { method: 'POST', headers: evoHeaders, body: JSON.stringify({ where: {} }) }),
    () => safeFetch(`${api_url}/contact/fetchContacts/${instance_name}`, { headers: evoHeaders }),
    () => safeFetch(`${api_url}/contact/findContacts/${instance_name}`, { headers: evoHeaders }),
  ];
  for (const attempt of candidates) {
    const res = await attempt();
    if (res) { contactList = Array.isArray(res) ? res : toRawList(res); if (contactList.length) break; }
  }
  if (!contactList.length) return [];
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
  return lids.map(l => lidMap.get(l) ?? '').filter(Boolean);
}

async function resolveParticipants(
  api_url: string, instance_name: string,
  groupJid: string, evoHeaders: Record<string, string>,
): Promise<string[]> {
  if (!groupJid || !groupJid.endsWith('@g.us')) return [];
  const enc = encodeURIComponent(groupJid);

  // Usa os mesmos dois endpoints do sync-grupo + fallback legado
  const [info, part] = await Promise.all([
    safeFetch(`${api_url}/group/findGroupInfos/${instance_name}?groupJid=${enc}`, { headers: evoHeaders }),
    safeFetch(`${api_url}/group/findParticipants/${instance_name}?groupJid=${enc}`, { headers: evoHeaders }),
  ]);
  const legacy = (!info && !part)
    ? await safeFetch(`${api_url}/group/participants/${instance_name}?groupJid=${enc}`, { headers: evoHeaders })
    : null;

  const allJids = new Set<string>();
  for (const json of [info, part, legacy]) {
    if (!json) continue;
    toRawList(json).map(extractJid).filter(s => /\d{8,}/.test(s)).forEach(j => allJids.add(j));
  }

  const phones = [...allJids].filter(isPhoneJid);
  const lids   = [...allJids].filter(isLid);
  console.log(`resolveParticipants(${groupJid}): ${phones.length} phones, ${lids.length} @lid`);

  if (phones.length) return phones;
  if (lids.length) {
    const resolved = await resolveLidsViaContacts(api_url, instance_name, evoHeaders, lids);
    if (resolved.length) return resolved;
    return lids;
  }
  return [];
}

function phoneInSuffix8Set(leadPhone: string, groupSuffix8: Set<string>): boolean {
  if (!leadPhone) return false;
  return groupSuffix8.has(suffix8(leadPhone));
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const cronSecret  = Deno.env.get('CRON_SECRET') ?? 'funil-processar-internal-2026';

    const authHeader    = req.headers.get('authorization') ?? '';
    const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
    const isCron = cronKeyHeader === cronSecret;
    if (!isCron && !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Aceita filtro opcional por nome do NPA (quando chamado manualmente pela UI)
    let filterNomeNpa: string | null = null;
    try {
      const body = await req.json().catch(() => ({}));
      filterNomeNpa = (body as any)?.nomeNpa ?? null;
    } catch { /* sem body — ok */ }

    const { data: evoRows } = await supabase
      .from('evolution_config')
      .select('api_url, api_key, instance_name')
      .eq('ativo', true)
      .order('prioridade', { ascending: true })
      .limit(1);

    if (!evoRows?.length) {
      return new Response(JSON.stringify({ error: 'Evolution API não configurada' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const evo = evoRows[0];
    const rawBase = evo.api_url.replace(/\/$/, '');
    const evoBase = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
    const evoHeaders = { 'apikey': evo.api_key, 'Content-Type': 'application/json' };

    let npaUpdated = 0;
    let lancUpdated = 0;
    const debugNpa: unknown[] = [];

    // ── 1. NPA ───────────────────────────────────────────────────────────────
    const npasQuery = supabase
      .from('npa_eventos')
      .select('id, nome')
      .eq('ativo', true);
    if (filterNomeNpa) npasQuery.eq('nome', filterNomeNpa);
    const { data: npas } = await npasQuery;

    for (const npa of (npas ?? [])) {
      const { data: fConfig } = await supabase
        .from('funnel_configs')
        .select('grupo_1_id, grupo_2_id, variaveis')
        .eq('funnel_name', npa.nome)
        .maybeSingle();

      if (!fConfig) {
        debugNpa.push({ npa: npa.nome, erro: 'funnel_configs não encontrado' });
        continue;
      }

      const variaveis: Record<string, string> = (fConfig as any).variaveis ?? {};
      const jidManha = (fConfig as any).grupo_1_id || variaveis['grupo_manha'] || variaveis['grupo_1'] || '';
      const jidTarde = (fConfig as any).grupo_2_id || variaveis['grupo_tarde'] || variaveis['grupo_2'] || '';

      const [partsManha, partsTarde] = await Promise.all([
        resolveParticipants(evoBase, evo.instance_name, jidManha, evoHeaders),
        resolveParticipants(evoBase, evo.instance_name, jidTarde, evoHeaders),
      ]);

      const s8Manha = new Set(partsManha.filter(isPhoneJid).map(suffix8));
      const s8Tarde = new Set(partsTarde.filter(isPhoneJid).map(suffix8));
      console.log(`NPA "${npa.nome}": manhã=${s8Manha.size} tarde=${s8Tarde.size}`);

      const { data: leads } = await supabase
        .from('npa_evento_leads')
        .select('id, whatsapp, turma, no_grupo')
        .eq('npa_evento_id', npa.id);

      let npaMatch = 0;
      for (const lead of (leads ?? [])) {
        const groupSet = lead.turma === 'tarde'
          ? s8Tarde
          : s8Manha.size > 0 ? s8Manha : s8Tarde;

        const estaNoGrupo = phoneInSuffix8Set(lead.whatsapp, groupSet);
        if (estaNoGrupo !== lead.no_grupo) {
          await supabase
            .from('npa_evento_leads')
            .update({ no_grupo: estaNoGrupo })
            .eq('id', lead.id);
          npaUpdated++;
          npaMatch++;
        }
      }

      debugNpa.push({
        npa: npa.nome,
        jid_manha: jidManha || '(não configurado)',
        jid_tarde: jidTarde || '(não configurado)',
        participantes_manha: partsManha.length,
        participantes_manha_phones: s8Manha.size,
        participantes_tarde: partsTarde.length,
        participantes_tarde_phones: s8Tarde.size,
        participantes_manha_amostra: [...s8Manha].slice(0, 3),
        participantes_tarde_amostra: [...s8Tarde].slice(0, 3),
        leads_total: leads?.length ?? 0,
        leads_amostra: leads?.slice(0, 3).map(l => ({ wpp: l.whatsapp, s8: suffix8(l.whatsapp), turma: l.turma })) ?? [],
        atualizados: npaMatch,
      });
    }

    // ── 2. Lançamentos ───────────────────────────────────────────────────────
    const { data: lancamentos } = await supabase
      .from('lancamentos')
      .select('id, nome, grupo_lancamento_jid, grupo_oferta_jid')
      .eq('ativo', true);

    for (const lanc of (lancamentos ?? [])) {
      const jidLanc   = (lanc as any).grupo_lancamento_jid || '';
      const jidOferta = (lanc as any).grupo_oferta_jid    || '';
      if (!jidLanc && !jidOferta) continue;

      const [partsLanc, partsOferta] = await Promise.all([
        jidLanc   ? resolveParticipants(evoBase, evo.instance_name, jidLanc,   evoHeaders) : Promise.resolve([]),
        jidOferta ? resolveParticipants(evoBase, evo.instance_name, jidOferta, evoHeaders) : Promise.resolve([]),
      ]);

      const s8Lanc   = new Set(partsLanc.filter(isPhoneJid).map(suffix8));
      const s8Oferta = new Set(partsOferta.filter(isPhoneJid).map(suffix8));
      if (!s8Lanc.size && !s8Oferta.size) continue;

      const { data: leads } = await supabase
        .from('lancamento_leads')
        .select('id, whatsapp, no_grupo, grupo_oferta')
        .eq('lancamento_id', (lanc as any).id);

      for (const lead of (leads ?? [])) {
        const noGrupo  = phoneInSuffix8Set(lead.whatsapp, s8Lanc);
        const noOferta = phoneInSuffix8Set(lead.whatsapp, s8Oferta);
        if (noGrupo !== lead.no_grupo || noOferta !== (lead as any).grupo_oferta) {
          await supabase
            .from('lancamento_leads')
            .update({ no_grupo: noGrupo, grupo_oferta: noOferta })
            .eq('id', lead.id);
          lancUpdated++;
        }
      }
    }

    console.log(`verificar-grupos: NPA=${npaUpdated}, Lançamento=${lancUpdated}`);

    return new Response(JSON.stringify({
      ok: true, npa_updated: npaUpdated, lanc_updated: lancUpdated,
      _debug: debugNpa,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: unknown) {
    console.error('verificar-grupos error:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
