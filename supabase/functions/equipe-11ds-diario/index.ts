import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supabase edge runtime expõe EdgeRuntime para tarefas em background
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

function hojeSaoPaulo(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Auth: x-cron-key (pg_cron) ou Bearer JWT (disparo manual pelo painel).
  // O secret nao fica em nenhuma variavel de ambiente/codigo — e' lido do Supabase Vault.
  const authHeader    = req.headers.get('authorization') ?? '';
  const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
  const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
  const isCron = Boolean(cronSecret) && cronKeyHeader === cronSecret;
  if (!isCron && !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { data: time, error: timeErr } = await supabase
      .from('equipe_11ds_times')
      .select('id')
      .eq('slug', 'posts-criativos')
      .single();
    if (timeErr || !time) throw new Error(`Time posts-criativos nao encontrado: ${timeErr?.message}`);

    const { data: agente, error: agenteErr } = await supabase
      .from('equipe_11ds_agentes')
      .select('id')
      .eq('time_id', time.id)
      .order('ordem')
      .limit(1)
      .single();
    if (agenteErr || !agente) throw new Error(`Agente Posts & Criativos nao encontrado: ${agenteErr?.message}`);

    const { data: clientes, error: clientesErr } = await supabase
      .from('conteudo_clientes')
      .select('id, nome')
      .eq('ativo', true);
    if (clientesErr) throw new Error(`Falha ao listar clientes ativos: ${clientesErr.message}`);
    if (!clientes || clientes.length === 0) {
      return new Response(JSON.stringify({ ok: true, criadas: 0, motivo: 'sem clientes ativos' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const hoje = hojeSaoPaulo();

    const [{ data: postsHoje }, { data: tarefasHoje }] = await Promise.all([
      supabase.from('conteudo_posts').select('cliente_id').eq('data_post', hoje),
      supabase.from('equipe_11ds_tarefas').select('cliente_id').eq('tipo', 'post_cliente').neq('status', 'erro').gte('created_at', `${hoje}T00:00:00`),
    ]);
    const jaTemPostHoje = new Set([
      ...(postsHoje ?? []).map(p => p.cliente_id),
      ...(tarefasHoje ?? []).map(t => t.cliente_id),
    ]);

    const pendentes = clientes.filter(c => !jaTemPostHoje.has(c.id));

    const tarefasCriadas: string[] = [];
    for (const cliente of pendentes) {
      const { data: tarefa, error: insertErr } = await supabase
        .from('equipe_11ds_tarefas')
        .insert({
          agente_id: agente.id,
          criado_por: null,
          tipo: 'post_cliente',
          cliente_id: cliente.id,
          ordem_texto: `Crie o post diário de hoje para o cliente ${cliente.nome}: escolha um tema relevante e alinhado com o nicho dele.`,
          status: 'pendente',
        })
        .select('id')
        .single();
      if (insertErr || !tarefa) {
        console.error(`Falha ao criar tarefa diaria para ${cliente.nome}:`, insertErr?.message);
        continue;
      }
      tarefasCriadas.push(tarefa.id);
    }

    // Dispara a execução de cada tarefa em background, sem bloquear a resposta do cron.
    const execucoes = tarefasCriadas.map(tarefaId =>
      fetch(`${supabaseUrl}/functions/v1/equipe-11ds-executar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-key': cronSecret },
        body: JSON.stringify({ tarefa_id: tarefaId }),
      }).catch(e => console.error(`Falha ao executar tarefa ${tarefaId}:`, e?.message ?? e)),
    );
    const task = Promise.all(execucoes);
    try { EdgeRuntime.waitUntil(task); } catch { await task; }

    return new Response(JSON.stringify({ ok: true, criadas: tarefasCriadas.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: unknown) {
    const message = (e as Error).message ?? String(e);
    console.error('equipe-11ds-diario error:', message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
