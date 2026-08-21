export type ConnState = 'open' | 'close' | 'connecting' | 'loading' | 'unknown';

export interface EvolutionInstance {
  id: string;
  instance_name: string;
  api_url: string;
  api_key: string;
  ativo: boolean;
}

export const EVO_RESPOSTA_URL = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/evo-resposta';

function normalizarBase(apiUrl: string): string {
  const cru = apiUrl.replace(/\/$/, '');
  return /^https?:\/\//i.test(cru) ? cru : `https://${cru}`;
}

/** QR de pareamento da instancia. Null quando a Evolution nao devolve nada utilizavel. */
export async function fetchQrCode(inst: EvolutionInstance): Promise<string | null> {
  try {
    const res = await fetch(`${normalizarBase(inst.api_url)}/instance/connect/${inst.instance_name}`, {
      headers: { apikey: inst.api_key },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { base64?: string; code?: string; qrcode?: { base64?: string } };
    return String(json?.base64 ?? json?.qrcode?.base64 ?? json?.code ?? '') || null;
  } catch {
    return null;
  }
}

/**
 * Aponta o webhook da instancia pro evo-resposta. Sem isso a instancia conecta
 * mas nao entrega mensagem nenhuma pro sistema -- ou seja, o historico do Chat
 * fica vazio pra sempre. Tenta a rota v2 e cai pra v1.
 */
export async function configurarWebhookRespostas(inst: EvolutionInstance): Promise<boolean> {
  const base = normalizarBase(inst.api_url);
  const headers = { apikey: inst.api_key, 'Content-Type': 'application/json' };
  const payload = {
    enabled: true,
    url: EVO_RESPOSTA_URL,
    webhookByEvents: false,
    events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
  };

  try {
    const r = await fetch(`${base}/webhook/${inst.instance_name}`, {
      method: 'PUT', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) return true;
  } catch { /* tenta v1 */ }

  try {
    const r = await fetch(`${base}/webhook/set/${inst.instance_name}`, {
      method: 'POST', headers, body: JSON.stringify({ webhook: payload }), signal: AbortSignal.timeout(10_000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function fetchConnectionState(inst: EvolutionInstance): Promise<ConnState> {
  try {
    const res = await fetch(`${inst.api_url}/instance/connectionState/${inst.instance_name}`, {
      headers: { apikey: inst.api_key },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return 'unknown';
    const json = await res.json() as Record<string, unknown>;
    const inst = json?.instance as Record<string, unknown> | undefined;
    const state = String(inst?.state ?? json?.state ?? json?.connectionStatus ?? 'unknown').toLowerCase();
    if (state.includes('open')) return 'open';
    if (state.includes('connect')) return 'connecting';
    if (state.includes('close') || state.includes('logout')) return 'close';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
