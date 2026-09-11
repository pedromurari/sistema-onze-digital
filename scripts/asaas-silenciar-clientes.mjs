#!/usr/bin/env node
/**
 * Silencia as notificações nativas do Asaas para todos os alunos já vinculados.
 *
 * O Instituto cobra pelo próprio fluxo de WhatsApp; e-mail, SMS ou WhatsApp enviados
 * automaticamente pelo gateway duplicam a régua e podem confundir o aluno. Este script
 * é idempotente: repetir `notificationDisabled: true` produz o mesmo estado.
 *
 * IMPORTANTE: desligue também a régua global no painel do Asaas em
 * Configurações → Notificações. O script é o reforço por cliente já criado.
 *
 * USO:
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx \
 *   ASAAS_API_KEY=xxx node scripts/asaas-silenciar-clientes.mjs [--dry-run]
 *
 * `--dry-run` consulta apenas a Supabase e mostra quantos clientes seriam atualizados.
 */
import { createClient } from '@supabase/supabase-js';

const ASAAS_API = 'https://api.asaas.com/v3';
const PAGE_SIZE = 1000;
const dryRun = process.argv.includes('--dry-run');
const { ASAAS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}
if (!dryRun && !ASAAS_API_KEY) {
  console.error('Defina ASAAS_API_KEY (ou rode com --dry-run).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function buscarClientes() {
  const clientes = [];
  for (let inicio = 0; ; inicio += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('alunos')
      .select('id, nome, asaas_customer_id')
      .not('asaas_customer_id', 'is', null)
      .order('id')
      .range(inicio, inicio + PAGE_SIZE - 1);
    if (error) throw new Error(`Falha ao consultar alunos: ${error.message}`);
    clientes.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return clientes;
}

async function silenciar(customerId) {
  const response = await fetch(`${ASAAS_API}/customers/${encodeURIComponent(customerId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', access_token: ASAAS_API_KEY },
    body: JSON.stringify({ notificationDisabled: true }),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function main() {
  const clientes = await buscarClientes();
  console.log(`Clientes Asaas encontrados: ${clientes.length}`);

  if (dryRun) {
    console.log('[--dry-run] Nenhum cliente foi alterado.');
    return;
  }

  let atualizados = 0;
  const falhas = [];
  for (const aluno of clientes) {
    const customerId = String(aluno.asaas_customer_id);
    const resultado = await silenciar(customerId);
    if (resultado.ok) {
      atualizados += 1;
      console.log(`[${atualizados}/${clientes.length}] OK ${aluno.nome}`);
      continue;
    }
    const detalhe = resultado.data?.errors?.[0]?.description || JSON.stringify(resultado.data);
    falhas.push({ alunoId: aluno.id, customerId, status: resultado.status, detalhe });
    console.error(`ERRO ${aluno.nome} (${customerId}): ${resultado.status} ${detalhe}`);
  }

  console.log(`Concluído: ${atualizados} atualizados; ${falhas.length} falhas.`);
  if (falhas.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
