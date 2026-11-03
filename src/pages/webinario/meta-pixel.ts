// Meta Pixel (Facebook Ads) carregado só nas páginas públicas do Webinário --
// não no resto do CRM (índices internos nunca devem gerar PageView de pixel
// de ads). Mesmo ID de pixel já usado no site do Curso Gratuito (Turma 47).
const PIXEL_ID = '1472969447740954';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

let carregado = false;

export function carregarPixel() {
  if (carregado || typeof window === 'undefined') return;
  if (window.fbq) { carregado = true; return; }
  carregado = true;

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

  window.fbq?.('init', PIXEL_ID);
  window.fbq?.('track', 'PageView');
}

export function trackPixel(evento: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !window.fbq) return;
  window.fbq(params ? 'track' : 'trackCustom', evento, params ?? {});
}
