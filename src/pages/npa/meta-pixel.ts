// Meta Pixel (Facebook Ads) específico das turmas NPA (IDM Pelo Brasil) --
// pixel de ads próprio dessa campanha, diferente do pixel do Curso Gratuito/Webinário.
//
// MEDIÇÃO EM DOIS CANAIS (21/11/2026): só o pixel do navegador não dá conta.
// A campanha da NPA #24 São Paulo gastou verba com 14 cliques e o dataset não
// recebeu NENHUM evento do browser -- bloqueador de anúncio, ITP do iOS e
// extensão de privacidade derrubam o evento antes de sair da página. Sem
// evento, a campanha otimizada por Compra não recebe sinal e o algoritmo não
// aprende. Agora todo evento sai pelos dois caminhos: o pixel do navegador e
// a API de Conversões (servidor, edge function `npa-meta-capi`), os dois com
// o MESMO event_id -- é assim que a Meta deduplica e conta uma vez só.
const PIXEL_ID = '1165211125501519';
const FUNCTIONS_URL = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzcWl5ZWtmbXd3bnZrbWtkbGVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NTM5MTIsImV4cCI6MjA5MDEyOTkxMn0.HImguQINgMUvuetgIfDL3sr7KwhSWGoXvaNMKldxYmQ';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

let carregado = false;

export interface DadosPessoais {
  nome?: string;
  whatsapp?: string;
  email?: string;
}

function lerCookie(nome: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const achado = document.cookie.split('; ').find((c) => c.startsWith(`${nome}=`));
  return achado ? decodeURIComponent(achado.slice(nome.length + 1)) : undefined;
}

/**
 * _fbc é o identificador do clique no anúncio e é o que mais melhora o match
 * do evento do servidor. O cookie só existe depois que o fbevents.js roda --
 * se ele foi bloqueado, montamos o valor na mão a partir do fbclid da URL,
 * no formato que a Meta espera (fb.1.<timestamp>.<fbclid>).
 */
function obterFbc(): string | undefined {
  const doCookie = lerCookie('_fbc');
  if (doCookie) return doCookie;
  if (typeof window === 'undefined') return undefined;
  const fbclid = new URLSearchParams(window.location.search).get('fbclid');
  return fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined;
}

function novoEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Manda o evento pelo servidor. Best-effort: nunca trava nem quebra a página. */
function enviarCapi(
  evento: string,
  eventId: string,
  customData?: Record<string, unknown>,
  pessoa?: DadosPessoais,
) {
  try {
    const corpo = JSON.stringify({
      event_name: evento,
      event_id: eventId,
      event_source_url: typeof window !== 'undefined' ? window.location.href : undefined,
      fbp: lerCookie('_fbp'),
      fbc: obterFbc(),
      nome: pessoa?.nome,
      whatsapp: pessoa?.whatsapp,
      email: pessoa?.email,
      custom_data: customData,
    });
    void fetch(`${FUNCTIONS_URL}/npa-meta-capi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: corpo,
      // Sobrevive ao redirect pro checkout: sem keepalive o InitiateCheckout
      // morre junto com a página antes de chegar no servidor.
      keepalive: true,
    }).catch(() => { /* medição nunca derruba a experiência do usuário */ });
  } catch { /* idem */ }
}

export function carregarPixel() {
  if (carregado || typeof window === 'undefined') return;
  carregado = true;

  if (!window.fbq) {
    const f = window as unknown as Record<string, unknown>;
    const n: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[]; push?: unknown; loaded?: boolean; version?: string } =
      function (...args: unknown[]) {
        if (n.callMethod) n.callMethod(...args);
        else (n.queue ??= []).push(args);
      };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    f.fbq = n;

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }

  window.fbq?.('init', PIXEL_ID);

  // PageView também vai pelos dois canais. O _fbp acabou de ser criado pelo
  // fbevents, então é lido já no próximo tick.
  const eventId = novoEventId();
  window.fbq?.('track', 'PageView', {}, { eventID: eventId });
  setTimeout(() => enviarCapi('PageView', eventId), 300);
}

/**
 * Dispara um evento nos dois canais com o mesmo event_id.
 * `pessoa` só é usada pela API de Conversões (hash feito no servidor) -- nunca
 * vai pro pixel do navegador.
 */
export function trackPixel(evento: string, params?: Record<string, unknown>, pessoa?: DadosPessoais) {
  const eventId = novoEventId();
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', evento, params ?? {}, { eventID: eventId });
  }
  enviarCapi(evento, eventId, params, pessoa);
}
