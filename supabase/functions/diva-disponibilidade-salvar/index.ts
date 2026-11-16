/**
 * diva-disponibilidade-salvar — o terapeuta do Divã salva a própria
 * disponibilidade (datas concretas dos próximos 30 dias) a partir do
 * painel público (/diva/terapeuta/:terapeutaId). Exige login (header
 * x-diva-token, emitido por diva-terapeuta-login) -- a identidade vem
 * sempre do token, nunca do corpo da requisição, então não dá pra
 * sobrescrever a agenda de outro terapeuta.
 *
 * POST com header x-diva-token, body { slots: [{ data: 'YYYY-MM-DD', horario_inicio: 'HH:MM', horario_fim: 'HH:MM' }] }
 * Substitui (replace) tudo que esse terapeuta tinha cadastrado como
 * "livre" dentro da janela de 30 dias a partir de hoje -- não dá pra
 * "adicionar um slot", sempre manda a lista completa do que ele quer
 * deixar disponível. Slots já marcados 'ocupado' (sessão vendida cruzada
 * com a agenda) são preservados, não entram nesse replace.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-diva-token',
};

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function hojeBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function somarDias(dataStr: string, dias: number): string {
  const d = new Date(`${dataStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

async function assinar(terapeutaId: string, expiraEm: number, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`diva-sessao:${terapeutaId}:${expiraEm}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

function compararConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verificarToken(token: string | null, secret: string): Promise<string | null> {
  if (!token) return null;
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [terapeutaId, expiraStr, assinatura] = partes;
  const expiraEm = Number(expiraStr);
  if (!terapeutaId || !expiraEm || !assinatura) return null;
  if (Math.floor(Date.now() / 1000) > expiraEm) return null;
  const esperado = await assinar(terapeutaId, expiraEm, secret);
  if (!compararConstante(esperado, assinatura)) return null;
  return terapeutaId;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return respond(405, { error: 'Método não permitido.' });

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const terapeutaId = await verificarToken(req.headers.get('x-diva-token'), serviceKey);
  if (!terapeutaId) return respond(401, { error: 'sessao_expirada' });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

    const body = await req.json();
    const slots = Array.isArray(body?.slots) ? body.slots : [];

    const { data: terapeuta, error: terapeutaError } = await supabase
      .from('diva_terapeutas')
      .select('id, status')
      .eq('id', terapeutaId)
      .maybeSingle();
    if (terapeutaError || !terapeuta) return respond(404, { error: 'Terapeuta não encontrado.' });
    if (terapeuta.status !== 'aprovado') return respond(403, { error: 'Terapeuta não está aprovado.' });

    const hoje = hojeBrasilia();
    const limite = somarDias(hoje, 30);

    const linhas = slots
      .filter((s: unknown) => {
        const slot = s as Record<string, unknown>;
        return typeof slot?.data === 'string' && typeof slot?.horario_inicio === 'string' && typeof slot?.horario_fim === 'string'
          && slot.data >= hoje && slot.data <= limite && slot.horario_fim > slot.horario_inicio;
      })
      .map((s: Record<string, unknown>) => ({
        terapeuta_id: terapeutaId,
        data: s.data as string,
        horario_inicio: s.horario_inicio as string,
        horario_fim: s.horario_fim as string,
      }));

    const { error: deleteError } = await supabase
      .from('diva_disponibilidade_dias')
      .delete()
      .eq('terapeuta_id', terapeutaId)
      .eq('status', 'livre')
      .gte('data', hoje)
      .lte('data', limite);
    if (deleteError) return respond(500, { error: deleteError.message });

    if (linhas.length > 0) {
      const { error: insertError } = await supabase
        .from('diva_disponibilidade_dias')
        .upsert(linhas, { onConflict: 'terapeuta_id,data,horario_inicio', ignoreDuplicates: true });
      if (insertError) return respond(500, { error: insertError.message });
    }

    return respond(200, { ok: true, salvos: linhas.length });
  } catch (error) {
    return respond(500, { error: 'Erro interno: ' + (error as Error).message });
  }
});
