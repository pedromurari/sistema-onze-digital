import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

// ── Normalize phone to digits only ────────────────────────────────────────────

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Returns true if lead's phone matches any representation in the participants set */
function phoneInSet(leadPhone: string, participants: Set<string>): boolean {
  const n = normalizePhone(leadPhone);
  if (!n) return false;
  if (participants.has(n)) return true;
  // With Brazil code prefix variations
  if (n.startsWith('55') && participants.has(n.slice(2))) return true;
  if (!n.startsWith('55') && participants.has('55' + n)) return true;
  // Last 9 digits (remove area code variations)
  const last9 = n.slice(-9);
  for (const p of participants) {
    if (p.slice(-9) === last9) return true;
  }
  return false;
}

// ── Fetch participants from Evolution API ─────────────────────────────────────

async function fetchParticipants(
  base: string,
  instance: string,
  apikey: string,
  groupJid: string,
): Promise<Set<string>> {
  if (!groupJid || !groupJid.endsWith('@g.us')) return new Set();
  try {
    const url = `${base}/group/participants/${instance}?groupJid=${encodeURIComponent(groupJid)}`;
    const res = await fetch(url, { headers: { apikey } });
    if (!res.ok) {
      console.warn(`fetchParticipants: ${res.status} for ${groupJid}`);
      return new Set();
    }
    const data = await res.json();
    const set = new Set<string>();
    const list = Array.isArray(data) ? data : (data?.participants ?? []);
    for (const p of list) {
      const id = String(p.id ?? p.jid ?? '');
      const phone = normalizePhone(id.split('@')[0]);
      if (phone) set.add(phone);
    }
    console.log(`fetchParticipants: ${set.size} participantes em ${groupJid}`);
    return set;
  } catch (e) {
    console.warn(`fetchParticipants error (${groupJid}):`, (e as Error).message);
    return new Set();
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const cronSecret  = Deno.env.get('CRON_SECRET') ?? 'funil-processar-internal-2026';

    // Auth: Bearer JWT (UI) ou x-cron-key (pg_cron / cron externo)
    const authHeader   = req.headers.get('authorization') ?? '';
    const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
    const isCron = cronKeyHeader === cronSecret;
    if (!isCron && !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Evolution API ─────────────────────────────────────────────────────────
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

    let npaUpdated = 0;
    let lancUpdated = 0;

    // ── 1. NPA: verificar grupos Manhã + Tarde ────────────────────────────────
    const { data: npas } = await supabase
      .from('npa_eventos')
      .select('id, nome')
      .eq('ativo', true);

    for (const npa of (npas ?? [])) {
      // Pega funnel_configs para obter os JIDs dos grupos
      const { data: fConfig } = await supabase
        .from('funnel_configs')
        .select('grupo_1_id, grupo_2_id, variaveis')
        .eq('funnel_name', npa.nome)
        .maybeSingle();

      if (!fConfig) continue;

      const variaveis: Record<string, string> = (fConfig as any).variaveis ?? {};
      const jidManha = (fConfig as any).grupo_1_id || variaveis['grupo_manha'] || variaveis['grupo_1'] || '';
      const jidTarde = (fConfig as any).grupo_2_id || variaveis['grupo_tarde'] || variaveis['grupo_2'] || '';

      // Busca participantes de cada grupo
      const [participantesManha, participantesTarde] = await Promise.all([
        fetchParticipants(evoBase, evo.instance_name, evo.api_key, jidManha),
        fetchParticipants(evoBase, evo.instance_name, evo.api_key, jidTarde),
      ]);

      // Busca leads do NPA
      const { data: leads } = await supabase
        .from('npa_evento_leads')
        .select('id, whatsapp, turma, no_grupo')
        .eq('npa_evento_id', npa.id);

      for (const lead of (leads ?? [])) {
        const participants = lead.turma === 'tarde'
          ? participantesTarde
          : participantesManha.size > 0
            ? participantesManha
            : participantesTarde; // fallback para 'unica'

        const estaNoGrupo = phoneInSet(lead.whatsapp, participants);
        if (estaNoGrupo !== lead.no_grupo) {
          await supabase
            .from('npa_evento_leads')
            .update({ no_grupo: estaNoGrupo })
            .eq('id', lead.id);
          npaUpdated++;
        }
      }
    }

    // ── 2. Lançamento: verificar grupo de lançamento ──────────────────────────
    const { data: lancamentos } = await supabase
      .from('lancamentos')
      .select('id, nome, grupo_lancamento_jid, grupo_oferta_jid')
      .eq('ativo', true);

    for (const lanc of (lancamentos ?? [])) {
      const jidLanc = (lanc as any).grupo_lancamento_jid || '';
      if (!jidLanc) continue;

      const participantes = await fetchParticipants(evoBase, evo.instance_name, evo.api_key, jidLanc);
      if (participantes.size === 0) continue;

      // Busca leads do lançamento
      const { data: leads } = await supabase
        .from('lancamento_leads')
        .select('id, whatsapp, no_grupo')
        .eq('lancamento_id', (lanc as any).id);

      for (const lead of (leads ?? [])) {
        const estaNoGrupo = phoneInSet(lead.whatsapp, participantes);
        if (estaNoGrupo !== lead.no_grupo) {
          await supabase
            .from('lancamento_leads')
            .update({ no_grupo: estaNoGrupo })
            .eq('id', lead.id);
          lancUpdated++;
        }
      }
    }

    console.log(`verificar-grupos: NPA atualizados=${npaUpdated}, Lançamento atualizados=${lancUpdated}`);

    return new Response(JSON.stringify({ ok: true, npa_updated: npaUpdated, lanc_updated: lancUpdated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: unknown) {
    console.error('verificar-grupos error:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
