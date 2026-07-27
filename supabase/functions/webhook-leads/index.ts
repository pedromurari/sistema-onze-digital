import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Maximum payload size (10KB)
const MAX_PAYLOAD_SIZE = 10000;

// Input validation schema
const LeadInputSchema = z.object({
  // Original fields
  nome: z.string().max(100).optional(),
  name: z.string().max(100).optional(),
  email: z.string().email().max(255).optional().or(z.literal('')),
  telefone: z.string().max(30).optional(),
  phone: z.string().max(30).optional(),
  whatsapp: z.string().max(30).optional(),
  curso_interesse: z.string().max(200).optional(),
  course: z.string().max(200).optional(),
  fonte: z.string().max(100).optional(),
  source: z.string().max(100).optional(),
  origem: z.string().max(100).optional(),
  responsavel_id: z.string().uuid().optional().or(z.literal('')),
  valor: z.number().min(0).max(9999999).optional(),
  value: z.number().min(0).max(9999999).optional(),
  formacao: z.string().max(200).optional(),
  area_atuacao: z.string().max(200).optional(),
  cidade: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  estado: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  observacoes: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});

// Phone validation regex - flexible international format
const phoneRegex = /^[\+]?[0-9\s\-\(\)]{8,25}$/;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // API Key Authentication
    const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
    const validApiKey = Deno.env.get('WEBHOOK_API_KEY');
    
    if (!validApiKey) {
      console.error('WEBHOOK_API_KEY environment variable is not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!apiKey || apiKey !== validApiKey) {
      console.log('Unauthorized webhook request - invalid or missing API key');
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Invalid or missing X-API-Key header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method !== 'POST') {
      console.log('Method not allowed:', req.method);
      return new Response(
        JSON.stringify({ error: 'Method not allowed. Use POST.' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check payload size before parsing
    const bodyText = await req.text();
    
    if (bodyText.length > MAX_PAYLOAD_SIZE) {
      console.log('Payload too large:', bodyText.length);
      return new Response(
        JSON.stringify({ error: 'Payload too large', maxSize: MAX_PAYLOAD_SIZE }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!bodyText || bodyText.trim() === '') {
      console.log('Empty body received');
      return new Response(
        JSON.stringify({ 
          error: 'Empty request body', 
          message: 'Please send a JSON body with lead data'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(bodyText);
    } catch {
      console.log('JSON parse error');
      return new Response(
        JSON.stringify({ 
          error: 'Invalid JSON', 
          message: 'Request body must be valid JSON'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate input with Zod schema
    const parseResult = LeadInputSchema.safeParse(rawPayload);
    if (!parseResult.success) {
      console.log('Validation error:', parseResult.error.errors);
      return new Response(
        JSON.stringify({ 
          error: 'Validation failed', 
          details: parseResult.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = parseResult.data;
    console.log('Validated payload received');

    // Normalize payload - accept flexible field names
    const nome = (payload.nome || payload.name || '').trim();
    const telefone = (payload.telefone || payload.whatsapp || payload.phone || '').trim();
    const email = (payload.email || '').trim();
    
    // Validate required fields
    if (!nome) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required field', 
          message: 'Field "nome" or "name" is required'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!telefone) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required field', 
          message: 'Field "telefone", "whatsapp", or "phone" is required'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate phone format
    if (!phoneRegex.test(telefone)) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid phone format', 
          message: 'Phone must contain 8-25 digits and may include +, spaces, hyphens, or parentheses'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format if provided
    if (email && !z.string().email().safeParse(email).success) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid email format', 
          message: 'Please provide a valid email address'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cursoInteresse = (payload.curso_interesse || payload.course || '').trim();
    const fonte = (payload.fonte || payload.origem || payload.source || 'Webhook').trim();
    const responsavelId = (payload.responsavel_id || '').trim();
    const valorInvestimento = payload.valor ?? payload.value ?? null;
    const formacao = (payload.formacao || '').trim();
    const areaAtuacao = (payload.area_atuacao || '').trim();
    const cidade = (payload.cidade || payload.city || '').trim();
    const estado = (payload.estado || payload.state || '').trim();
    const observacoes = (payload.observacoes || payload.notes || '').trim();

    // Initialize Supabase client with service role for bypassing RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing Supabase environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const now = new Date().toISOString();
    // The Leads Diretos screen filters by origem="Direto" and groups by status.
    const dbRow = {
      nome,
      email: email || null,
      telefone,
      whatsapp: telefone,
      origem: 'Direto',
      status: 'novo',
      responsavel_id: responsavelId || null,
      valor_potencial: valorInvestimento,
      observacoes: [
        observacoes,
        `Origem do cadastro: ${fonte}`,
        formacao && `Formação acadêmica: ${formacao}`,
        areaAtuacao && `Área de atuação: ${areaAtuacao}`,
        cidade && `Cidade: ${cidade}${estado ? `/${estado}` : ''}`,
        cursoInteresse && `Curso de interesse: ${cursoInteresse}`,
      ].filter(Boolean).join('\n') || null,
      ultima_atividade: now,
    };

    // Insert into database
    const { data: insertedLead, error: insertError } = await supabaseAdmin
      .from('leads')
      .insert(dbRow)
      .select('id')
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to store lead',
          message: 'Lead data was valid but could not be saved'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Lead created and stored successfully:', insertedLead.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Lead created successfully',
        lead: { id: insertedLead.id }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: 'An unexpected error occurred while processing your request'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
