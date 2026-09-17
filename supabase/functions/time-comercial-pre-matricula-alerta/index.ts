/**
 * time-comercial-pre-matricula-alerta
 * Avisa a equipe na hora quando a geração de boleto ou o envio de contrato
 * de uma pré-matrícula falha em segundo plano (matricula-pagamento-criar /
 * autentique-criar, chamadas assíncronas em MatriculaTimeComercial.tsx).
 *
 * Antes disso, uma falha nessas duas chamadas era 100% silenciosa -- o
 * aluno via "Pré-matrícula confirmada! 🎉" mesmo que o boleto ou o contrato
 * não tivessem sido gerados de verdade, e só se descobria dias depois
 * quando alguém reclamava de não ter recebido nada. Pedido explícito do
 * dono do produto (2026-09-17): "esses problemas não podem acontecer mais,
 * nenhuma vez" -- isso não impede a falha de acontecer (rede/Asaas/
 * Autentique caindo está fora do nosso controle), mas garante que a
 * equipe saiba na hora, em vez de nunca.
 *
 * Body: { aluno_id, aluno_nome, etapa: 'boleto' | 'contrato', detalhe? }
 * Sem auth (verify_jwt=false) -- chamada direto do formulário público, sem
 * sessão. Não expõe nada sensível: só manda um aviso pro número da equipe.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mesmo número já usado como catch-all operacional de leads sem vendedor
// (ver VENDEDOR_WHATSAPP em MatriculaTimeComercial.tsx, canais "direto"/
// "promo") -- "Financeiro IDM"/disp3.
const NUMERO_ALERTA = '5511976736081';

const ETAPA_LABEL: Record<string, string> = {
  boleto: 'gerar os boletos (Asaas)',
  contrato: 'enviar o contrato (Autentique)',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { aluno_id, aluno_nome, etapa, detalhe } = body as {
      aluno_id?: string; aluno_nome?: string; etapa?: string; detalhe?: string;
    };

    if (!aluno_id || !etapa) {
      return new Response(JSON.stringify({ error: 'aluno_id e etapa são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const etapaTexto = ETAPA_LABEL[etapa] ?? etapa;
    const mensagem = [
      '⚠️ *Pré-matrícula com falha em segundo plano*',
      '',
      `Aluno: ${aluno_nome || '(sem nome)'}`,
      `Falhou ao: ${etapaTexto}`,
      detalhe ? `Detalhe: ${String(detalhe).slice(0, 300)}` : null,
      '',
      `Aluno ID: ${aluno_id}`,
      'Confira o cadastro no CRM (Financeiro) e reenvie manualmente se precisar.',
    ].filter(Boolean).join('\n');

    const { error: wppErr } = await sb.functions.invoke('wpp-enviar', {
      body: { numero: NUMERO_ALERTA, mensagem },
    });

    if (wppErr) {
      console.error('time-comercial-pre-matricula-alerta: erro ao enviar wpp', wppErr);
      return new Response(JSON.stringify({ ok: false, erro: wppErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('time-comercial-pre-matricula-alerta error:', err);
    return new Response(JSON.stringify({ error: err.message ?? 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
