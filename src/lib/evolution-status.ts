export type ConnState = 'open' | 'close' | 'connecting' | 'loading' | 'unknown';

export interface EvolutionInstance {
  id: string;
  instance_name: string;
  api_url: string;
  api_key: string;
  ativo: boolean;
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
