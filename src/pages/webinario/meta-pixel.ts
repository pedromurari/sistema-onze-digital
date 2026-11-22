// Meta Pixel (Facebook Ads) das páginas públicas do Webinário e do Curso
// Gratuito / Semana do Despertar -- não do resto do CRM (índice interno nunca
// deve gerar PageView de pixel de ads). Conta de anúncio e pixel são
// diferentes dos do NPA, que tem o seu próprio em `src/pages/npa/meta-pixel.ts`.
//
// MEDIÇÃO EM DOIS CANAIS (21/11/2026): o pixel do navegador sozinho perde
// evento -- bloqueador de anúncio, ITP do iOS e extensão de privacidade
// derrubam a requisição antes dela sair da página. Aqui a perda não é total
// como foi no NPA (este pixel recebe centenas de eventos por dia), mas o que
// se perde é justamente o visitante mais difícil de atribuir. Agora todo
// evento sai também pela API de Conversões (edge function `meta-capi`), com o
// MESMO event_id: a Meta deduplica, então quando os dois chegam conta uma vez
// só, e quando o do browser é bloqueado o do servidor salva a medição.
const PIXEL_ID = '1472969447740954';
const DATASET = 'curso';
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
 * do evento do servidor. O cookie só nasce depois que o fbevents.js roda -- se
 * ele for bloqueado, montamos o valor a partir do fbclid da URL, no formato
 * que a Meta espera (fb.1.<timestamp>.<fbclid>).
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
    void fetch(`${FUNCTIONS_URL}/meta-capi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        dataset: DATASET,
        event_name: evento,
        event_id: eventId,
        event_source_url: typeof window !== 'undefined' ? window.location.href : undefined,
        fbp: lerCookie('_fbp'),
        fbc: obterFbc(),
        nome: pessoa?.nome,
        whatsapp: pessoa?.whatsapp,
        email: pessoa?.email,
        custom_data: customData,
      }),
      // Sobrevive à navegação: sem keepalive o evento morre junto com a página
      // quando ele é disparado logo antes de um redirect.
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

  const eventId = novoEventId();
  window.fbq?.('track', 'PageView', {}, { eventID: eventId });
  // Espera o fbevents criar o cookie _fbp antes de mandar pelo servidor.
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
