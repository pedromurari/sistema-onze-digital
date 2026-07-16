import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Gestor planeja os proximos dias e devolve o plano pro usuario -- escreve em
// conteudo_calendario (Operacoes > Calendario de Conteudo, ja existente no
// sistema) so os dias que ainda nao tem nada (nunca sobrescreve um dia ja
// produzido). O resumo/justificativa fica registrado como resposta de uma
// tarefa do Gestor, igual qualquer outra entrega da Equipe 11DS.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

const DIAS_A_PLANEJAR = 7;
const CADENCIA_FORMATO = ['tipografico', 'tipografico', 'fotografico', 'tipografico', 'tipografico', 'fotografico', 'tipografico'];

function hojeSaoPaulo(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

function addDias(dataISO: string, dias: number): string {
  const d = new Date(`${dataISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function calcularDia(pilares: string[], dataISO: string) {
  const diasDesdeEpoch = Math.floor(Date.parse(`${dataISO}T00:00:00Z`) / 86_400_000);
  const pilar = pilares.length ? pilares[diasDesdeEpoch % pilares.length] : null;
  const formato = CADENCIA_FORMATO[diasDesdeEpoch % CADENCIA_FORMATO.length];
  return { pilar, formato };
}

function desembrulharJSON(raw: string): Record<string, unknown> {
  return JSON.parse(raw) as Record<string, unknown>;
}

async function chamarGPT(openaiKey: string, systemPrompt: string, userPrompt: string): Promise<Record<string, unknown>> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`OpenAI chat error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as { choices: { message: { content: string } }[] };
  const raw = data.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI nao retornou conteudo');
  return desembrulharJSON(raw);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const authHeader    = req.headers.get('authorization') ?? '';
  const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
  let authorized = false;
  if (cronKeyHeader) {
    const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
    authorized = Boolean(cronSecret) && cronKeyHeader === cronSecret;
  }
  if (!authorized && authHeader.startsWith('Bearer ')) {
    const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
    authorized = Boolean(user);
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let tarefaId = '';
  let agenteId = '';

  try {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) throw new Error('OPENAI_API_KEY nao configurada nos Supabase Secrets');

    const { data: time } = await supabase.from('equipe_11ds_times').select('id').eq('slug', 'posts-criativos').single();
    const { data: gestor } = await supabase.from('equipe_11ds_agentes').select('id').eq('time_id', time?.id).eq('slug', 'gestor-midia').single();
    if (!gestor) throw new Error('Agente Gestor de Mídia nao encontrado');
    agenteId = gestor.id;

    const { data: tarefa, error: tarefaErr } = await supabase
      .from('equipe_11ds_tarefas')
      .insert({ agente_id: gestor.id, criado_por: null, tipo: 'avulso', cliente_id: null, ordem_texto: 'Planejar o calendário de conteúdo dos próximos dias.', status: 'em_andamento', iniciado_em: new Date().toISOString() })
      .select('id')
      .single();
    if (tarefaErr || !tarefa) throw new Error(`Falha ao criar tarefa: ${tarefaErr?.message}`);
    tarefaId = tarefa.id;

    await supabase.from('equipe_11ds_agentes').update({ status: 'trabalhando', status_texto: 'Planejando o calendário de conteúdo...', updated_at: new Date().toISOString() }).eq('id', gestor.id);

    const hoje = hojeSaoPaulo();
    const { data: clientes, error: clientesErr } = await supabase
      .from('conteudo_clientes')
      .select('id, nome, nicho, pilares_conteudo')
      .eq('ativo', true);
    if (clientesErr) throw new Error(`Falha ao listar clientes ativos: ${clientesErr.message}`);

    const resumos: string[] = [];
    let totalPlanejados = 0;

    for (const cliente of clientes ?? []) {
      const pilares = (cliente.pilares_conteudo ?? []) as string[];
      const dias = Array.from({ length: DIAS_A_PLANEJAR }, (_, i) => {
        const data = addDias(hoje, i);
        const { pilar, formato } = calcularDia(pilares, data);
        return { data, pilar, formato };
      });

      const { data: jaExistem } = await supabase
        .from('conteudo_calendario')
        .select('data_publicacao')
        .eq('cliente_id', cliente.id)
        .gte('data_publicacao', hoje)
        .lte('data_publicacao', addDias(hoje, DIAS_A_PLANEJAR - 1));
      const datasComPlano = new Set((jaExistem ?? []).map((r: any) => r.data_publicacao));
      const diasParaPlanejar = dias.filter(d => !datasComPlano.has(d.data));
      if (diasParaPlanejar.length === 0) {
        resumos.push(`${cliente.nome}: já estava planejado, nada novo pra fazer.`);
        continue;
      }

      const systemPrompt = [
        `Voce e o Gestor de Midia da agencia 11 Digital Strategy, planejando o calendario editorial dos proximos dias do cliente "${cliente.nome}" (nicho: ${cliente.nicho ?? 'não informado'}).`,
        `Pra cada dia da lista, o pilar e o formato JA ESTAO DECIDIDOS pelo calendario -- sua funcao e sugerir uma DIRECAO curta de tema (nao o texto final, a redacao de verdade acontece no dia, com pesquisa de tendencia fresca) coerente com aquele pilar, sem repetir direcoes entre os dias da lista.`,
        `REGRA DURA: o time so tem texto e imagem gerada/composta -- NUNCA sugira uma direcao que dependa de depoimento real de aluno, foto/video de pessoa real, prova social que nao existe no sistema, ou cobertura de evento que de fato aconteceu. Toda direcao tem que ser produzivel do zero (ideia, reflexao, reframe, mito x verdade, mecanismo, POV generico).`,
        `Dias a planejar (data | pilar | formato): ${diasParaPlanejar.map(d => `${d.data} | ${d.pilar ?? 'sem pilar'} | ${d.formato}`).join(' / ')}`,
        `Responda SOMENTE com um JSON: {"dias": [{"data": string, "tema_sugerido": string}], "resumo": string (2-3 frases explicando o raciocínio geral do plano pro dono da agência, em português)}`,
      ].join(' ');

      const resultado = await chamarGPT(openaiKey, systemPrompt, 'Planeje o calendário.');
      const diasPlano = (resultado.dias ?? []) as { data: string; tema_sugerido: string }[];
      const resumoCliente = String(resultado.resumo ?? '');

      const porData = new Map(diasPlano.map(d => [d.data, d.tema_sugerido]));
      const linhas = diasParaPlanejar.map(d => ({
        cliente_id: cliente.id,
        titulo: porData.get(d.data) || `Post (${d.pilar ?? 'sem pilar'})`,
        plataforma: 'instagram',
        formato: 'feed',
        status: 'ideia',
        data_publicacao: d.data,
        angulo: d.pilar,
        gerado_por: 'equipe_11ds',
      }));

      const { error: upsertErr } = await supabase
        .from('conteudo_calendario')
        .upsert(linhas, { onConflict: 'cliente_id,data_publicacao', ignoreDuplicates: true });
      if (upsertErr) {
        resumos.push(`${cliente.nome}: erro ao salvar o plano (${upsertErr.message}).`);
        continue;
      }

      totalPlanejados += linhas.length;
      resumos.push(`${cliente.nome} (${linhas.length} dias): ${resumoCliente}`);
    }

    const respostaFinal = resumos.length
      ? resumos.join('\n\n')
      : 'Nenhum cliente ativo pra planejar no momento.';

    await supabase.from('equipe_11ds_tarefas').update({
      status: 'concluido', resposta_texto: respostaFinal, concluido_em: new Date().toISOString(),
    }).eq('id', tarefaId);
    await supabase.from('equipe_11ds_agentes').update({ status: 'livre', status_texto: null, updated_at: new Date().toISOString() }).eq('id', gestor.id);

    return new Response(JSON.stringify({ ok: true, planejados: totalPlanejados }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: unknown) {
    const message = (e as Error).message ?? String(e);
    if (tarefaId) {
      await supabase.from('equipe_11ds_tarefas').update({ status: 'erro', erro_mensagem: message, concluido_em: new Date().toISOString() }).eq('id', tarefaId);
    }
    if (agenteId) {
      await supabase.from('equipe_11ds_agentes').update({ status: 'erro', status_texto: 'Deu erro na última tarefa', updated_at: new Date().toISOString() }).eq('id', agenteId);
    }
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
