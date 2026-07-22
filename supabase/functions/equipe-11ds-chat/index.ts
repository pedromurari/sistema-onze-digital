import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type TipoAcao = 'executar_tarefa' | 'gerar_proximo_post' | 'gerar_calendario';
type EstadoAcao = 'proposta' | 'confirmada' | 'cancelada' | 'concluida' | 'erro';
type ContextoDaOrdem = {
  tipo?: 'avulso' | 'post_cliente';
  cliente_id?: string | null;
  repetir_diariamente?: boolean;
};

type Agente = {
  id: string;
  nome: string;
  cargo: string | null;
  slug: string | null;
  responsabilidade: string | null;
  regras: string[] | null;
  aplica: string[] | null;
  executor_function: string | null;
};

type PlanoGPT = {
  resposta?: string;
  acao?: string;
  resumo?: string;
  ordem_texto?: string;
};

type AcaoPersistida = {
  id: string;
  agente_id: string;
  solicitante_id: string;
  tipo: TipoAcao;
  estado: EstadoAcao;
  resumo: string;
  payload: Record<string, unknown>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function textoLimpo(valor: unknown, limite = 4000) {
  return String(valor ?? '').trim().slice(0, limite);
}

function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function catalogoDoAgente(agente: Agente): TipoAcao[] {
  const acoes: TipoAcao[] = ['executar_tarefa'];
  if (agente.slug === 'nina-producao' || agente.slug === 'gestor-midia') {
    acoes.push('gerar_proximo_post');
  }
  if (agente.slug === 'gestor-midia') acoes.push('gerar_calendario');
  return acoes;
}

function parecePedidoExecutavel(texto: string) {
  return /\b(gere|gerar|crie|criar|faca|faça|execute|executar|prepare|preparar|analise|analisar|envie|enviar|monte|montar|publique|publicar|planeje|planejar|organize|organizar)\b/.test(normalizar(texto));
}

function planoDeterministico(texto: string, catalogo: TipoAcao[]): Required<PlanoGPT> {
  const pedido = normalizar(texto);
  if (catalogo.includes('gerar_proximo_post') && /proximo post|proxima publicacao|novo post/.test(pedido)) {
    return {
      resposta: 'Entendi. Posso preparar a próxima geração editorial.',
      acao: 'gerar_proximo_post',
      resumo: 'Gerar o próximo post para os clientes ativos, respeitando a alternância visual e ignorando gerações que já estejam em andamento.',
      ordem_texto: texto,
    };
  }
  if (catalogo.includes('gerar_calendario') && /calendario|planej.*proxim/.test(pedido)) {
    return {
      resposta: 'Entendi. Posso planejar os próximos dias editoriais.',
      acao: 'gerar_calendario',
      resumo: 'Gerar o calendário editorial dos próximos dias para os clientes ativos, sem sobrescrever dias já produzidos.',
      ordem_texto: texto,
    };
  }
  if (parecePedidoExecutavel(texto)) {
    return {
      resposta: 'Entendi o pedido e consigo encaminhá-lo para execução.',
      acao: 'executar_tarefa',
      resumo: `Executar a tarefa: ${textoLimpo(texto, 220)}`,
      ordem_texto: texto,
    };
  }
  return {
    resposta: 'Estou aqui. Diga o que você quer que eu faça e eu preparo uma confirmação antes de executar.',
    acao: 'nenhuma',
    resumo: '',
    ordem_texto: texto,
  };
}

function extrairJson(raw: string): PlanoGPT {
  const limpo = raw.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(limpo) as PlanoGPT; } catch { return {}; }
}

async function interpretarComGPT(
  openaiKey: string,
  agente: Agente,
  mensagem: string,
  historico: { papel: string; conteudo: string }[],
  catalogo: TipoAcao[],
): Promise<PlanoGPT> {
  const regras = (agente.regras ?? []).slice(0, 5).join(' | ') || 'Siga as regras registradas para o cargo.';
  const acoes = catalogo.join(', ');
  const systemPrompt = [
    `Você é ${agente.nome}, ${agente.cargo ?? 'agente da 11 Digital Strategy'}.`,
    `Responsabilidade: ${agente.responsabilidade ?? 'ajudar o usuário com o seu trabalho'}.`,
    `Regras: ${regras}.`,
    `Você conversa em português, entende intenção natural e NUNCA afirma que executou uma ação antes da confirmação do usuário.`,
    `Ações permitidas para este agente: ${acoes}.`,
    `Use gerar_proximo_post apenas para pedido de criar a próxima publicação; use gerar_calendario apenas para planejamento editorial; use executar_tarefa para pedidos operacionais compatíveis com o cargo; use nenhuma para conversa, dúvida ou pedido não executável.`,
    `Responda SOMENTE JSON: {"resposta": string, "acao": "nenhuma|executar_tarefa|gerar_proximo_post|gerar_calendario", "resumo": string, "ordem_texto": string}.`,
    `Se houver ação, resposta e resumo devem deixar claro que a confirmação ainda será necessária.`,
  ].join(' ');
  const contexto = historico.slice(-8).map(item => `${item.papel}: ${item.conteudo}`).join('\n');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Histórico recente:\n${contexto || '(sem histórico)'}\n\nNovo pedido: ${mensagem}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`GPT respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return extrairJson(String(data?.choices?.[0]?.message?.content ?? ''));
}

async function registrarMensagem(
  supabase: ReturnType<typeof createClient>,
  agenteId: string,
  solicitanteId: string,
  papel: 'usuario' | 'agente' | 'sistema',
  conteudo: string,
  acaoId?: string | null,
) {
  const { error } = await supabase.from('equipe_11ds_chat_mensagens').insert({
    agente_id: agenteId,
    solicitante_id: solicitanteId,
    papel,
    conteudo,
    acao_id: acaoId ?? null,
  });
  if (error) throw new Error(`Falha ao registrar conversa: ${error.message}`);
}

async function chamarFuncaoInterna(
  supabaseUrl: string,
  cronSecret: string,
  nome: string,
  body: Record<string, unknown>,
) {
  const res = await fetch(`${supabaseUrl}/functions/v1/${nome}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-key': cronSecret },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(raw) as Record<string, unknown>; } catch { data = { raw }; }
  if (!res.ok || data.ok === false) {
    throw new Error(String(data.error ?? `A função ${nome} respondeu ${res.status}`));
  }
  return data;
}

async function resolverCliente(
  supabase: ReturnType<typeof createClient>,
  clienteId: unknown,
) {
  if (!clienteId) return null;
  const { data, error } = await supabase.from('conteudo_clientes').select('id').eq('id', String(clienteId)).maybeSingle();
  if (error || !data) return null;
  return data.id as string;
}

async function executarTarefaConfirmada(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  cronSecret: string,
  agente: Agente,
  solicitanteId: string,
  payload: Record<string, unknown>,
) {
  const ordemTexto = textoLimpo(payload.ordem_texto, 4000);
  if (!ordemTexto) throw new Error('A proposta não contém uma ordem executável.');
  const clienteId = await resolverCliente(supabase, payload.cliente_id);
  if (payload.tipo === 'post_cliente' && !clienteId) {
    throw new Error('O cliente selecionado não está disponível para esta tarefa.');
  }
  const tipo = payload.tipo === 'post_cliente' ? 'post_cliente' : 'avulso';
  const repetir = Boolean(payload.repetir_diariamente);
  let recorrenteId: string | null = null;

  if (repetir) {
    const { data: recorrente, error: recorrenteErr } = await supabase
      .from('equipe_11ds_recorrentes')
      .insert({ agente_id: agente.id, criado_por: solicitanteId, tipo, cliente_id: tipo === 'post_cliente' ? clienteId : null, ordem_texto: ordemTexto, ativo: true })
      .select('id')
      .single();
    if (recorrenteErr || !recorrente) throw new Error(`Falha ao criar recorrência: ${recorrenteErr?.message ?? 'sem retorno'}`);
    recorrenteId = recorrente.id;
  }

  const { data: tarefa, error: tarefaErr } = await supabase
    .from('equipe_11ds_tarefas')
    .insert({
      agente_id: agente.id,
      criado_por: solicitanteId,
      tipo,
      cliente_id: tipo === 'post_cliente' ? clienteId : null,
      ordem_texto: ordemTexto,
      status: 'pendente',
      recorrente_id: recorrenteId,
    })
    .select('id')
    .single();
  if (tarefaErr || !tarefa) throw new Error(`Falha ao criar tarefa: ${tarefaErr?.message ?? 'sem retorno'}`);
  if (!agente.executor_function) throw new Error('Este agente ainda não tem uma função executora configurada.');

  await chamarFuncaoInterna(supabaseUrl, cronSecret, agente.executor_function, { tarefa_id: tarefa.id });
  return { tarefa_id: tarefa.id, recorrente_id: recorrenteId };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const authHeader = req.headers.get('authorization') ?? '';
  if (!supabaseUrl || !serviceRoleKey || !anonKey) return json({ ok: false, error: 'Configuração do Supabase ausente.' }, 500);
  if (!authHeader.startsWith('Bearer ')) return json({ ok: false, error: 'Não autenticado.' }, 401);

  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user) return json({ ok: false, error: 'Sessão inválida.' }, 401);

  try {
    const body = await req.json() as {
      operacao?: 'interpretar' | 'confirmar' | 'cancelar';
      agente_id?: string;
      mensagem?: string;
      acao_id?: string;
      contexto?: ContextoDaOrdem;
    };
    const operacao = body.operacao ?? 'interpretar';
    const agenteId = textoLimpo(body.agente_id, 80);
    if (!agenteId) return json({ ok: false, error: 'agente_id é obrigatório.' }, 400);

    const { data: agenteData, error: agenteError } = await service
      .from('equipe_11ds_agentes')
      .select('id, nome, cargo, slug, responsabilidade, regras, aplica, executor_function')
      .eq('id', agenteId)
      .single();
    if (agenteError || !agenteData) return json({ ok: false, error: 'Agente não encontrado.' }, 404);
    const agente = agenteData as Agente;

    if (operacao === 'interpretar') {
      const mensagem = textoLimpo(body.mensagem);
      if (!mensagem) return json({ ok: false, error: 'Mensagem é obrigatória.' }, 400);
      await registrarMensagem(service, agente.id, user.id, 'usuario', mensagem);

      const { data: historico } = await service
        .from('equipe_11ds_chat_mensagens')
        .select('papel, conteudo')
        .eq('agente_id', agente.id)
        .eq('solicitante_id', user.id)
        .order('created_at', { ascending: false })
        .limit(8);
      const catalogo = catalogoDoAgente(agente);
      const fallback = planoDeterministico(mensagem, catalogo);
      let plano = fallback;
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (openaiKey) {
        try {
          const interpretado = await interpretarComGPT(openaiKey, agente, mensagem, ((historico ?? []) as { papel: string; conteudo: string }[]).reverse(), catalogo);
          const acao = textoLimpo(interpretado.acao, 50) as TipoAcao | 'nenhuma';
          if ((acao === 'nenhuma' || catalogo.includes(acao)) && textoLimpo(interpretado.resposta)) {
            plano = {
              resposta: textoLimpo(interpretado.resposta, 1200),
              acao,
              resumo: textoLimpo(interpretado.resumo, 1200),
              ordem_texto: textoLimpo(interpretado.ordem_texto || mensagem),
            };
            if (acao !== 'nenhuma' && !plano.resumo) plano.resumo = fallback.resumo || `Executar: ${plano.ordem_texto}`;
          }
        } catch (gptError) {
          console.error('equipe-11ds-chat GPT fallback:', (gptError as Error).message);
        }
      }

      let proposta: Record<string, unknown> | null = null;
      if (plano.acao !== 'nenhuma' && catalogo.includes(plano.acao as TipoAcao)) {
        const contexto = body.contexto ?? {};
        const payload = {
          ordem_texto: plano.ordem_texto || mensagem,
          tipo: contexto.tipo === 'post_cliente' ? 'post_cliente' : 'avulso',
          cliente_id: contexto.cliente_id ?? null,
          repetir_diariamente: Boolean(contexto.repetir_diariamente),
        };
        const { data: acao, error: acaoError } = await service
          .from('equipe_11ds_chat_acoes')
          .insert({ agente_id: agente.id, solicitante_id: user.id, tipo: plano.acao, resumo: plano.resumo, payload })
          .select('id, tipo, estado, resumo, payload')
          .single();
        if (acaoError || !acao) throw new Error(`Falha ao preparar confirmação: ${acaoError?.message ?? 'sem retorno'}`);
        proposta = acao as Record<string, unknown>;
        const resposta = `${plano.resposta}\n\n${plano.resumo}\n\nConfirme para eu executar.`;
        await registrarMensagem(service, agente.id, user.id, 'agente', resposta, String(acao.id));
        return json({ ok: true, resposta, proposta });
      }

      const resposta = plano.resposta || fallback.resposta;
      await registrarMensagem(service, agente.id, user.id, 'agente', resposta);
      return json({ ok: true, resposta, proposta });
    }

    const acaoId = textoLimpo(body.acao_id, 80);
    if (!acaoId) return json({ ok: false, error: 'acao_id é obrigatório.' }, 400);
    const { data: acaoData, error: acaoError } = await service
      .from('equipe_11ds_chat_acoes')
      .select('id, agente_id, solicitante_id, tipo, estado, resumo, payload')
      .eq('id', acaoId)
      .eq('agente_id', agente.id)
      .eq('solicitante_id', user.id)
      .single();
    if (acaoError || !acaoData) return json({ ok: false, error: 'Proposta não encontrada.' }, 404);
    const acao = acaoData as AcaoPersistida;
    if (acao.estado !== 'proposta') return json({ ok: false, error: 'Esta proposta já foi tratada.' }, 409);

    if (operacao === 'cancelar') {
      await service.from('equipe_11ds_chat_acoes').update({ estado: 'cancelada', concluido_em: new Date().toISOString() }).eq('id', acao.id);
      const resposta = 'Certo, cancelei esta ação. Nada foi executado.';
      await registrarMensagem(service, agente.id, user.id, 'sistema', resposta, acao.id);
      return json({ ok: true, resposta, proposta: { ...acao, estado: 'cancelada' } });
    }
    if (operacao !== 'confirmar') return json({ ok: false, error: 'Operação inválida.' }, 400);
    if (!catalogoDoAgente(agente).includes(acao.tipo)) return json({ ok: false, error: 'Ação não permitida para este agente.' }, 403);

    await service.from('equipe_11ds_chat_acoes').update({ estado: 'confirmada', confirmado_em: new Date().toISOString() }).eq('id', acao.id);
    try {
      const { data: cronSecret } = await service.rpc('get_equipe_11ds_cron_secret');
      if (!cronSecret) throw new Error('Segredo interno da rotina não encontrado.');
      let resultado: Record<string, unknown>;
      let resposta: string;
      if (acao.tipo === 'gerar_proximo_post') {
        resultado = await chamarFuncaoInterna(supabaseUrl, String(cronSecret), 'equipe-11ds-diario', {});
        resposta = `Próximo post iniciado para ${Number(resultado.criadas ?? 0)} cliente(s).`;
      } else if (acao.tipo === 'gerar_calendario') {
        resultado = await chamarFuncaoInterna(supabaseUrl, String(cronSecret), 'equipe-11ds-calendario-executar', {});
        resposta = `Calendário atualizado com ${Number(resultado.planejados ?? 0)} dia(s) planejado(s).`;
      } else {
        resultado = await executarTarefaConfirmada(service, supabaseUrl, String(cronSecret), agente, user.id, acao.payload);
        resposta = 'Tarefa confirmada e enviada para execução.';
      }
      await service.from('equipe_11ds_chat_acoes').update({
        estado: 'concluida', resultado, erro_mensagem: null, concluido_em: new Date().toISOString(),
      }).eq('id', acao.id);
      await registrarMensagem(service, agente.id, user.id, 'sistema', resposta, acao.id);
      return json({ ok: true, resposta, proposta: { ...acao, estado: 'concluida', resultado } });
    } catch (execError) {
      const message = (execError as Error).message ?? String(execError);
      await service.from('equipe_11ds_chat_acoes').update({
        estado: 'erro', erro_mensagem: message, concluido_em: new Date().toISOString(),
      }).eq('id', acao.id);
      const resposta = `Não executei a ação: ${message}`;
      await registrarMensagem(service, agente.id, user.id, 'sistema', resposta, acao.id);
      return json({ ok: false, error: message, resposta, proposta: { ...acao, estado: 'erro' } });
    }
  } catch (error) {
    const message = (error as Error).message ?? String(error);
    console.error('equipe-11ds-chat error:', message);
    return json({ ok: false, error: message }, 500);
  }
});
