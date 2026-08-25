import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Parte 2 do spec docs/superpowers/specs/2026-08-24-funil-npa-e-area-membros-design.md.
//
// Chamada pelo card do lead (NPAKanban.tsx) assim que "Comprou material?" ou
// "Comprou mentoria?" vira sim. Cria (ou reaproveita) a conta na Área de
// Membros IDM e libera o produto certo, sem precisar de matrícula manual em
// /admin/alunos por lá.
//
// A Área de Membros é um projeto/deploy separado (repo Area-de-Membors) —
// a chamada é servidor-a-servidor, autenticada por uma chave dedicada
// guardada nos secrets desta function (AREA_MEMBROS_URL/AREA_MEMBROS_API_KEY),
// que precisa bater com CRIAR_USUARIO_API_KEY (ou uma chave própria da rota
// /api/liberar-acesso) configurada do outro lado.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const PRODUTOS_VALIDOS = new Set(['ebook-telas-npa', 'mentoria-npa']);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { leadId, produtoSlug } = await req.json();
    if (!leadId || typeof leadId !== 'string' || !PRODUTOS_VALIDOS.has(produtoSlug)) {
      return respond(400, { error: 'leadId e produtoSlug (ebook-telas-npa | mentoria-npa) são obrigatórios' });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: lead, error: leadError } = await supabase
      .from('npa_evento_leads')
      .select('id, nome, email, whatsapp')
      .eq('id', leadId)
      .maybeSingle();

    if (leadError) return respond(500, { error: `Erro ao buscar lead: ${leadError.message}` });
    if (!lead) return respond(404, { error: 'Lead não encontrado' });
    if (!lead.email) {
      return respond(422, { error: 'Lead sem email cadastrado — preencha o email antes de liberar o acesso' });
    }

    const areaMembrosUrl = Deno.env.get('AREA_MEMBROS_URL');
    const areaMembrosKey = Deno.env.get('AREA_MEMBROS_API_KEY');
    if (!areaMembrosUrl || !areaMembrosKey) {
      return respond(500, { error: 'Integração com a Área de Membros não configurada (faltam secrets AREA_MEMBROS_URL/AREA_MEMBROS_API_KEY)' });
    }

    const base = areaMembrosUrl.replace(/\/$/, '');
    const resp = await fetch(`${base}/api/liberar-acesso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${areaMembrosKey}` },
      body: JSON.stringify({
        email: lead.email,
        nome: lead.nome,
        whatsapp: lead.whatsapp ?? undefined,
        produtoSlug,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const data = await resp.json().catch(() => ({} as Record<string, unknown>));
    if (!resp.ok || !data?.loginUrl) {
      return respond(502, { error: (data as { error?: string })?.error || `Falha ao liberar acesso na Área de Membros (HTTP ${resp.status})` });
    }

    const loginUrl = data.loginUrl as string;
    const { error: updateError } = await supabase
      .from('npa_evento_leads')
      .update({ acesso_membros_url: loginUrl, acesso_membros_liberado_em: new Date().toISOString() })
      .eq('id', leadId);
    if (updateError) return respond(500, { error: `Acesso liberado, mas falhou ao salvar: ${updateError.message}` });

    return respond(200, { loginUrl });
  } catch (err) {
    return respond(500, { error: err instanceof Error ? err.message : 'Erro inesperado' });
  }
});
