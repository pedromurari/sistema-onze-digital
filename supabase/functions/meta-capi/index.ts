/**
 * meta-capi
 * API de Conversões da Meta (Conversions API) para TODAS as páginas públicas
 * de captação -- hoje NPA (IDM Pelo Brasil) e Curso Gratuito / Semana do
 * Despertar. Cada produto roda numa conta de anúncio diferente e tem o seu
 * próprio dataset (pixel), então cada um tem o seu token.
 *
 * POR QUE EXISTE (21/11/2026): o pixel do navegador sozinho perde evento.
 * Bloqueador de anúncio, ITP do iOS e extensão de privacidade derrubam a
 * requisição antes dela sair da página -- e sem evento a campanha otimizada
 * por conversão não recebe sinal e o algoritmo não aprende. No NPA #24 São
 * Paulo isso foi ao extremo: o dataset não recebeu NENHUM evento do browser
 * enquanto o pixel da Turma 48, no MESMO app e no mesmo horário, recebia
 * centenas.
 *
 * O pixel do navegador continua ligado de propósito: os dois canais mandam o
 * MESMO `event_id` e a Meta deduplica -- quando os dois chegam conta uma vez
 * só, quando o do browser é bloqueado o do servidor salva a medição.
 *
 * Body: {
 *   dataset: 'npa' | 'curso',   // qual produto/pixel (default: 'npa')
 *   event_name, event_id, event_source_url,
 *   nome?, whatsapp?, email?,   // hasheados aqui, em claro nunca saem
 *   fbp?, fbc?, custom_data?, test_event_code?
 * }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GRAPH_VERSION = 'v21.0';

/**
 * Cada dataset tem pixel e token próprios. Token é por dataset mesmo: um
 * token do pixel do NPA não consegue postar no pixel do Curso Gratuito.
 * Gerados no Gerenciador de Eventos > Configurações > API de Conversões.
 */
const DATASETS: Record<string, { pixelId: string; tokenEnv: string }> = {
  npa:   { pixelId: '1165211125501519', tokenEnv: 'NPA_META_CAPI_TOKEN' },
  curso: { pixelId: '1472969447740954', tokenEnv: 'CURSO_META_CAPI_TOKEN' },
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** SHA-256 em hex, como a Meta exige nos campos de identificação. */
async function sha256(valor: string): Promise<string> {
  const bytes = new TextEncoder().encode(valor);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const normalizar = (v: string) => v.trim().toLowerCase();

/** Telefone: só dígitos, com DDI. A Meta descarta número sem código de país. */
function normalizarTelefone(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (d.length === 13 || d.length === 12) return d;
  if (d.length === 11 || d.length === 10) return `55${d}`;
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method !== 'POST') return json({ ok: false, erro: 'use POST' }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, erro: 'corpo inválido' }, 400); }

  const chave = typeof body.dataset === 'string' ? body.dataset : 'npa';
  const cfg = DATASETS[chave];
  if (!cfg) return json({ ok: false, erro: `dataset desconhecido: ${chave}` }, 400);

  const token = Deno.env.get(cfg.tokenEnv) ?? '';
  if (!token) return json({ ok: false, erro: `${cfg.tokenEnv} não configurado` }, 500);

  const eventName = typeof body.event_name === 'string' ? body.event_name : null;
  if (!eventName) return json({ ok: false, erro: 'event_name obrigatório' }, 400);

  // IP e user-agent reais do visitante: sem eles a Meta não casa o evento do
  // servidor com a pessoa, e a qualidade da correspondência despenca.
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || undefined;
  const userAgent = req.headers.get('user-agent') ?? undefined;

  const user_data: Record<string, unknown> = {};
  if (ip) user_data.client_ip_address = ip;
  if (userAgent) user_data.client_user_agent = userAgent;
  if (typeof body.fbp === 'string' && body.fbp) user_data.fbp = body.fbp;
  if (typeof body.fbc === 'string' && body.fbc) user_data.fbc = body.fbc;

  if (typeof body.email === 'string' && body.email.includes('@')) {
    user_data.em = [await sha256(normalizar(body.email))];
  }
  if (typeof body.whatsapp === 'string') {
    const tel = normalizarTelefone(body.whatsapp);
    if (tel) user_data.ph = [await sha256(tel)];
  }
  if (typeof body.nome === 'string' && body.nome.trim()) {
    const partes = normalizar(body.nome).split(/\s+/);
    if (partes[0]) user_data.fn = [await sha256(partes[0])];
    if (partes.length > 1) user_data.ln = [await sha256(partes[partes.length - 1])];
  }
  user_data.country = [await sha256('br')];

  const evento: Record<string, unknown> = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    user_data,
  };
  // event_id é o que permite deduplicar com o evento do pixel do navegador.
  if (typeof body.event_id === 'string' && body.event_id) evento.event_id = body.event_id;
  if (typeof body.event_source_url === 'string' && body.event_source_url) evento.event_source_url = body.event_source_url;
  if (body.custom_data && typeof body.custom_data === 'object') evento.custom_data = body.custom_data;

  const payload: Record<string, unknown> = { data: [evento] };
  if (typeof body.test_event_code === 'string' && body.test_event_code) {
    payload.test_event_code = body.test_event_code;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const texto = await res.text();
    if (!res.ok) {
      console.error(`meta-capi [${chave}]: Meta recusou o evento:`, res.status, texto.slice(0, 400));
      return json({ ok: false, status: res.status, resposta: texto.slice(0, 400) }, 502);
    }
    return json({ ok: true, dataset: chave, resposta: JSON.parse(texto) });
  } catch (e) {
    console.error(`meta-capi [${chave}]:`, (e as Error).message);
    return json({ ok: false, erro: (e as Error).message }, 500);
  }
});
