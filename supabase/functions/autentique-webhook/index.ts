/**
 * autentique-webhook
 * Recebe callbacks da Autentique quando o documento é assinado.
 * Marca contrato_assinado=true no aluno correspondente.
 *
 * Configurar em: Autentique → Configurações → Webhooks
 * URL: https://<project>.supabase.co/functions/v1/autentique-webhook
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, serviceKey);

    // A Autentique envia um JSON com event e document
    const payload = await req.json();

    // Formato da Autentique: { event: 'document.signed', document: { id, ... } }
    const event      = payload?.event ?? payload?.type ?? '';
    const documentId = payload?.document?.id ?? payload?.data?.document?.id ?? '';

    if (!documentId) {
      return new Response(JSON.stringify({ error: 'document_id não encontrado no payload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Autentique webhook: event=${event} doc=${documentId}`);

    // Encontra o aluno por autentique_documento_id
    const { data: aluno } = await sb
      .from('alunos')
      .select('id, nome, whatsapp')
      .eq('autentique_documento_id', documentId)
      .maybeSingle();

    if (!aluno) {
      // Documento não corresponde a nenhum aluno — pode ser de outro contexto
      console.log(`Nenhum aluno encontrado para doc_id=${documentId}`);
      return new Response(JSON.stringify({ ok: true, note: 'aluno não encontrado' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Marca como assinado independente do evento (signed / completed)
    if (event.includes('sign') || event.includes('complet') || event === 'document.finished') {
      await sb.from('alunos').update({
        contrato_assinado:    true,
        contrato_assinado_em: new Date().toISOString(),
      }).eq('id', aluno.id);

      console.log(`Contrato assinado: aluno=${aluno.id} (${aluno.nome})`);

      // Opcional: WPP de confirmação
      if (aluno.whatsapp) {
        try {
          await sb.functions.invoke('wpp-enviar', {
            body: {
              numero: aluno.whatsapp,
              mensagem: `✅ Contrato assinado com sucesso!\n\nBem-vindo(a), ${(aluno.nome ?? '').split(' ')[0]}! Estamos felizes em ter você conosco. 🎉`,
            },
          });
        } catch (e) {
          console.error('WPP confirmação error:', e);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('autentique-webhook error:', err);
    return new Response(JSON.stringify({ error: err.message ?? 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
