#!/usr/bin/env node
/**
 * Roda os testes de RLS contra o banco LOCAL.
 *
 *   npm run test:rls
 *
 * Faz três coisas, nesta ordem:
 *   1. Confere que o banco alvo é mesmo o local — trava dura, explicada abaixo.
 *   2. `supabase db reset`: recria o banco do zero com as migrations e o seed.
 *      O seed começa desligando os gatilhos de envio.
 *   3. Executa `supabase/tests/rls.sql` dentro do container.
 *
 * POR QUE A TRAVA DO PASSO 1:
 * este projeto manda WhatsApp e e-mail por gatilho de banco. Rodar `db reset` apontando
 * para produção apagaria a base — e um teste que insere lead poderia disparar envio real.
 * O script recusa qualquer coisa que não seja 127.0.0.1/localhost, mesmo que a variável
 * de ambiente diga o contrário.
 */
import { execSync, execFileSync } from 'node:child_process';
import { join } from 'node:path';

const PORTA_LOCAL = 54322;
const HOSTS_PERMITIDOS = ['127.0.0.1', 'localhost'];

/**
 * No Windows o Docker Desktop pode ser instalado por usuário, em
 * AppData\Local\Programs\DockerDesktop — e nesse caso o binário não entra no PATH do
 * Git Bash nem do PowerShell. Em vez de exigir que a pessoa conserte o PATH, o script
 * procura nos lugares conhecidos.
 */
function acharDocker() {
  const candidatos = [
    'docker',
    // Instalacao por usuario (padrao recente do Docker Desktop no Windows).
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe'),
    // Instalacao para todos os usuarios.
    join(process.env.ProgramFiles ?? '', 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'),
  ];
  for (const candidato of candidatos) {
    try {
      execFileSync(candidato, ['--version'], { stdio: 'pipe' });
      return candidato;
    } catch { /* tenta o próximo */ }
  }
  return null;
}

const DOCKER = acharDocker();

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', ...opts });
}

function docker(args) {
  return execFileSync(DOCKER, args, { encoding: 'utf-8', stdio: 'pipe' });
}

// ── 1. Docker no ar? ────────────────────────────────────────────────────────
// `--version` responde mesmo com o engine desligado; `info` é o que prova que o
// backend Linux subiu. Recém-aberto, o Docker Desktop leva 1-2 min para responder.
try {
  if (!DOCKER) throw new Error('binário não encontrado');
  const versaoServidor = docker(['info', '--format', '{{.ServerVersion}}']).trim();
  // `docker info` pode sair com codigo 0 e devolver versao VAZIA quando o CLI responde
  // mas o engine nao — foi o que aconteceu aqui. Sem esta checagem o script segue em
  // frente achando que esta tudo bem e falha lá na frente, com erro confuso.
  if (!versaoServidor) throw new Error('engine não respondeu');
} catch {
  // No Windows o backend Linux do Docker roda dentro do WSL2. Sem WSL, o Docker Desktop
  // abre normalmente, o CLI responde, e TODO comando devolve 500 — o que parece problema
  // do Docker e é do Windows.
  let faltaWsl = false;
  if (process.platform === 'win32') {
    try {
      execFileSync('wsl', ['--status'], { stdio: 'pipe' });
    } catch {
      faltaWsl = true;
    }
  }

  if (faltaWsl) {
    console.error(`
✗ Falta o WSL — é isso que impede o Docker de rodar.

O Docker Desktop abre e o CLI responde, mas o backend Linux vive dentro do WSL2. Sem ele,
todo comando devolve "500 Internal Server Error".

Para resolver, num PowerShell COMO ADMINISTRADOR:

  wsl --install

Depois REINICIE o computador, abra o Docker Desktop e rode: npm run test:rls
`);
    process.exit(1);
  }

  console.error(`
✗ Docker não está pronto.

Os testes de RLS precisam de um Postgres local — não dá para testar policy contra
produção.

  • Não instalado?  https://www.docker.com/products/docker-desktop/
  • Recém-aberto?   o backend Linux leva 1-2 min para subir. Tente de novo.
  • Instalado mas não achei? procurei em PATH, LOCALAPPDATA e Program Files.

Depois: npm run test:rls
`);
  process.exit(1);
}

// ── 2. O banco local está de pé? ────────────────────────────────────────────
let statusLocal = '';
try {
  statusLocal = sh('npx supabase status');
} catch {
  console.log('Banco local nao esta de pe. Subindo com supabase start...');
  execSync('npx supabase start', { stdio: 'inherit' });
  statusLocal = sh('npx supabase status');
}

// ── 3. TRAVA: o alvo tem que ser local ──────────────────────────────────────
// O CLI mudou o formato: versoes novas devolvem JSON ({"DB_URL":"..."}), as antigas
// devolvem texto ("DB URL: ..."). Lemos os dois — se nao der pra ler a URL, a trava
// recusa por seguranca, que e o comportamento certo na duvida.
function lerUrlDoBanco(saida) {
  try {
    const json = JSON.parse(saida.slice(saida.indexOf('{'), saida.lastIndexOf('}') + 1));
    if (json.DB_URL) return json.DB_URL;
  } catch { /* nao era JSON; tenta o formato texto */ }
  return (saida.match(/DB URL:\s*(\S+)/) ?? [])[1] ?? '';
}

const urlDb = lerUrlDoBanco(statusLocal);
const hostEhLocal = HOSTS_PERMITIDOS.some(h => urlDb.includes(h));
const portaEhLocal = urlDb.includes(String(PORTA_LOCAL));

if (!hostEhLocal || !portaEhLocal) {
  console.error(`
✗ RECUSANDO RODAR.

O banco alvo não parece ser o local:
  ${urlDb || '(não consegui ler a DB URL)'}

Este script faz "db reset", que APAGA E RECRIA o banco. Rodar isso contra produção
destruiria os dados — e os gatilhos de envio poderiam disparar mensagem real para lead.

Só continuo com host local (${HOSTS_PERMITIDOS.join(' ou ')}) na porta ${PORTA_LOCAL}.
`);
  process.exit(1);
}

console.log(`✓ Banco local confirmado: ${urlDb}\n`);

// ── 4. Recria o banco: migrations + seed (que desliga os gatilhos de envio) ──
console.log('Recriando o banco local (migrations + seed)…');
execSync('npx supabase db reset', { stdio: 'inherit' });

// ── 5. Roda os testes dentro do container ───────────────────────────────────
const container = sh('docker ps --filter "name=supabase_db" --format "{{.Names}}"').trim().split('\n')[0];
if (!container) {
  console.error('✗ Não achei o container do banco (supabase_db_*).');
  process.exit(1);
}

console.log(`\nRodando supabase/tests/rls.sql em ${container}…\n`);
try {
  const saida = execFileSync(
    DOCKER,
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { encoding: 'utf-8', input: sh('cat supabase/tests/rls.sql'), stdio: ['pipe', 'pipe', 'pipe'] },
  );
  console.log(saida);
  console.log('✓ Testes de RLS passaram.');
} catch (e) {
  console.error(`${e.stdout ?? ''}${e.stderr ?? ''}`);
  console.error('\n✗ Testes de RLS falharam.');
  process.exit(1);
}
