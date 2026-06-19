/**
 * autentique-webhook
 * Recebe callbacks da Autentique quando o documento é assinado.
 * Marca contrato_assinado=true no aluno correspondente.
 *
 * Segurança: valida assinatura HMAC-SHA256 se AUTENTIQUE_WEBHOOK_SECRET estiver configurado.
 * Configurar em: Autentique → Configurações → Webhooks
 * URL: https://<project>.supabase.co/functions/v1/autentique-webhook
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Webhooks externos não usam Origin — apenas retornar 200 para OPTIONS
const corsHeaders = {
  'Access-Control-Allow-Origin': 'null',
  'Access-Control-Allow-Headers': 'content-type, x-autentique-signature, x-hub-signature-256',
};

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function verifyHmac(secret: string, body: Uint8Array, signature: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    // Aceita formatos: "sha256=<hex>" ou apenas "<hex>"
    const hexSig = signature.replace(/^sha256=/i, '');
    const sigBytes = hexToBytes(hexSig);
    return await crypto.subtle.verify('HMAC', key, sigBytes, body);
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const webhookSecret = Deno.env.get('AUTENTIQUE_WEBHOOK_SECRET');

    // Ler body como bytes para validar HMAC antes de parsear
    const bodyBytes = new Uint8Array(await req.arrayBuffer());

    // Validar assinatura HMAC-SHA256 se secret configurado
    if (webhookSecret) {
      const signature =
        req.headers.get('x-autentique-signature') ??
        req.headers.get('x-hub-signature-256') ??
        req.headers.get('x-webhook-signature');

      if (!signature) {
        console.warn('autentique-webhook: assinatura ausente, rejeitando');
        return new Response(JSON.stringify({ error: 'Assinatura de webhook ausente' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const valid = await verifyHmac(webhookSecret, bodyBytes, signature);
      if (!valid) {
        console.warn('autentique-webhook: assinatura inválida');
        return new Response(JSON.stringify({ error: 'Assinatura inválida' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const sb = createClient(supabaseUrl, serviceKey);

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(new TextDecoder().decode(bodyBytes));
    } catch {
      return new Response(JSON.stringify({ error: 'Body JSON inválido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const event      = String(payload?.event ?? payload?.type ?? '');
    const documentId = String(payload?.document?.id ?? (payload?.data as any)?.document?.id ?? '');

    if (!documentId) {
      return new Response(JSON.stringify({ error: 'document_id não encontrado no payload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Autentique webhook: event=${event} doc=${documentId}`);

    const { data: aluno } = await sb
      .from('alunos')
      .select('id, nome, whatsapp, contrato_assinado')
      .eq('autentique_documento_id', documentId)
      .maybeSingle();

    if (!aluno) {
      console.log(`Nenhum aluno encontrado para doc_id=${documentId}`);
      return new Response(JSON.stringify({ ok: true, note: 'aluno não encontrado' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (event.includes('sign') || event.includes('complet') || event === 'document.finished') {
      // Idempotência: só processa se ainda não estava assinado
      if (aluno.contrato_assinado) {
        console.log(`Contrato já assinado: aluno=${aluno.id} — ignorando duplicata`);
        return new Response(JSON.stringify({ ok: true, note: 'já processado' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await sb.from('alunos').update({
        contrato_assinado:    true,
        contrato_assinado_em: new Date().toISOString(),
      }).eq('id', aluno.id);

      console.log(`Contrato assinado: aluno=${aluno.id} (${aluno.nome})`);

      // Audit log
      sb.from('audit_logs').insert({
        action: 'contrato_assinado',
        target_id: aluno.id,
        details: { document_id: documentId, aluno_nome: aluno.nome },
      }).catch(() => {});

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
