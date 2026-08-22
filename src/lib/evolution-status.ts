import { chamarEvolution } from '@/lib/evolution';

export type ConnState = 'open' | 'close' | 'connecting' | 'loading' | 'unknown';

/**
 * Uma instância da Evolution, como o navegador pode enxergá-la.
 *
 * `api_key` NÃO está aqui, e isso é o ponto: a chave que manda WhatsApp em nome da
 * empresa não sai mais do servidor. O banco também recusa — o privilégio de leitura
 * dessa coluna foi revogado para `authenticated`. Todas as chamadas à Evolution passam
 * pela edge function `evo-proxy`, que confere a permissão de quem pediu e injeta a chave.
 */
export interface EvolutionInstance {
  id: string;
  instance_name: string;
  api_url: string;
  ativo: boolean;
}

export const EVO_RESPOSTA_URL = 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/evo-resposta';

/** QR de pareamento da instância. Null quando a Evolution não devolve nada utilizável. */
export async function fetchQrCode(inst: EvolutionInstance): Promise<string | null> {
  const r = await chamarEvolution<{ base64?: string; code?: string; qrcode?: { base64?: string } }>(
    'qrcode',
    inst.id,
  );
  if (!r.ok || !r.dados) return null;
  const d = r.dados;
  return String(d.base64 ?? d.qrcode?.base64 ?? d.code ?? '') || null;
}

/**
 * Aponta o webhook da instância para o `evo-resposta`. Sem isso a instância conecta mas
 * não entrega mensagem nenhuma ao sistema — o histórico do Chat fica vazio para sempre.
 *
 * A Evolution mudou essa rota entre versões: tenta a v2 e cai para a v1.
 */
export async function configurarWebhookRespostas(inst: EvolutionInstance): Promise<boolean> {
  const payload = {
    enabled: true,
    url: EVO_RESPOSTA_URL,
    webhookByEvents: false,
    events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
  };

  const v2 = await chamarEvolution('configurar_webhook_v2', inst.id, { corpo: payload });
  if (v2.ok) return true;

  const v1 = await chamarEvolution('configurar_webhook', inst.id, { corpo: { webhook: payload } });
  return v1.ok;
}

export async function fetchConnectionState(inst: EvolutionInstance): Promise<ConnState> {
  const r = await chamarEvolution<Record<string, unknown>>('estado_conexao', inst.id);
  if (!r.ok || !r.dados) return 'unknown';

  const json = r.dados;
  const instancia = json?.instance as Record<string, unknown> | undefined;
  const estado = String(
    instancia?.state ?? json?.state ?? json?.connectionStatus ?? 'unknown',
  ).toLowerCase();

  if (estado.includes('open')) return 'open';
  if (estado.includes('connect')) return 'connecting';
  if (estado.includes('close') || estado.includes('logout')) return 'close';
  return 'unknown';
}
