/**
 * npa-meta-capi
 * API de Conversões da Meta (Conversions API) para as páginas NPA / IDM Pelo Brasil.
 *
 * POR QUE EXISTE (21/11/2026): a campanha da NPA #24 São Paulo gastou verba
 * com 14 cliques e o dataset 1165211125501519 não recebeu NENHUM evento do
 * navegador -- o único evento do dia veio server-side do checkout. O pixel
 * está instalado e inicializado certo na página (conferido no navegador), mas
 * bloqueador de anúncio, iOS/ITP e extensão de privacidade derrubam o evento
 * antes dele sair do browser. Sem evento, a campanha otimizada por Compra não
 * recebe sinal nenhum e o algoritmo não aprende -- queima verba às cegas.
 *
 * A API de Conversões manda o mesmo evento pelo servidor, onde nada bloqueia.
 * O pixel do navegador continua ligado de propósito: os dois mandam o MESMO
 * `event_id`, e a Meta deduplica (quando os dois chegam, conta uma vez só;
 * quando o do browser é bloqueado, o do servidor salva a medição).
 *
 * Body: {
 *   event_name: 'PageView' | 'ViewContent' | 'Lead' | 'InitiateCheckout' | ...,
 *   event_id: string,          // mesmo ID usado no fbq(..., {eventID}) -- deduplicação
 *   event_source_url: string,
 *   nome?, whatsapp?, email?,  // hasheados aqui no servidor, nunca saem em claro
 *   fbp?, fbc?,                // cookies _fbp/_fbc do navegador (melhoram muito o match)
 *   custom_data?: Record<string, unknown>,
 *   test_event_code?: string,  // só pra aba "Eventos de teste" do Gerenciador
 * }
 *
 * Dados pessoais vão SEMPRE em SHA-256, como a Meta exige -- e-mail e telefone
 * em claro nunca saem daqui.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GRAPH_VERSION = 'v21.0';
const PIXEL_ID = Deno.env.get('NPA_META_PIXEL_ID') ?? '1165211125501519';
// Token dedicado do dataset, gerado no Gerenciador de Eventos > Configurações >
// API de Conversões. O META_MARKETING_ACCESS_TOKEN (system user "dados-sistema
// 11ds") NÃO serve aqui: ele tem ads_management/ads_read mas nenhum acesso ao
// dataset 1165211125501519 -- a Meta responde "Missing perms" (conferido em
// 21/11/2026). Fallback mantido só pro caso de alguém dar essa permissão ao
// system user depois.
const META_TOKEN = Deno.env.get('NPA_META_CAPI_TOKEN') || Deno.env.get('META_MARKETING_ACCESS_TOKEN') || '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** SHA-256 em hex, como a Meta exige pros campos de identificação. */
async function sha256(valor: string): Promise<string> {
  const bytes = new TextEncoder().encode(valor);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Normalização exigida pela Meta antes do hash: minúsculo, sem espaço nas pontas. */
const normalizar = (v: string) => v.trim().toLowerCase();

/** Telefone: só dígitos, com DDI. A Meta descarta número sem código de país. */
function normalizarTelefone(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (d.length === 13 || d.length === 12) return d;      // já tem 55
  if (d.length === 11 || d.length === 10) return `55${d}`;
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method !== 'POST') return json({ ok: false, erro: 'use POST' }, 405);
  if (!META_TOKEN) return json({ ok: false, erro: 'META_MARKETING_ACCESS_TOKEN não configurado' }, 500);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, erro: 'corpo inválido' }, 400); }

  const eventName = typeof body.event_name === 'string' ? body.event_name : null;
  if (!eventName) return json({ ok: false, erro: 'event_name obrigatório' }, 400);

  // IP e user-agent reais do visitante: sem eles a Meta não consegue casar o
  // evento do servidor com a pessoa, e a qualidade da correspondência despenca.
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
  // event_id é o que permite a Meta deduplicar com o evento do pixel do
  // navegador. Sem ele, um visitante não bloqueado contaria duas vezes.
  if (typeof body.event_id === 'string' && body.event_id) evento.event_id = body.event_id;
  if (typeof body.event_source_url === 'string' && body.event_source_url) evento.event_source_url = body.event_source_url;
  if (body.custom_data && typeof body.custom_data === 'object') evento.custom_data = body.custom_data;

  const payload: Record<string, unknown> = { data: [evento] };
  if (typeof body.test_event_code === 'string' && body.test_event_code) {
    payload.test_event_code = body.test_event_code;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(META_TOKEN)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const texto = await res.text();
    if (!res.ok) {
      console.error('npa-meta-capi: Meta recusou o evento:', res.status, texto.slice(0, 400));
      return json({ ok: false, status: res.status, resposta: texto.slice(0, 400) }, 502);
    }
    return json({ ok: true, resposta: JSON.parse(texto) });
  } catch (e) {
    console.error('npa-meta-capi:', (e as Error).message);
    return json({ ok: false, erro: (e as Error).message }, 500);
  }
});
