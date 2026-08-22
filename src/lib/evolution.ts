import { supabase } from '@/integrations/supabase/client';

/**
 * Conversa com a Evolution API através do servidor.
 *
 * Antes, cada tela lia `evolution_config.api_key` e chamava a Evolution direto do
 * navegador. Isso colocava a chave que manda WhatsApp em nome da empresa ao alcance de
 * qualquer pessoa logada — bastava abrir o painel de rede. Cinco telas faziam isso,
 * incluindo o chat que a vendedora usa.
 *
 * Agora o navegador diz o que quer e a edge function `evo-proxy` injeta a chave, depois
 * de conferir a permissão de quem pediu. A chave não sai mais do servidor.
 *
 * As rotas são uma allowlist no proxy — nada de envio de mensagem passa por aqui.
 * Disparo continua nas funções dedicadas, que têm controle de volume e registro.
 */

export type RotaEvolution =
  | 'qrcode'
  | 'estado_conexao'
  | 'listar_grupos'
  | 'participantes_grupo'
  | 'link_convite'
  | 'configurar_webhook'
  | 'configurar_webhook_v2';

export interface RespostaEvolution<T = unknown> {
  ok: boolean;
  status?: number;
  dados?: T;
  erro?: string;
}

export async function chamarEvolution<T = unknown>(
  rota: RotaEvolution,
  instanciaId: string,
  opcoes: { params?: Record<string, string>; corpo?: unknown } = {},
): Promise<RespostaEvolution<T>> {
  const { data, error } = await supabase.functions.invoke('evo-proxy', {
    body: {
      rota,
      instancia_id: instanciaId,
      params: opcoes.params ?? {},
      corpo: opcoes.corpo ?? null,
    },
  });

  if (error) {
    return { ok: false, erro: error.message };
  }

  const resposta = data as { ok?: boolean; status?: number; dados?: T; error?: string };
  if (resposta?.error) {
    return { ok: false, status: resposta.status, erro: resposta.error };
  }

  return { ok: resposta?.ok ?? false, status: resposta?.status, dados: resposta?.dados };
}

/**
 * Colunas de `evolution_config` que o navegador pode ler.
 *
 * `api_key` NÃO está aqui, e o banco também recusa — o privilégio de leitura dessa coluna
 * foi revogado para o papel `authenticated`. Pedir `select('*')` nesta tabela falha; use
 * esta constante.
 */
export const COLUNAS_EVOLUTION_VISIVEIS = 'id, instance_name, api_url, ativo, prioridade';
