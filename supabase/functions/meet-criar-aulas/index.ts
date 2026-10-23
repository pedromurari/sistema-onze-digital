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

async function accessToken() {
  const body = new URLSearchParams({
    client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
    client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
    refresh_token: Deno.env.get('GOOGLE_REFRESH_TOKEN') ?? '',
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  if (!res.ok) throw new Error(`Google OAuth ${res.status}`);
  return (await res.json()).access_token as string;
}

type Aula = {
  id: string;
  data: string;
  horario_inicio: string | null;
  horario_fim: string | null;
  modulo: string | null;
  turmas: { nome: string } | null;
};

async function criarMeet(token: string, aula: Aula) {
  const inicio = `${aula.data}T${aula.horario_inicio!.slice(0, 5)}:00`;
  const fim = `${aula.data}T${(aula.horario_fim ?? aula.horario_inicio!).slice(0, 5)}:00`;
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Nome da turma no banco carrega um sufixo de dono/investidor pra uso interno
        // (ex: "Turma #02626/OnzeDS") -- o convite do Meet vai pro professor, sem
        // precisar expor de quem é a turma, só o número.
        summary: `${aula.modulo ?? 'Aula'} · ${(aula.turmas?.nome ?? 'Turma').split('/')[0].trim()}`,
        start: { dateTime: inicio, timeZone: 'America/Sao_Paulo' },
        end: { dateTime: fim, timeZone: 'America/Sao_Paulo' },
        conferenceData: {
          createRequest: { requestId: aula.id, conferenceSolutionKey: { type: 'hangoutsMeet' } },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Calendar ${res.status}`);
  const evento = await res.json();
  return evento.hangoutLink as string | undefined;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: headers(origin) });
  if (req.method !== 'POST') return reply({ erro: 'Método não permitido.' }, 405, origin);

  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return reply({ erro: 'Não autorizado.' }, 401, origin);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return reply({ erro: 'Não autorizado.' }, 401, origin);

  const { data: pode } = await userClient.rpc('tem_permissao', { p_recurso: 'pedagogico', p_acao: 'editar' });
  if (!pode) return reply({ erro: 'Sem permissão de Pedagógico.' }, 403, origin);

  const body = await req.json().catch(() => ({}));
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let query = admin
    .from('aulas')
    .select('id, data, horario_inicio, horario_fim, modulo, turmas(nome)')
    .is('link_meet', null)
    .eq('status', 'agendada')
    .not('horario_inicio', 'is', null);
  if (body.aula_id) query = query.eq('id', body.aula_id);

  const { data: aulas, error } = await query.order('data');
  if (error) return reply({ erro: error.message }, 500, origin);
  if (!aulas || aulas.length === 0) return reply({ criadas: 0, mensagem: 'Nenhuma aula pendente de Meet.' }, 200, origin);

  let token: string;
  try {
    token = await accessToken();
  } catch {
    return reply({ erro: 'Não foi possível autenticar no Google. Confira os secrets.' }, 502, origin);
  }

  const resultados: { aula_id: string; link?: string; erro?: string }[] = [];
  for (const aula of aulas as unknown as Aula[]) {
    try {
      const link = await criarMeet(token, aula);
      if (!link) {
        resultados.push({ aula_id: aula.id, erro: 'Google não devolveu o link.' });
        continue;
      }
      await admin.from('aulas').update({ link_meet: link }).eq('id', aula.id);
      resultados.push({ aula_id: aula.id, link });
    } catch (e) {
      resultados.push({ aula_id: aula.id, erro: e instanceof Error ? e.message : 'Erro desconhecido.' });
    }
  }

  return reply({ criadas: resultados.filter(r => r.link).length, resultados }, 200, origin);
});
