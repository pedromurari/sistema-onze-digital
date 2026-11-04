/**
 * vip-grupo-importar
 * Importa os participantes de um grupo de WhatsApp (ex.: grupo VIP do
 * carrinho aberto de um lançamento) como leads do Time Comercial, vinculados
 * a uma vendedora. Pedido do Pedro 21/10/2026 (grupo VIP da Turma #46).
 *
 * Fluxo: resolve o link de convite -> pega o JID do grupo -> lista os
 * participantes -> ignora quem é admin (equipe) -> cria/atualiza um lead por
 * participante restante, sem duplicar quem já existe pelo telefone.
 *
 * Body: { invite_code: string, vendedor: string, lancamento_id?: string,
 *         canal?: string, produto?: string }
 * Sem auth (verify_jwt=false) -- uso interno, chamado direto por mim/ops.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if ((digits.length === 13 || digits.length === 12) && digits.startsWith('55')) return digits.slice(2);
  return digits.slice(-11);
}

function isPhoneJid(s: string): boolean {
  return s.endsWith('@s.whatsapp.net') || s.endsWith('@c.us');
}

function toRawList(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  const j = json as Record<string, unknown>;
  if (Array.isArray(j?.participants)) return j.participants as unknown[];
  if (Array.isArray(j?.data)) return j.data as unknown[];
  return [];
}

async function resolveLidsViaContacts(
  apiBase: string, instanceName: string, headers: Record<string, string>, lids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!lids.length) return map;
  let contactList: unknown[] = [];
  for (const attempt of [
    () => fetch(`${apiBase}/contact/findContacts/${instanceName}`, { method: 'POST', headers, body: JSON.stringify({ where: {} }) }),
    () => fetch(`${apiBase}/contact/fetchContacts/${instanceName}`, { headers }),
  ]) {
    try {
      const r = await attempt();
      if (!r.ok) continue;
      const j = await r.json();
      contactList = toRawList(j);
      if (contactList.length) break;
    } catch { /* tenta o próximo */ }
  }
  for (const c of contactList) {
    const contact = c as Record<string, unknown>;
    const phoneJid = String(contact.id ?? contact.jid ?? '');
    const lidVal = String(contact.lid ?? contact.auxiliaryPhoneId ?? '');
    if (isPhoneJid(phoneJid) && lidVal) {
      const key = lidVal.includes('@') ? lidVal : `${lidVal}@lid`;
      map.set(key, phoneJid);
    }
  }
  return map;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { invite_code, vendedor, lancamento_id, canal, produto } = body as {
      invite_code?: string; vendedor?: string; lancamento_id?: string; canal?: string; produto?: string;
    };
    if (!invite_code || !vendedor) return json({ ok: false, erro: 'invite_code e vendedor são obrigatórios' }, 400);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: evoRows } = await sb
      .from('evolution_config')
      .select('api_url, api_key, instance_name')
      .eq('ativo', true)
      .in('instance_name', ['Pedro', 'Instituto Despertamente', 'PM 02', 'disp3'])
      .order('instance_name');
    if (!evoRows?.length) return json({ ok: false, erro: 'Nenhuma instância Evolution ativa encontrada.' }, 400);

    const code = invite_code.includes('chat.whatsapp.com/') ? invite_code.split('chat.whatsapp.com/')[1].split(/[?/]/)[0] : invite_code;

    let grupoJid = '';
    let grupoNome = '';
    let instanceUsada = '';
    let erroResolver = '';

    for (const evo of evoRows) {
      const base = evo.api_url.replace(/\/$/, '');
      const apiBase = /^https?:\/\//i.test(base) ? base : `https://${base}`;
      const headers = { apikey: evo.api_key, 'Content-Type': 'application/json' };
      try {
        const r = await fetch(`${apiBase}/group/inviteInfo/${encodeURIComponent(evo.instance_name)}?inviteCode=${encodeURIComponent(code)}`, { headers });
        if (!r.ok) { erroResolver = `${evo.instance_name}: ${r.status}`; continue; }
        const j = await r.json();
        const id = j?.id ?? j?.jid ?? j?.groupJid ?? '';
        if (id) {
          grupoJid = String(id);
          grupoNome = String(j?.subject ?? j?.name ?? '');
          instanceUsada = evo.instance_name;
          break;
        }
        erroResolver = `${evo.instance_name}: resposta sem id`;
      } catch (e) {
        erroResolver = `${evo.instance_name}: ${(e as Error).message}`;
      }
    }

    if (!grupoJid) return json({ ok: false, erro: `Não consegui resolver o link do convite. Última tentativa: ${erroResolver}` }, 502);

    const enc = encodeURIComponent(grupoJid);
    let participantes: unknown[] = [];
    let instanciaParticipantes = '';
    const tentativas: string[] = [];

    for (const evo of evoRows) {
      const base = evo.api_url.replace(/\/$/, '');
      const apiBase = /^https?:\/\//i.test(base) ? base : `https://${base}`;
      const headers = { apikey: evo.api_key, 'Content-Type': 'application/json' };
      for (const path of [
        `/group/findParticipants/${evo.instance_name}?groupJid=${enc}`,
        `/group/participants/${evo.instance_name}?groupJid=${enc}`,
      ]) {
        try {
          const r = await fetch(`${apiBase}${path}`, { headers });
          if (!r.ok) { tentativas.push(`${evo.instance_name} ${path.split('/')[2].split('?')[0]}: ${r.status}`); continue; }
          const j = await r.json();
          const lista = Array.isArray(j) ? j : (j?.participants ?? j?.data ?? []);
          if (Array.isArray(lista) && lista.length > 0) { participantes = lista; instanciaParticipantes = evo.instance_name; break; }
          tentativas.push(`${evo.instance_name}: resposta vazia`);
        } catch (e) {
          tentativas.push(`${evo.instance_name}: ${(e as Error).message}`);
        }
      }
      if (participantes.length > 0) break;
    }

    if (participantes.length === 0) return json({ ok: false, erro: 'Grupo resolvido, mas nenhuma instância conseguiu listar os participantes (provavelmente nenhuma está dentro do grupo).', grupo: { jid: grupoJid, nome: grupoNome }, tentativas }, 502);

    const naoAdmins = participantes.filter((p) => {
      const o = p as Record<string, unknown>;
      const admin = o?.admin ?? o?.isAdmin ?? o?.isSuperAdmin;
      return !admin;
    });

    const rawIds = naoAdmins.map((p) => {
      const o = p as Record<string, unknown>;
      return String(o?.id ?? o?.jid ?? o?.phoneNumber ?? o?.number ?? '');
    });

    const lids = rawIds.filter(r => r.endsWith('@lid'));
    let lidMap = new Map<string, string>();
    if (lids.length) {
      const { data: todasInstancias } = await sb.from('evolution_config').select('api_url, api_key, instance_name').eq('ativo', true);
      for (const evoP of todasInstancias ?? []) {
        const pendentes = lids.filter(l => !lidMap.has(l));
        if (!pendentes.length) break;
        const baseP = evoP.api_url.replace(/\/$/, '');
        const apiBaseP = /^https?:\/\//i.test(baseP) ? baseP : `https://${baseP}`;
        const headersP = { apikey: evoP.api_key, 'Content-Type': 'application/json' };
        const achados = await resolveLidsViaContacts(apiBaseP, evoP.instance_name, headersP, pendentes);
        for (const [k, v] of achados) lidMap.set(k, v);
      }
    }

    const telefones = rawIds
      .map((raw) => {
        if (raw.endsWith('@lid')) {
          const resolvido = lidMap.get(raw);
          return resolvido ? normalizePhone(resolvido) : null;
        }
        return normalizePhone(raw);
      })
      .filter((p): p is string => !!p && p.length >= 10);

    const unicos = [...new Set(telefones)];

    const { data: existentes } = await sb.from('leads').select('id, telefone, whatsapp');
    const existentesSet = new Set((existentes ?? []).map(e => normalizePhone(String(e.telefone ?? e.whatsapp ?? ''))));

    const novos = unicos.filter(t => !existentesSet.has(t));

    let criados = 0;
    const erros: string[] = [];
    for (const tel of novos) {
      const { error } = await sb.from('leads').insert({
        nome: `Lead grupo VIP (${tel})`,
        telefone: tel,
        whatsapp: tel,
        vendedor,
        status: 'novo',
        canal: canal ?? 'grupo_vip',
        produto: produto ?? null,
        lancamento_id: lancamento_id ?? null,
        origem: `grupo_vip:${grupoNome || grupoJid}`,
      });
      if (error) erros.push(`${tel}: ${error.message}`);
      else criados++;
    }

    return json({
      ok: true,
      grupo: { jid: grupoJid, nome: grupoNome, instancia_convite: instanceUsada, instancia_participantes: instanciaParticipantes },
      participantes_total: participantes.length,
      nao_admins: naoAdmins.length,
      lids_sem_telefone_resolvido: lids.length - lidMap.size,
      telefones_unicos: unicos.length,
      ja_existiam: unicos.length - novos.length,
      criados,
      erros,
    });
  } catch (e) {
    return json({ ok: false, erro: (e as Error).message }, 500);
  }
});
