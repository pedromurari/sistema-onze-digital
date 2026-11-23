/**
 * tmp-nf-export -- DESATIVADO no mesmo dia em que foi criado (23/11/2026).
 *
 * Eu subi esta função pra exportar as 96 parcelas de novembro sem nota
 * fiscal, em CSV, pro lançamento em lote na Spedy. O erro: deixei pública,
 * sem nenhuma autenticação. Qualquer um com a URL baixava 22 KB com
 * NOME, CPF, E-MAIL e ENDEREÇO de 96 alunos.
 *
 * O arquivo já foi gerado e entregue (reports/notas-fiscais-novembro-2026).
 * Se precisar de outro, rodar a consulta direto no banco ou republicar
 * esta função COM a checagem de x-financeiro-key, como as outras.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(() => new Response(
  JSON.stringify({ ok: false, erro: 'endpoint desativado' }),
  { status: 410, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
));
