/**
 * tmp-mp-buscar -- DESATIVADO em 23/11/2026, no mesmo dia em que foi criado.
 *
 * Era pra reconciliar pagamentos antigos do Mercado Pago que tinham sido
 * lançados na mão e ficaram sem mp_payment_id (caso do Wilson). Cumpriu o
 * papel. O erro: ficou pública, sem autenticação -- qualquer um com a URL
 * listava os pagamentos da conta do Mercado Pago, com valor, taxa, e-mail
 * do pagador e descrição.
 *
 * Se precisar de novo, republicar COM checagem de x-financeiro-key.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(() => new Response(
  JSON.stringify({ ok: false, erro: 'endpoint desativado' }),
  { status: 410, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
));
