/**
 * tmp-membros-reenviar -- dispara membros-liberar-acesso-aluno pra UM aluno,
 * lendo o MEMBROS_LIBERAR_KEY do ambiente (que nao sai dos secrets).
 * Uso pontual, atras da x-financeiro-key.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const FINANCEIRO_KEY = Deno.env.get('FINANCEIRO_INSTANCE_KEY') ?? 'financeiro-only-idm-2026';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-financeiro-key',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.headers.get('x-financeiro-key') !== FINANCEIRO_KEY) {
    return new Response(JSON.stringify({ erro: 'nao autorizado' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const body = await req.json().catch(() => ({})) as {
    alunoId?: string; enviarEmail?: boolean; enviarWhatsapp?: boolean;
  };
  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const r = await fetch(`${url}/functions/v1/membros-liberar-acesso-aluno`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${service}`,
      apikey: service,
      'x-cron-key': Deno.env.get('MEMBROS_LIBERAR_KEY') ?? '',
    },
    body: JSON.stringify({
      alunoId: body.alunoId,
      enviarEmail: body.enviarEmail ?? true,
      enviarWhatsapp: body.enviarWhatsapp ?? true,
    }),
  });
  const txt = await r.text();
  return new Response(JSON.stringify({ status: r.status, resposta: txt.slice(0, 1500) }, null, 1), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
