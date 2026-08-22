#!/usr/bin/env node
/**
 * Type-check com trava de crescimento.
 *
 * O projeto tem dívida de tipos herdada (101 erros quando esta refatoração começou).
 * Exigir zero pararia o CI no primeiro dia e o time desligaria a verificação — que é o
 * pior dos mundos. Então a régua é: **não pode aumentar**.
 *
 * Quando o número cai, o script avisa e pede para baixar o baseline. Assim a dívida só
 * anda numa direção, sem bloquear ninguém hoje.
 *
 *   node scripts/typecheck-baseline.mjs            → verifica
 *   node scripts/typecheck-baseline.mjs --update   → grava o número atual como novo teto
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ARQUIVO_BASELINE = '.typecheck-baseline';
const atualizar = process.argv.includes('--update');

let saida = '';
try {
  saida = execSync('npx tsc --noEmit -p tsconfig.app.json', {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (e) {
  // tsc sai com código != 0 quando há erro; a saída é o que interessa.
  saida = `${e.stdout ?? ''}${e.stderr ?? ''}`;
}

const erros = saida.split('\n').filter(l => / error TS\d+/.test(l));
const atual = erros.length;

if (atualizar) {
  writeFileSync(ARQUIVO_BASELINE, `${atual}\n`);
  console.log(`baseline gravado: ${atual} erros`);
  process.exit(0);
}

if (!existsSync(ARQUIVO_BASELINE)) {
  console.error(`Falta o arquivo ${ARQUIVO_BASELINE}. Rode: node scripts/typecheck-baseline.mjs --update`);
  process.exit(1);
}

const baseline = Number(readFileSync(ARQUIVO_BASELINE, 'utf-8').trim());

if (atual > baseline) {
  console.error(`\n✗ Erros de tipo subiram: ${baseline} → ${atual} (+${atual - baseline})\n`);
  // Mostra só os arquivos afetados: a lista inteira polui o log do CI.
  const porArquivo = {};
  for (const linha of erros) {
    const arquivo = linha.split('(')[0];
    porArquivo[arquivo] = (porArquivo[arquivo] ?? 0) + 1;
  }
  for (const [arquivo, n] of Object.entries(porArquivo).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.error(`  ${String(n).padStart(3)}  ${arquivo}`);
  }
  console.error('\nCorrija os novos, ou rode `npm run typecheck -- --update` se o aumento for intencional.\n');
  process.exit(1);
}

if (atual < baseline) {
  console.log(`✓ Erros de tipo caíram: ${baseline} → ${atual} (-${baseline - atual})`);
  console.log(`  Baixe o teto: node scripts/typecheck-baseline.mjs --update`);
  process.exit(0);
}

console.log(`✓ Erros de tipo estáveis em ${atual} (teto: ${baseline})`);
