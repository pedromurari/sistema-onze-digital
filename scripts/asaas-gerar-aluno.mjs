#!/usr/bin/env node
/**
 * asaas-gerar-aluno.mjs
 * Gera, DE UMA VEZ, os boletos Asaas de TODAS as parcelas pendentes de um aluno
 * -- para o caso pontual em que a matrícula já existe, as parcelas já estão no
 * banco com as datas certas, e só falta a cobrança no Asaas.
 *
 * O cron `matricula-boleto-mensal-gerar` gera gradualmente (10 dias antes de
 * cada vencimento) e só para `origem_lead='time_comercial'`. Este script é o
 * "gera tudo agora, para este aluno", rodado à mão.
 *
 * NÃO cria nem altera parcelas: só lê `pagamentos` (status != pago, sem
 * asaas_payment_id) e, para cada uma, cria o boleto no Asaas e grava de volta
 * `asaas_payment_id` + `link_pagamento_asaas`. Idempotente: parcela que já tem
 * asaas_payment_id é pulada.
 *
 * IMPORTANTE: desligue também a régua global no painel do Asaas em
 * Configurações → Notificações. `notificationDisabled` é o reforço por cliente;
 * a cobrança por WhatsApp continua sendo feita exclusivamente pelo nosso CRM.
 *
 * USO:
 *   ASAAS_API_KEY=xxx  SUPABASE_URL=https://<ref>.supabase.co  \
 *   SUPABASE_SERVICE_ROLE_KEY=xxx  node scripts/asaas-gerar-aluno.mjs <aluno_id> [--dry-run]
 *
 *   - ASAAS_API_KEY: painel Asaas -> Integrações -> Chaves de API (produção).
 *   - SUPABASE_SERVICE_ROLE_KEY: painel Supabase -> Settings -> API Keys -> "service_role".
 *   - <aluno_id>: o UUID do aluno (coluna alunos.id).
 *   - --dry-run: mostra o que faria, sem chamar o Asaas nem gravar nada.
 */
import { createClient } from '@supabase/supabase-js';

const ASAAS_API = 'https://api.asaas.com/v3';

const alunoId = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

const { ASAAS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!alunoId || alunoId.startsWith('--')) {
  console.error('Falta o <aluno_id>. Ex: node scripts/asaas-gerar-aluno.mjs 07606942-05cf-4f56-b57d-14220e3bae56');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}
if (!dryRun && !ASAAS_API_KEY) {
  console.error('Defina ASAAS_API_KEY (ou rode com --dry-run).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function asaas(path, init) {
  const res = await fetch(`${ASAAS_API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', access_token: ASAAS_API_KEY, ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function main() {
  const { data: aluno, error: alunoErr } = await supabase
    .from('alunos')
    .select('id, nome, cpf, email, endereco, cep, cidade_estado, asaas_customer_id, total_mensalidades')
    .eq('id', alunoId)
    .single();
  if (alunoErr || !aluno) { console.error('Aluno não encontrado:', alunoErr?.message); process.exit(1); }

  const { data: parcelas, error: pErr } = await supabase
    .from('pagamentos')
    .select('id, numero_parcela, valor, data_vencimento, status, asaas_payment_id')
    .eq('aluno_id', alunoId)
    .neq('status', 'pago')
    .is('asaas_payment_id', null)
    .order('numero_parcela');
  if (pErr) { console.error('Erro ao ler parcelas:', pErr.message); process.exit(1); }

  console.log(`\nAluno: ${aluno.nome}`);
  console.log(`Parcelas pendentes sem boleto Asaas: ${parcelas.length}`);
  parcelas.forEach((p) => console.log(`  ${p.numero_parcela}/${aluno.total_mensalidades ?? '?'}  venc ${p.data_vencimento}  ${brl(p.valor)}`));
  if (parcelas.length === 0) { console.log('\nNada a fazer.'); return; }

  if (dryRun) { console.log('\n[--dry-run] Nada foi criado.'); return; }

  // 1) Cliente Asaas
  let customerId = aluno.asaas_customer_id;
  if (!customerId) {
    const cpf = String(aluno.cpf ?? '').replace(/\D/g, '');
    if (!cpf) { console.error('Aluno sem CPF -- não dá pra criar cliente Asaas.'); process.exit(1); }
    const numero = String(aluno.endereco ?? '').match(/\d+/)?.[0];
    const { ok, data } = await asaas('/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: String(aluno.nome ?? 'Aluno').trim(),
        cpfCnpj: cpf,
        email: aluno.email || undefined,
        address: String(aluno.endereco ?? '').trim() || undefined,
        addressNumber: numero,
        postalCode: String(aluno.cep ?? '').replace(/\D/g, '') || undefined,
        notificationDisabled: true,
      }),
    });
    if (!ok || !data?.id) { console.error('Falha ao criar cliente Asaas:', data); process.exit(1); }
    customerId = String(data.id);
    await supabase.from('alunos').update({ asaas_customer_id: customerId }).eq('id', alunoId);
    console.log(`\nCliente Asaas criado: ${customerId}`);
  } else {
    console.log(`\nCliente Asaas existente: ${customerId}`);
  }

  // 2) Boletos
  const total = aluno.total_mensalidades ?? 15;
  const resultados = [];
  for (const p of parcelas) {
    const { ok, data } = await asaas('/payments', {
      method: 'POST',
      body: JSON.stringify({
        customer: customerId,
        billingType: 'BOLETO',
        value: Number(p.valor),
        dueDate: p.data_vencimento,
        description: `Mensalidade PSI (parcela ${p.numero_parcela} de ${total}) - ${aluno.nome}`,
        externalReference: p.id,
      }),
    });
    if (!ok || !data?.id) {
      console.error(`  parcela ${p.numero_parcela}: ERRO Asaas`, data?.errors?.[0]?.description || data);
      resultados.push({ parcela: p.numero_parcela, erro: true });
      continue;
    }
    const link = data.invoiceUrl ?? data.bankSlipUrl ?? null;
    // Só grava o vínculo com o Asaas. `conta_recebimento` é preenchido na baixa
    // (quando o dinheiro de fato entra), não agora.
    const { error: upErr } = await supabase
      .from('pagamentos')
      .update({ asaas_payment_id: String(data.id), link_pagamento_asaas: link })
      .eq('id', p.id);
    if (upErr) console.error(`  parcela ${p.numero_parcela}: boleto criado mas falhou ao gravar:`, upErr.message);
    resultados.push({ parcela: p.numero_parcela, venc: p.data_vencimento, link });
    console.log(`  parcela ${p.numero_parcela}: OK`);
  }

  console.log('\n── LINKS ──────────────────────────────────────────');
  resultados.filter((r) => !r.erro).forEach((r) => console.log(`parcela ${r.parcela} (venc ${r.venc}):\n  ${r.link}\n`));
  const erros = resultados.filter((r) => r.erro);
  if (erros.length) console.log(`\n${erros.length} parcela(s) com erro: ${erros.map((e) => e.parcela).join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
