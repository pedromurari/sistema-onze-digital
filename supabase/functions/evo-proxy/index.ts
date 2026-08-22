import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Proxy da Evolution API — para a chave de envio parar de sair do servidor.
 *
 * ── O PROBLEMA QUE ISTO RESOLVE ────────────────────────────────────────────
 * Até aqui, o navegador lia `evolution_config.api_key` e chamava a Evolution
 * direto: `fetch(url, { headers: { apikey: inst.api_key } })`. Cinco telas faziam
 * isso, incluindo o chat que a vendedora usa. Na prática, qualquer pessoa logada
 * conseguia a chave que manda WhatsApp em nome da empresa — bastava abrir o painel
 * de rede do navegador.
 *
 * Agora o navegador diz O QUE quer ("listar grupos da instância X") e o servidor
 * decide se pode e injeta a chave. A chave nunca chega ao cliente.
 *
 * ── SEGURANÇA ──────────────────────────────────────────────────────────────
 * 1. Exige um JWT válido e verifica a permissão do usuário na matriz de acesso —
 *    não basta estar logado.
 * 2. A lista de rotas é uma ALLOWLIST. Sem ela, o proxy viraria um caminho aberto
 *    para qualquer endpoint da Evolution, o que é pior do que o problema original.
 * 3. Nenhuma rota de envio de mensagem entra aqui. Disparo continua sendo das
 *    funções dedicadas (`wpp-enviar`, `disparo-runner`), que têm controle de
 *    volume e registro. Este proxy é só leitura de estado e gestão de grupo.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

/**
 * Rotas liberadas. A chave é o nome que o frontend pede; o valor monta o caminho
 * real na Evolution. Nada fora desta lista passa.
 *
 * `envia` marca rota que dispara mensagem — nenhuma está liberada aqui, e o campo
 * existe para que adicionar uma no futuro seja uma decisão consciente e visível.
 */
const ROTAS: Record<string, {
  metodo: 'GET' | 'POST' | 'PUT';
  caminho: (instancia: string, params: Record<string, string>) => string;
  recursos: string[];
  envia?: boolean;
}> = {
  qrcode: {
    metodo: 'GET',
    caminho: (i) => `/instance/connect/${encodeURIComponent(i)}`,
    recursos: ['settings', 'time_comercial'],
  },
  estado_conexao: {
    metodo: 'GET',
    caminho: (i) => `/instance/connectionState/${encodeURIComponent(i)}`,
    recursos: ['settings', 'time_comercial', 'disparos_monitor', 'lancamentos'],
  },
  listar_grupos: {
    metodo: 'GET',
    caminho: (i) => `/group/fetchAllGroups/${encodeURIComponent(i)}?getParticipants=false`,
    recursos: ['disparos_monitor', 'lancamentos', 'funil_lancamento'],
  },
  participantes_grupo: {
    metodo: 'GET',
    caminho: (i, p) =>
      `/group/participants/${encodeURIComponent(i)}?groupJid=${encodeURIComponent(p.grupo ?? '')}`,
    recursos: ['disparos_monitor', 'lancamentos', 'funil_lancamento'],
  },
  link_convite: {
    metodo: 'GET',
    caminho: (i, p) =>
      `/group/inviteCode/${encodeURIComponent(i)}?groupJid=${encodeURIComponent(p.grupo ?? '')}`,
    recursos: ['lancamentos', 'disparos_monitor', 'funil_lancamento'],
  },
  // A Evolution mudou a rota de webhook entre versoes. O cliente tenta a v2 e cai
  // para a v1 — as duas precisam existir aqui, senao instancia numa das versoes fica
  // sem webhook e o Chat nunca recebe mensagem.
  configurar_webhook_v2: {
    metodo: 'PUT',
    caminho: (i) => `/webhook/${encodeURIComponent(i)}`,
    recursos: ['settings'],
  },
  configurar_webhook: {
    metodo: 'POST',
    caminho: (i) => `/webhook/set/${encodeURIComponent(i)}`,
    recursos: ['settings'],
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const autorizacao = req.headers.get('Authorization') ?? '';
  if (!autorizacao) return json({ error: 'Sem autenticação.' }, 401);

  let rota: string, instanciaId: string, params: Record<string, string>, corpo: unknown;
  try {
    const entrada = await req.json();
    rota        = String(entrada.rota ?? '');
    instanciaId = String(entrada.instancia_id ?? '');
    params      = entrada.params ?? {};
    corpo       = entrada.corpo ?? null;
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  const definicao = ROTAS[rota];
  if (!definicao) return json({ error: `Rota não permitida: ${rota}` }, 403);
  if (definicao.envia) return json({ error: 'Envio não passa por este proxy.' }, 403);

  // ── Permissão do usuário, com o token DELE (respeita a matriz e a RLS) ────
  const comoUsuario = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: autorizacao } } },
  );

  let permitido = false;
  for (const recurso of definicao.recursos) {
    const { data } = await comoUsuario.rpc('tem_permissao', { p_recurso: recurso, p_acao: 'ver' });
    if (data === true) { permitido = true; break; }
  }
  if (!permitido) {
    return json({ error: 'Sem permissão para esta operação.' }, 403);
  }

  // ── A chave só é lida aqui, no servidor ───────────────────────────────────
  const comoServico = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: inst, error } = await comoServico
    .from('evolution_config')
    .select('instance_name, api_url, api_key')
    .eq('id', instanciaId)
    .maybeSingle();

  if (error || !inst) return json({ error: 'Instância não encontrada.' }, 404);

  const raiz = inst.api_url.replace(/\/$/, '');
  const base = /^https?:\/\//i.test(raiz) ? raiz : `https://${raiz}`;
  const url  = `${base}${definicao.caminho(inst.instance_name, params)}`;

  try {
    const resposta = await fetch(url, {
      method: definicao.metodo,
      headers: {
        apikey: inst.api_key,
        ...(definicao.metodo !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      },
      body: definicao.metodo !== 'GET' ? JSON.stringify(corpo ?? {}) : undefined,
      signal: AbortSignal.timeout(20_000),
    });

    const texto = await resposta.text();
    let dados: unknown;
    try { dados = JSON.parse(texto); } catch { dados = { raw: texto.slice(0, 500) }; }

    // Repassa o status da Evolution: quem chamou precisa distinguir "instância
    // desconectada" de "proxy fora do ar".
    return json({ ok: resposta.ok, status: resposta.status, dados }, resposta.ok ? 200 : 502);
  } catch (e) {
    return json({ error: `Falha ao falar com a Evolution: ${(e as Error).message}` }, 502);
  }
});
