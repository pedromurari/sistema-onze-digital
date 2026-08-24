import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Endpoint de captação pro funil "Time Comercial" (Helen/Miguel/Aline) — usado por
// formulários externos (landing page da Semana do Despertar, formação em Psicanálise
// via lead-direto, n8n, Zapier etc.). Diferente de webhook-leads/index.ts: aqui origem
// é sempre 'Time Comercial', o lead cai na etapa de entrada do funil do canal (ver
// TimeComercial.tsx), e o produto de interesse (curso_interesse) é obrigatório — sem
// ele o vendedor não sabe qual condição/turma seguir na negociação.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_PAYLOAD_SIZE = 10000;

const CANAIS_VALIDOS = ['SDD', 'Direto', 'Webinário', 'Workshop', 'Retorno/Base', 'Orgânico'] as const;

const LeadInputSchema = z.object({
  nome: z.string().max(100).optional(),
  name: z.string().max(100).optional(),
  email: z.string().email().max(255).optional().or(z.literal('')),
  telefone: z.string().max(30).optional(),
  phone: z.string().max(30).optional(),
  whatsapp: z.string().max(30).optional(),
  produto: z.string().max(200).optional(),
  curso_interesse: z.string().max(200).optional(),
  canal: z.string().max(50).optional(),
  turma: z.string().max(50).optional(),
  cidade: z.string().max(100).optional(),
  campanha: z.string().max(200).optional(),
  observacoes: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});

const phoneRegex = /^[\+]?[0-9\s\-\(\)]{8,25}$/;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
    const validApiKey = Deno.env.get('WEBHOOK_API_KEY');

    if (!validApiKey) {
      console.error('WEBHOOK_API_KEY environment variable is not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!apiKey || apiKey !== validApiKey) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Invalid or missing X-API-Key header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed. Use POST.' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const bodyText = await req.text();

    if (bodyText.length > MAX_PAYLOAD_SIZE) {
      return new Response(
        JSON.stringify({ error: 'Payload too large', maxSize: MAX_PAYLOAD_SIZE }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!bodyText || bodyText.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'Empty request body', message: 'Please send a JSON body with lead data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(bodyText);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON', message: 'Request body must be valid JSON' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const parseResult = LeadInputSchema.safeParse(rawPayload);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({
          error: 'Validation failed',
          details: parseResult.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const payload = parseResult.data;

    const nome = (payload.nome || payload.name || '').trim();
    const telefone = (payload.telefone || payload.whatsapp || payload.phone || '').trim();
    const email = (payload.email || '').trim();
    // Produto/curso de interesse de verdade (ex: "Psicanálise") -- não confundir com
    // a coluna `produto` do banco, que é categórica (direto/lancamento/npa/time_comercial).
    const interesseProduto = (payload.produto || payload.curso_interesse || '').trim();

    if (!nome) {
      return new Response(
        JSON.stringify({ error: 'Missing required field', message: 'Field "nome" or "name" is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!telefone) {
      return new Response(
        JSON.stringify({ error: 'Missing required field', message: 'Field "telefone", "whatsapp", or "phone" is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!phoneRegex.test(telefone)) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone format', message: 'Phone must contain 8-25 digits and may include +, spaces, hyphens, or parentheses' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (email && !z.string().email().safeParse(email).success) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format', message: 'Please provide a valid email address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!interesseProduto) {
      return new Response(
        JSON.stringify({ error: 'Missing required field', message: 'Field "produto" or "curso_interesse" is required — o vendedor precisa saber a condição/produto pra negociar' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const canalRaw = (payload.canal || 'SDD').trim();
    const canal = (CANAIS_VALIDOS as readonly string[]).includes(canalRaw) ? canalRaw : 'SDD';
    const turma = (payload.turma || '').trim();
    const cidade = (payload.cidade || '').trim();
    const campanhaNome = (payload.campanha || '').trim();
    const observacoes = (payload.observacoes || payload.notes || '').trim();

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing Supabase environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Resolve a turma informada (ex: "Turma #44" ou só "44") pro lancamento_id real,
    // pra ela aparecer certinho na aba Aquisição do vendedor. Se não achar, segue
    // sem travar o cadastro — só fica sem turma vinculada.
    let lancamentoId: string | null = null;
    if (turma) {
      const turmaNormalizada = turma.replace(/[^0-9]/g, '');
      const { data: lancamentoMatch } = await supabaseAdmin
        .from('lancamentos')
        .select('id, nome')
        .ilike('nome', `%${turmaNormalizada}%`)
        .limit(5);
      const match = (lancamentoMatch ?? []).find((l: any) => /^turma\s*#\s*\d+$/i.test((l.nome ?? '').trim()) && l.nome.includes(turmaNormalizada));
      lancamentoId = match?.id ?? null;
    }

    // Resolve a campanha informada (nome exato, dentro do canal) pro id real —
    // campanhas são cadastradas manualmente na tela (aba Funil, "+ Nova campanha"),
    // esse endpoint não cria uma nova sozinho, só vincula se já existir.
    let campanhaId: string | null = null;
    if (campanhaNome) {
      const { data: campanhaMatch } = await supabaseAdmin
        .from('time_comercial_campanhas')
        .select('id')
        .eq('canal', canal)
        .ilike('nome', campanhaNome)
        .limit(1)
        .maybeSingle();
      campanhaId = (campanhaMatch as any)?.id ?? null;
    }

    const now = new Date().toISOString();
    // origem='Time Comercial' + status na etapa de entrada do funil do canal —
    // 'frio' é a primeira coluna do funil SDD (ver SDD_STAGES em TimeComercial.tsx),
    // 'novo' é a primeira coluna dos demais canais (ver GENERIC_STAGES). Atenção:
    // a coluna real de etapa/estágio em `leads` é `status` (não `etapa`). `produto`
    // é categórico (CHECK: direto/lancamento/npa/time_comercial), reflete a origem —
    // o produto/curso de interesse de verdade vai em `interesse_produto` (texto livre).
    const dbRow = {
      nome,
      email: email || null,
      telefone,
      whatsapp: telefone,
      origem: 'Time Comercial',
      status: canal === 'SDD' ? 'frio' : 'novo',
      canal,
      produto: 'time_comercial',
      interesse_produto: interesseProduto,
      lancamento_id: lancamentoId,
      campanha_id: campanhaId,
      cidade: cidade || null,
      observacoes: [observacoes, turma && `Turma: ${turma}`].filter(Boolean).join('\n') || null,
      criado_em: now,
    };

    const { data: insertedLead, error: insertError } = await supabaseAdmin
      .from('leads')
      .insert(dbRow)
      .select('id')
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to store lead', message: 'Lead data was valid but could not be saved' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log('Time Comercial lead created:', insertedLead.id, 'canal:', canal);

    return new Response(
      JSON.stringify({ success: true, message: 'Lead created successfully', lead: { id: insertedLead.id } }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: 'An unexpected error occurred while processing your request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
