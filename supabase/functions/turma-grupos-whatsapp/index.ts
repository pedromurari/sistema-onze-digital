import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ORIGINS = new Set(['https://sistema.idmpsi.com.br', 'http://localhost:5173']);

function headers(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && ORIGINS.has(origin) ? origin : 'https://sistema.idmpsi.com.br',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
}

function reply(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers(origin), 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: headers(origin) });
  if (req.method !== 'POST') return reply({ erro: 'Método não permitido.' }, 405, origin);

  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return reply({ erro: 'Não autorizado.' }, 401, origin);

  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return reply({ erro: 'Não autorizado.' }, 401, origin);

  const body = await req.json().catch(() => ({}));
  const acao = body.acao as string;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  if (acao === 'listar') {
    const { data: pode } = await userClient.rpc('tem_permissao', { p_recurso: 'rh', p_acao: 'ver' });
    if (!pode) return reply({ erro: 'Sem permissão de RH.' }, 403, origin);

    const { data: config } = await admin.from('aviso_meet_config').select('instance_name').eq('id', 1).single();
    if (!config?.instance_name) return reply({ erro: 'Escolha a instância do WhatsApp primeiro.' }, 400, origin);
    const { data: evoRows } = await admin.from('evolution_config').select('api_url, api_key').eq('instance_name', config.instance_name).limit(1);
    const evo = evoRows?.[0];
    if (!evo) return reply({ erro: 'Instância não encontrada.' }, 400, origin);

    const base = (evo.api_url as string).replace(/\/$/, '');
    const host = /^https?:\/\//i.test(base) ? base : `https://${base}`;
    const res = await fetch(`${host}/group/fetchAllGroups/${encodeURIComponent(config.instance_name)}?getParticipants=false`, {
      headers: { apikey: evo.api_key as string },
    });
    if (!res.ok) return reply({ erro: `Evolution ${res.status}` }, 502, origin);
    const grupos = (await res.json()) as { id: string; subject: string }[];
    return reply({ grupos: grupos.map(g => ({ id: g.id, nome: g.subject })).sort((a, b) => a.nome.localeCompare(b.nome)) }, 200, origin);
  }

  if (acao === 'salvar') {
    const { data: pode } = await userClient.rpc('tem_permissao', { p_recurso: 'rh', p_acao: 'editar' });
    if (!pode) return reply({ erro: 'Sem permissão de RH.' }, 403, origin);
    const { error } = await admin.from('turmas').update({ grupo_whatsapp_jid: body.grupo_jid ?? null }).eq('id', body.turma_id);
    if (error) return reply({ erro: error.message }, 500, origin);
    return reply({ ok: true }, 200, origin);
  }

  return reply({ erro: 'Ação inválida.' }, 400, origin);
});
