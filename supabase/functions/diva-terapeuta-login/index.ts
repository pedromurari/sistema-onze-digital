/**
 * diva-terapeuta-login
 * Login do terapeuta parceiro no painel público (/diva/terapeuta/:id) --
 * WhatsApp + PIN de 6 dígitos (gerado pelo admin em FichaTerapeutaDialog,
 * RPC diva_terapeuta_pin_gerar). Sem Supabase Auth de verdade (não faz
 * sentido criar conta/email pra cada terapeuta só pra isso) -- token
 * próprio assinado com HMAC usando a service role key como segredo
 * (mesmo truque já usado em presenca-publica), válido por 30 dias,
 * verificado nas outras duas functions do painel.
 *
 * POST { whatsapp, pin }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
};

const TOKEN_VALIDADE_SEGUNDOS = 30 * 24 * 60 * 60;

async function assinar(terapeutaId: string, expiraEm: number, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`diva-sessao:${terapeutaId}:${expiraEm}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return respond(405, { error: 'Método não permitido.' });

  try {
    const { whatsapp, pin } = await req.json();
    if (!whatsapp || !pin) return respond(400, { error: 'Informe WhatsApp e PIN.' });

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

    const { data, error } = await supabase
      .rpc('diva_terapeuta_pin_autenticar', { p_whatsapp: String(whatsapp), p_pin: String(pin) })
      .maybeSingle();

    if (error) {
      console.error('diva-terapeuta-login: erro rpc', error);
      return respond(500, { error: 'Erro ao validar login.' });
    }

    const d = data as { terapeuta_id: string | null; nome: string | null; sucesso: boolean; motivo: string } | null;

    if (!d?.sucesso) {
      const mensagens: Record<string, string> = {
        nao_encontrado: 'WhatsApp não encontrado. Confere o número (o mesmo que a gente usa pra falar com você).',
        whatsapp_invalido: 'WhatsApp inválido.',
        bloqueado: 'Muitas tentativas erradas. Espera 15 minutos e tenta de novo, ou chama o IDM.',
        sem_pin: 'Você ainda não tem um PIN cadastrado. Chama o IDM pra gerar um.',
        pin_errado: 'PIN incorreto.',
      };
      return respond(401, { error: mensagens[d?.motivo ?? ''] ?? 'Não foi possível entrar.' });
    }

    const expiraEm = Math.floor(Date.now() / 1000) + TOKEN_VALIDADE_SEGUNDOS;
    const assinatura = await assinar(d.terapeuta_id!, expiraEm, serviceKey);
    const token = `${d.terapeuta_id}.${expiraEm}.${assinatura}`;

    return respond(200, { terapeuta_id: d.terapeuta_id, nome: d.nome, token });
  } catch (e) {
    console.error('diva-terapeuta-login error', e);
    return respond(500, { error: 'Erro interno.' });
  }
});
