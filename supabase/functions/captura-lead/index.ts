import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Um endereço único e permanente para a landing page anotar o lead.
 *
 * ── O QUE ISTO SUBSTITUI ────────────────────────────────────────────────────
 * Hoje cada lançamento exige: uma tabela `sheet_leads_NN` criada por migration, a chave
 * anônima embutida na página, e um deploy da página apontando para a tabela certa. Três
 * coisas para acertar por turma, e nenhuma delas avisa quando dá errado.
 *
 * Deu errado. A página da Turma #44 grava em dois lugares: `lancamento_leads` (funciona) e
 * `sheet_leads_44` (401 em toda captura desde 22/08, porque a chave parou de valer). As
 * tabelas `sheet_leads_NN` são cópia integral — conferido na #43: 648 de 648 telefones já
 * estavam em `lancamento_leads`, zero exclusivos. Nada no sistema as lê.
 *
 * Com este endereço, lançamento novo não precisa de tabela, nem de chave, nem de deploy.
 *
 * ── COMO A PÁGINA USA ───────────────────────────────────────────────────────
 *   POST https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/captura-lead
 *   Content-Type: application/json
 *   { "turma": "44", "nome": "...", "whatsapp": "...", "email": "...", "cidade": "..." }
 *
 * `turma` aceita "44", "#44" ou "Turma #44". Omitir manda para o lançamento corrente — o
 * de live mais próxima que ainda não passou — então uma página genérica continua
 * funcionando quando a turma vira, sem ninguém editar o HTML.
 *
 * `"simular": true` resolve e valida sem gravar. Serve para conferir o apontamento de uma
 * página nova sem criar lead de teste no meio dos reais, e sem disparar boas-vindas.
 *
 * Resposta: `{ ok, lancamento, id, repetido }` ou `{ ok: false, erro }`.
 *
 * ── SOBRE SER PÚBLICO ───────────────────────────────────────────────────────
 * Não exige autenticação, igual ao formulário que substitui: a página já carrega a chave
 * anônima, que é pública por estar no HTML. A diferença é que a validação e a gravação
 * acontecem no servidor, com service_role — então `lancamento_leads` não precisa de grant
 * nenhum para `anon`, e este vira o único caminho de entrada.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Corta o que um formulário quebrado poderia despejar na tabela. */
const limpar = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) || null : null;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') return json({ ok: false, erro: 'use POST' }, 405);

  let entrada: Record<string, unknown>;
  try {
    entrada = await req.json();
  } catch {
    return json({ ok: false, erro: 'corpo invalido: esperado JSON' }, 400);
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Resolver o lançamento, deduplicar por telefone normalizado e gravar acontece tudo
  // dentro de `capturar_lead`, numa chamada só: dois cliques simultâneos não viram dois
  // leads, e a deduplicação não custa uma consulta por lead já existente.
  const { data, error } = await sb.rpc('capturar_lead', {
    p_nome:     limpar(entrada.nome, 120),
    p_whatsapp: limpar(entrada.whatsapp ?? entrada.telefone, 200),
    p_turma:    limpar(entrada.turma ?? entrada.lancamento, 200),
    p_email:    limpar(entrada.email, 200),
    p_cidade:   limpar(entrada.cidade, 200),
    p_simular:  entrada.simular === true,
  });

  if (error) {
    // A página não deve receber detalhe interno; o log do servidor guarda o motivo.
    console.error('captura-lead: falha ao gravar', error.message);
    return json({ ok: false, erro: 'nao foi possivel registrar agora' }, 500);
  }

  const resposta = data as { ok?: boolean; erro?: string };
  // Erro de preenchimento (nome vazio, telefone inválido, turma inexistente) volta como
  // 400 para a página conseguir mostrar a mensagem certa ao visitante.
  return json(resposta, resposta?.ok === false ? 400 : 200);
});
