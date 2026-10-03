import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Envio manual do Chat do Time Comercial.
 *
 * Esta função é separada do `evo-proxy` de propósito: o proxy continua sendo uma
 * allowlist de leitura/gestão, enquanto este ponto de escrita valida três coisas
 * antes de mandar qualquer mensagem: sessão real, permissão de edição no módulo e
 * vínculo entre usuário e instância. Assim a chave da Evolution nunca chega ao
 * navegador e uma vendedora não consegue escolher o número de outra pessoa.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function resposta(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function normalizarTelefone(raw: string): string {
  const digitos = raw.replace(/\D/g, '');
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
    return digitos.slice(2);
  }
  return digitos.slice(-11);
}

function baseEvolution(raw: string): string {
  const base = raw.replace(/\/$/, '');
  return /^https?:\/\//i.test(base) ? base : `https://${base}`;
}

function idDaMensagem(payload: any): string | null {
  return payload?.key?.id ?? payload?.data?.key?.id ?? payload?.message?.key?.id ?? null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta({ ok: false, error: 'Método não permitido.' }, 405);

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return resposta({ ok: false, error: 'Sessão ausente.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const comoUsuario = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const comoServico = createClient(supabaseUrl, serviceKey);

  try {
    const { data: authData, error: authError } = await comoUsuario.auth.getUser();
    const userId = authData.user?.id;
    if (authError || !userId) return resposta({ ok: false, error: 'Sessão inválida ou expirada.' }, 401);

    const entrada = await req.json() as {
      telefone?: string;
      mensagem?: string;
      evolution_config_id?: string;
    };
    const telefone = normalizarTelefone(String(entrada.telefone ?? ''));
    const mensagem = String(entrada.mensagem ?? '').trim();
    const evolutionConfigId = String(entrada.evolution_config_id ?? '');

    if (!/^\d{10,11}$/.test(telefone)) {
      return resposta({ ok: false, error: 'Telefone inválido.' }, 400);
    }
    if (!mensagem) return resposta({ ok: false, error: 'Digite uma mensagem.' }, 400);
    if (mensagem.length > 4096) {
      return resposta({ ok: false, error: 'A mensagem ultrapassa 4.096 caracteres.' }, 400);
    }
    if (!evolutionConfigId) {
      return resposta({ ok: false, error: 'Número de atendimento não informado.' }, 400);
    }

    const { data: podeEditar } = await comoUsuario.rpc('tem_permissao', {
      p_recurso: 'time_comercial',
      p_acao: 'editar',
    });
    if (podeEditar !== true) {
      return resposta({ ok: false, error: 'Sem permissão para enviar mensagens no Time Comercial.' }, 403);
    }

    const [{ data: vinculo }, { data: papel }] = await Promise.all([
      comoServico
        .from('lead_aquecimento_vendedores')
        .select('usuario_id, evolution_config_id')
        .eq('evolution_config_id', evolutionConfigId)
        .limit(1)
        .maybeSingle(),
      comoServico.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
    ]);

    if (!vinculo) {
      return resposta({ ok: false, error: 'Esse número não está vinculado ao Time Comercial.' }, 403);
    }
    const podeUsarNumeroDoTime = papel?.role === 'admin' || papel?.role === 'gestor';
    if (!podeUsarNumeroDoTime && vinculo.usuario_id !== userId) {
      return resposta({ ok: false, error: 'Esse número pertence a outra vendedora.' }, 403);
    }

    const { data: instancia, error: instanciaError } = await comoServico
      .from('evolution_config')
      .select('api_url, api_key, instance_name')
      .eq('id', evolutionConfigId)
      .maybeSingle();
    if (instanciaError || !instancia) {
      return resposta({ ok: false, error: 'Instância da Evolution não encontrada.' }, 404);
    }

    let evolutionResponse: any;
    try {
      // O histórico interno guarda o telefone sem DDI para conseguir agrupar as
      // conversas. A Evolution, porém, consulta a existência pelo número E.164;
      // sem o 55 ela monta `11...@s.whatsapp.net` e responde `exists: false`.
      const telefoneEvolution = `55${telefone}`;
      const envio = await fetch(
        `${baseEvolution(instancia.api_url)}/message/sendText/${encodeURIComponent(instancia.instance_name)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: instancia.api_key },
          body: JSON.stringify({ number: telefoneEvolution, text: mensagem, delay: 600 }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      const bruto = await envio.text();
      try { evolutionResponse = JSON.parse(bruto); } catch { evolutionResponse = { raw: bruto }; }
      if (!envio.ok) {
        return resposta({ ok: false, error: `Evolution ${envio.status}: ${bruto.slice(0, 180)}` }, 502);
      }
    } catch (error: unknown) {
      const mensagemErro = (error as Error).message;
      const ambiguo = /timeout|timed out|abort|network/i.test(mensagemErro);
      return resposta({
        ok: false,
        ambiguous: ambiguo,
        error: ambiguo
          ? 'A Evolution não confirmou o envio. Confira o WhatsApp antes de tentar novamente.'
          : mensagemErro,
      }, 502);
    }

    // Grava imediatamente para a vendedora enxergar a bolha sem esperar o echo do
    // webhook. Quando o echo chegar, `evolution_message_id` impede a duplicidade.
    const messageId = idDaMensagem(evolutionResponse);
    if (messageId) {
      const { data: existente } = await comoServico
        .from('whatsapp_mensagens')
        .select('id')
        .eq('evolution_message_id', messageId)
        .maybeSingle();
      if (!existente) {
        const { error } = await comoServico.from('whatsapp_mensagens').insert({
          telefone,
          direcao: 'enviada',
          conteudo: mensagem,
          tipo: 'text',
          origem: 'manual',
          evolution_instance: instancia.instance_name,
          evolution_message_id: messageId,
        });
        if (error && error.code !== '23505') console.error('chat-enviar/gravar:', error.message);
      }
    } else {
      const { error } = await comoServico.from('whatsapp_mensagens').insert({
        telefone,
        direcao: 'enviada',
        conteudo: mensagem,
        tipo: 'text',
        origem: 'manual',
        evolution_instance: instancia.instance_name,
      });
      if (error) console.error('chat-enviar/gravar-sem-id:', error.message);
    }

    return resposta({ ok: true, instance: instancia.instance_name, message_id: messageId });
  } catch (error: unknown) {
    console.error('chat-enviar:', (error as Error).message);
    return resposta({ ok: false, error: 'Não foi possível enviar a mensagem.' }, 500);
  }
});
