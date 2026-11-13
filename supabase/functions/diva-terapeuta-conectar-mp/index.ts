/**
 * diva-terapeuta-conectar-mp — link que o terapeuta do Divã clica pra
 * conectar a própria conta Mercado Pago (OAuth) e começar a receber
 * repasse automático via split (Fase 7, 13/11/2026). Reaproveita a
 * mesma infra de parceiros/afiliadas (parceiros, parceiros_produtos,
 * mp-oauth-callback, checkout-criar-pagamento) que já funciona.
 *
 * GET ?terapeuta_id=<uuid> — na primeira vez, cria o parceiro + os 5
 * produtos (planos) ligados a ele; depois sempre redireciona pro
 * Mercado Pago autorizar. Idempotente: não duplica parceiro/produtos se
 * já existirem.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PLANOS = [
  { nome: '1 sessão avulsa', preco: 80 },
  { nome: '2 sessões avulsas', preco: 160 },
  { nome: 'Pacote 3 sessões', preco: 210 },
  { nome: 'Pacote 4 sessões', preco: 280 },
  { nome: 'Pacote 5 sessões', preco: 350 },
];

function erroHtml(msg: string) {
  return new Response(
    `<html><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>Não foi possível continuar</h2><p>${msg}</p></body></html>`,
    { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

serve(async (req) => {
  const url = new URL(req.url);
  const terapeutaId = url.searchParams.get('terapeuta_id');
  if (!terapeutaId) return erroHtml('terapeuta_id ausente na URL.');

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: terapeuta, error: terapeutaError } = await supabase
    .from('diva_terapeutas')
    .select('id, nome, whatsapp, email, parceiro_id')
    .eq('id', terapeutaId)
    .maybeSingle();
  if (terapeutaError || !terapeuta) return erroHtml('Terapeuta não encontrado.');

  let parceiroId = terapeuta.parceiro_id as string | null;

  if (!parceiroId) {
    const { data: parceiro, error: parceiroError } = await supabase
      .from('parceiros')
      .insert({
        nome: terapeuta.nome,
        whatsapp: terapeuta.whatsapp,
        email: terapeuta.email,
        status_contrato: 'pendente',
        ativo: true,
        observacoes: 'Terapeuta credenciado do Divã IDM -- split de sessão.',
      })
      .select('id')
      .single();
    if (parceiroError || !parceiro) return erroHtml(`Erro ao criar parceiro: ${parceiroError?.message ?? 'desconhecido'}`);
    parceiroId = parceiro.id;

    const { error: produtosError } = await supabase.from('parceiros_produtos').insert(
      PLANOS.map((p) => ({
        parceiro_id: parceiroId,
        nome: `Divã IDM — ${p.nome} (${terapeuta.nome.split(' ')[0]})`,
        descricao: `Terapia social Divã IDM -- ${p.nome}, com ${terapeuta.nome}.`,
        preco: p.preco,
        status: 'ativo',
        comissao_idm_pct: 37.5,
        comissao_parceiro_pct: 62.5,
      })),
    );
    if (produtosError) return erroHtml(`Parceiro criado, mas erro ao criar os planos: ${produtosError.message}`);

    const { error: updateError } = await supabase.from('diva_terapeutas').update({ parceiro_id: parceiroId }).eq('id', terapeutaId);
    if (updateError) return erroHtml(`Erro ao vincular: ${updateError.message}`);
  }

  const clientId = Deno.env.get('MP_CLIENT_ID');
  const redirectUri = Deno.env.get('MP_REDIRECT_URI');
  if (!clientId || !redirectUri) return erroHtml('Integração com Mercado Pago não configurada (faltam secrets).');

  const authUrl = new URL('https://auth.mercadopago.com.br/authorization');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('platform_id', 'mp');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', parceiroId!);

  return new Response(null, { status: 302, headers: { Location: authUrl.toString() } });
});
