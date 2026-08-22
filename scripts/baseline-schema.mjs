#!/usr/bin/env node
/**
 * Cria um BASELINE do schema: uma migration única que reproduz o banco de produção
 * como ele está hoje, para que o histórico volte a ser confiável.
 *
 *   npm run db:baseline
 *
 * ── POR QUE ISSO É NECESSÁRIO ──────────────────────────────────────────────
 *
 * Medido em 22/08/2026:
 *   • 211 arquivos de migration no repositório
 *   • 301 migrations registradas no banco de produção
 *   • apenas 178 arquivos correspondem a algo aplicado — faltam ~123
 *   • 33 arquivos são anteriores ao início do histórico e NUNCA rodaram
 *   • o schema base (profiles, alunos, leads, turmas, pagamentos, tarefas) não está
 *     em migration nenhuma: foi criado direto no dashboard, antes do histórico começar
 *
 * Consequência prática: `supabase start` falha na migration 40 de 211, porque
 * `20260106190000_create_operations_tables.sql` referencia as tabelas `tarefas` e
 * `users` — a primeira só passou a existir depois (via dashboard) e a segunda nunca
 * existiu. O repositório não consegue reconstruir o banco.
 *
 * Isso impede: banco local, ambiente de staging, teste de RLS, e restauração a partir
 * do repositório em caso de desastre.
 *
 * ── O QUE ESTE SCRIPT FAZ ──────────────────────────────────────────────────
 *
 *   1. Puxa o schema atual de produção (`supabase db pull`).
 *   2. Move as migrations antigas para `supabase/migrations_arquivo/` — arquiva, não
 *      apaga. O histórico continua legível para quem quiser entender uma decisão.
 *   3. Deixa o baseline como primeira migration.
 *
 * ── ANTES DE RODAR ─────────────────────────────────────────────────────────
 *
 * É preciso vincular o projeto uma vez (pede a senha do banco):
 *
 *   npx supabase link --project-ref usqiyekfmwwnvkmkdlej
 *
 * O script NÃO pede nem guarda senha — quem faz isso é o CLI da Supabase.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const DIR_MIGRATIONS = 'supabase/migrations';
const DIR_ARQUIVO    = 'supabase/migrations_arquivo';

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', ...opts });
}

// ── Está vinculado? ─────────────────────────────────────────────────────────
try {
  sh('npx supabase projects list');
} catch {
  console.error(`
✗ O CLI da Supabase não está autenticado.

  npx supabase login
  npx supabase link --project-ref usqiyekfmwwnvkmkdlej

O link pede a senha do banco. Este script não pede nem guarda senha nenhuma.
`);
  process.exit(1);
}

if (!existsSync('supabase/.temp/project-ref')) {
  console.error(`
✗ Projeto não vinculado.

  npx supabase link --project-ref usqiyekfmwwnvkmkdlej

Depois: npm run db:baseline
`);
  process.exit(1);
}

// ── Arquiva o histórico atual ───────────────────────────────────────────────
const antes = readdirSync(DIR_MIGRATIONS).filter(f => f.endsWith('.sql'));
console.log(`Arquivando ${antes.length} migrations em ${DIR_ARQUIVO}/ …`);
console.log('(arquiva, não apaga — o histórico continua legível)\n');

mkdirSync(DIR_ARQUIVO, { recursive: true });
for (const arquivo of antes) {
  renameSync(join(DIR_MIGRATIONS, arquivo), join(DIR_ARQUIVO, arquivo));
}

// ── Puxa o schema atual ─────────────────────────────────────────────────────
console.log('Puxando o schema de produção…\n');
try {
  execSync('npx supabase db pull', { stdio: 'inherit' });
} catch {
  console.error('\n✗ `supabase db pull` falhou. Restaurando o histórico arquivado…');
  for (const arquivo of readdirSync(DIR_ARQUIVO).filter(f => f.endsWith('.sql'))) {
    renameSync(join(DIR_ARQUIVO, arquivo), join(DIR_MIGRATIONS, arquivo));
  }
  process.exit(1);
}

const depois = readdirSync(DIR_MIGRATIONS).filter(f => f.endsWith('.sql'));
console.log(`
✓ Baseline criado: ${depois.join(', ')}

Confira que ele contém o schema completo e então:

  npm run test:rls      → agora o banco local deve subir do zero

O histórico antigo está em ${DIR_ARQUIVO}/, fora do caminho do CLI.
`);
