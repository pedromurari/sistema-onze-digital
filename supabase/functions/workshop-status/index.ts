import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return json({ ok: false }, 405);
  const { inscricaoId } = await req.json().catch(() => ({}));
  if (typeof inscricaoId !== 'string' || !/^[a-f0-9-]{36}$/i.test(inscricaoId)) return json({ ok: false }, 400);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data } = await db.from('workshop_inscricoes').select('status').eq('id', inscricaoId).maybeSingle();
  return data ? json({ ok: true, status: data.status }) : json({ ok: false }, 404);
});
