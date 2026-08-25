import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Atribui automaticamente um vendedor a um lead do canal Direto, intercalando
// entre os vendedores cadastrados (rodízio atômico via time_comercial_proximo_indice,
// migration time_comercial_rodizio_vendedor). Chamado pelo site lead-direto
// (WhatsAppLeadModal / página-ponte /obrigado) via api/atribuir-vendedor --
// nunca direto do navegador, a chave (WEBHOOK_API_KEY) fica só no servidor
// do site.
//
// Grava leads.vendedor de verdade -- o lead some da fila "sem vendedor" do
// Kanban assim que atribuído, pra evitar os dois vendedores puxando o mesmo
// lead ao mesmo tempo. Idempotente: se o lead já tem vendedor (retry do
// cliente), devolve o mesmo em vez de girar o rodízio de novo -- importante
// porque isso afeta comissão de vendedor.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Mesma ordem/nomes do INITIAL_VENDORS em TimeComercial.tsx -- se o time mudar,
// atualizar os dois lugares.
const VENDEDORES_DIRETO = [
  { nome: 'Helen Magna', telefone: '5511965781940' },
  { nome: 'Miguel Fogaça', telefone: '5511932203852' },
] as const;

const BodySchema = z.object({
  lead_id: z.string().uuid(),
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
    const validApiKey = Deno.env.get('WEBHOOK_API_KEY');

    if (!validApiKey) {
      console.error('WEBHOOK_API_KEY environment variable is not configured');
      return jsonResponse({ error: 'Server configuration error' }, 500);
    }

    if (!apiKey || apiKey !== validApiKey) {
      return jsonResponse({ error: 'Unauthorized', message: 'Invalid or missing X-API-Key header' }, 401);
    }

    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed. Use POST.' }, 405);
    }

    const bodyText = await req.text();
    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(bodyText);
    } catch {
      return jsonResponse({ error: 'Invalid JSON', message: 'Request body must be valid JSON' }, 400);
    }

    const parseResult = BodySchema.safeParse(rawPayload);
    if (!parseResult.success) {
      return jsonResponse({
        error: 'Validation failed',
        details: parseResult.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
      }, 400);
    }

    const { lead_id } = parseResult.data;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing Supabase environment variables');
      return jsonResponse({ error: 'Server configuration error' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('id, canal, origem, vendedor')
      .eq('id', lead_id)
      .maybeSingle();

    if (leadError || !lead) {
      return jsonResponse({ error: 'Lead not found' }, 404);
    }

    if (lead.origem !== 'Time Comercial' || lead.canal !== 'Direto') {
      return jsonResponse({ error: 'Lead fora do escopo desse rodízio (canal/origem não batem)' }, 422);
    }

    // Idempotente: já tem vendedor -- devolve o que já está, sem girar o rodízio.
    if (lead.vendedor) {
      const existente = VENDEDORES_DIRETO.find((v) => v.nome === lead.vendedor);
      if (existente) {
        return jsonResponse({ vendedor: existente.nome, telefone: existente.telefone }, 200);
      }
      return jsonResponse({ error: 'Lead já tem vendedor fora do rodízio automático' }, 409);
    }

    const { data: idx, error: rpcError } = await supabaseAdmin.rpc('time_comercial_proximo_indice', {
      p_canal: 'Direto',
      p_total: VENDEDORES_DIRETO.length,
    });

    if (rpcError || idx === null || idx === undefined) {
      console.error('Falha ao girar o rodízio:', rpcError);
      return jsonResponse({ error: 'Falha ao girar o rodízio' }, 500);
    }

    const escolhido = VENDEDORES_DIRETO[Number(idx) % VENDEDORES_DIRETO.length];

    // .is('vendedor', null) garante que não sobrescreve uma atribuição/claim
    // que tenha acontecido bem no meio tempo entre o select acima e este update.
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('leads')
      .update({ vendedor: escolhido.nome })
      .eq('id', lead_id)
      .is('vendedor', null)
      .select('id, vendedor')
      .maybeSingle();

    if (updateError) {
      console.error('Falha ao atribuir vendedor:', updateError);
      return jsonResponse({ error: 'Falha ao atribuir vendedor' }, 500);
    }

    if (!updated) {
      // Corrida rara: alguém atribuiu no meio tempo. Devolve quem ficou, sem
      // reclamar outro slot do rodízio pra esse lead.
      const { data: leadAtual } = await supabaseAdmin.from('leads').select('vendedor').eq('id', lead_id).maybeSingle();
      const vendedorAtual = VENDEDORES_DIRETO.find((v) => v.nome === leadAtual?.vendedor);
      if (vendedorAtual) {
        return jsonResponse({ vendedor: vendedorAtual.nome, telefone: vendedorAtual.telefone }, 200);
      }
      return jsonResponse({ error: 'Lead já foi atribuído fora do rodízio' }, 409);
    }

    console.log('Vendedor atribuído via rodízio:', lead_id, '->', escolhido.nome);

    return jsonResponse({ vendedor: escolhido.nome, telefone: escolhido.telefone }, 200);
  } catch (error) {
    console.error('Erro ao atribuir vendedor:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
