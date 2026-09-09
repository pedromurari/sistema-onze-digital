#!/usr/bin/env node
/**
 * asaas-backfill-taxas.mjs
 * Preenche a taxa REAL (e a conta) das parcelas já pagas via Asaas que ficaram
 * sem `taxa_valor` -- antes do webhook passar a gravar isso.
 *
 * Pra cada parcela com `asaas_payment_id`, `status = 'pago'` e `taxa_valor`
 * nulo/zero: busca `GET /payments/{id}`, pega `netValue`, grava
 * `taxa_valor = value - netValue` e `conta_recebimento = 'asaas'`.
 *
 * Não cria nem cobra nada -- só leitura no Asaas + UPDATE de metadado.
 * Idempotente. Tem --dry-run.
 *
 * USO:
 *   ASAAS_API_KEY=xxx  SUPABASE_URL=https://<ref>.supabase.co  \
 *   SUPABASE_SERVICE_ROLE_KEY=xxx  node scripts/asaas-backfill-taxas.mjs [--dry-run] [--aluno <id>]
 */
import { createClient } from '@supabase/supabase-js';

const ASAAS_API = 'https://api.asaas.com/v3';
const dryRun = process.argv.includes('--dry-run');
const alunoIdx = process.argv.indexOf('--aluno');
const alunoFiltro = alunoIdx > -1 ? process.argv[alunoIdx + 1] : null;

const { ASAAS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (!dryRun && !ASAAS_API_KEY) {
  console.error('Defina ASAAS_API_KEY (ou use --dry-run).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function main() {
  let q = supabase
    .from('pagamentos')
    .select('id, aluno_id, numero_parcela, valor, taxa_valor, conta_recebimento, asaas_payment_id')
    .not('asaas_payment_id', 'is', null)
    .eq('status', 'pago')
    .or('taxa_valor.is.null,taxa_valor.eq.0')
    .order('data_pagamento', { ascending: true });
  if (alunoFiltro) q = q.eq('aluno_id', alunoFiltro);

  const { data: parcelas, error } = await q;
  if (error) { console.error('Erro ao ler parcelas:', error.message); process.exit(1); }

  console.log(`\nParcelas pagas via Asaas sem taxa: ${parcelas.length}`);
  if (parcelas.length === 0) return;

  let ok = 0, semNet = 0, erro = 0;
  for (const p of parcelas) {
    const tag = `aluno ${p.aluno_id} p${p.numero_parcela}`;
    if (dryRun) {
      console.log(`  ${tag} · ${brl(p.valor)} · ${p.asaas_payment_id}`);
      continue;
    }
    try {
      const res = await fetch(`${ASAAS_API}/payments/${p.asaas_payment_id}`, {
        headers: { 'Content-Type': 'application/json', access_token: ASAAS_API_KEY },
      });
      const data = await res.json().catch(() => ({}));
      const net = typeof data?.netValue === 'number' ? data.netValue : null;
      const value = Number(p.valor);
      if (net == null || !(value > 0) || net > value) {
        console.log(`  ${tag}: sem netValue confiável (${data?.netValue ?? '--'}) -- pulado`);
        semNet++;
        continue;
      }
      const taxa = Math.round((value - net) * 100) / 100;
      const patch = { taxa_valor: taxa };
      if (!p.conta_recebimento) patch.conta_recebimento = 'asaas';
      const { error: upErr } = await supabase.from('pagamentos').update(patch).eq('id', p.id);
      if (upErr) { console.error(`  ${tag}: falha ao gravar`, upErr.message); erro++; continue; }
      console.log(`  ${tag}: ${brl(value)} -> liquido ${brl(net)} (taxa ${brl(taxa)})`);
      ok++;
    } catch (e) {
      console.error(`  ${tag}: erro`, e.message);
      erro++;
    }
  }
  console.log(`\nOK: ${ok} · sem netValue: ${semNet} · erro: ${erro}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
