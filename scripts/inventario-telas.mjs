#!/usr/bin/env node
/**
 * Mapa do sistema: cada tela do menu, o que ela usa e em que estado está.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * O pedido do dono foi "cada funcionalidade funcionando, integrada, e claro onde está cada
 * coisa". Isso não é uma tarefa — é um rumo. Para virar trabalho precisa de um mapa, e o
 * mapa precisa ser medido, não opinado: nesta base já apareceram uma tela invisível para
 * todo mundo (kanban do Seu Numerólogo), telas consultando cinco tabelas que não existem, e
 * uma ficha de pessoa construída que só abria de um lugar.
 *
 * O que ele responde, por tela:
 *   - existe o componente?
 *   - as tabelas que ela consulta existem no banco?
 *   - ela passa pela camada de dados ou fala direto com o Supabase?
 *   - abre a ficha da pessoa? (integração)
 *   - qual o tamanho? (tela grande demais é tela poluída)
 *
 * COMO USAR
 * ---------
 *     npm run inventario
 *     npm run inventario -- --json     (para tratar em outra ferramenta)
 *
 * As tabelas inexistentes vêm de `src/integrations/supabase/types.ts`, que é gerado do
 * banco — então a checagem acompanha o banco sozinha, sem lista escrita à mão.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RAIZ, 'src');
const comoJson = process.argv.includes('--json');

// ── Menu: a fonte de verdade do que o usuário enxerga ────────────────────────
const sidebar = readFileSync(join(SRC, 'components/crm/Sidebar.tsx'), 'utf8');
const itens = [...sidebar.matchAll(/\{\s*key:\s*'([a-z_0-9]+)',\s*label:\s*'([^']+)'/g)]
  .map(m => ({ chave: m[1], rotulo: m[2] }));

// Itens repetidos são o menu móvel repetindo o de desktop — não é tela a mais.
const vistos = new Set();
const telas = itens.filter(i => !vistos.has(i.chave) && vistos.add(i.chave));

// ── Onde cada tela é renderizada ─────────────────────────────────────────────
const layout = readFileSync(join(SRC, 'components/crm/CRMLayout.tsx'), 'utf8');

function arquivoDaTela(chave) {
  // O CRMLayout mapeia a chave para o componente via `case 'chave': return <Componente`
  const caso = new RegExp(`case '${chave}':[\\s\\S]{0,200}?<([A-Z][A-Za-z0-9]*)`);
  const m = layout.match(caso);
  if (!m) return null;
  const componente = m[1];
  const candidatos = [];
  (function varre(dir) {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) varre(caminho);
      else if (nome === `${componente}.tsx`) candidatos.push(caminho);
    }
  })(join(SRC, 'components/crm'));
  return candidatos[0] ?? null;
}

// ── Tabelas que existem, segundo os tipos gerados do banco ───────────────────
const tipos = readFileSync(join(SRC, 'integrations/supabase/types.ts'), 'utf8');
const existeNoBanco = (t) =>
  tipos.includes(`      ${t}: {`) || tipos.includes(`\n      ${t}: {`);

// ── Sub-telas: abertas de dentro de outra, não pelo menu ─────────────────────
// LancamentoKanban, NPAKanban e Lancamentos são onde o time mais trabalha e não têm
// entrada no menu. Um mapa que só olha o menu fica cego justamente para as salas mais
// movimentadas — foi o que aconteceu na primeira rodada deste script.
const noMenu = new Set(telas.map(t => arquivoDaTela(t.chave)).filter(Boolean));
const subTelas = [];
(function varre(dir) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) { varre(caminho); continue; }
    if (!nome.endsWith('.tsx') || noMenu.has(caminho)) continue;
    // Só o que tem porte de tela: componente pequeno é peça, não lugar.
    const src = readFileSync(caminho, 'utf8');
    if (src.split('\n').length < 400) continue;
    subTelas.push({ chave: null, rotulo: nome.replace('.tsx', ''), arquivoDireto: caminho });
  }
})(join(SRC, 'components/crm'));

const linhas = [];

for (const tela of [...telas, ...subTelas]) {
  const arquivo = tela.arquivoDireto ?? arquivoDaTela(tela.chave);
  if (!arquivo) {
    linhas.push({ ...tela, estado: 'sem componente no CRMLayout' });
    continue;
  }

  const src = readFileSync(arquivo, 'utf8');

  // `supabase.storage.from('contratos')` é bucket de arquivo, não tabela — e a primeira
  // versão deste script acusou `contratos` como tabela inexistente por causa disso.
  // Um mapa que mente é pior que nenhum mapa.
  const semStorage = src.replace(/storage\s*\.\s*from\(\s*['"][^'"]+['"]\s*\)/g, '');

  const tabelas = [...new Set(
    [...semStorage.matchAll(/\.from\(\s*['"]([a-z_0-9]+)['"]/g)].map(m => m[1]),
  )];
  const fantasmas = tabelas.filter(t => !existeNoBanco(t));

  linhas.push({
    ...tela,
    no_menu: tela.chave !== null,
    arquivo: arquivo.replace(RAIZ + '\\', '').replace(/\\/g, '/'),
    linhas_de_codigo: src.split('\n').length,
    tabelas: tabelas.length,
    tabelas_inexistentes: fantasmas,
    usa_camada_de_dados: src.includes("from '@/lib/db'"),
    chamadas_diretas: (src.match(/supabase\.from\(/g) ?? []).length,
    abre_ficha_da_pessoa: src.includes('NomePessoa') || src.includes('useFichaPessoa'),
  });
}

if (comoJson) {
  console.log(JSON.stringify(linhas, null, 2));
  process.exit(0);
}

// ── Relatório ────────────────────────────────────────────────────────────────
const quebradas = linhas.filter(l => l.tabelas_inexistentes?.length);
const semCamada = linhas.filter(l => l.chamadas_diretas > 0 && !l.usa_camada_de_dados);
const grandes   = linhas.filter(l => l.linhas_de_codigo > 1500);

// Duas entradas de menu apontando para o mesmo componente: o usuário vê duas telas onde
// existe uma. É confusão de navegação, não duplicação de código.
const porArquivo = new Map();
for (const l of linhas) {
  if (!l.arquivo) continue;
  porArquivo.set(l.arquivo, [...(porArquivo.get(l.arquivo) ?? []), l.rotulo]);
}
const compartilhadas = [...porArquivo.entries()].filter(([, r]) => r.length > 1);

console.log('\n  TELA                      linhas  tabelas  diretas  camada  ficha');
console.log('  ' + '─'.repeat(68));
for (const l of linhas.sort((a, b) => (b.linhas_de_codigo ?? 0) - (a.linhas_de_codigo ?? 0))) {
  if (!l.arquivo) { console.log(`  ${l.rotulo.padEnd(24)}  (${l.estado})`); continue; }
  const alerta = l.tabelas_inexistentes.length ? ' ⚠' : '  ';
  console.log(
    `  ${(l.no_menu ? '' : '· ') + l.rotulo}`.padEnd(26) + `${String(l.linhas_de_codigo).padStart(5)}` +
    `${String(l.tabelas).padStart(9)}${String(l.chamadas_diretas).padStart(9)}` +
    `${(l.usa_camada_de_dados ? 'sim' : '—').padStart(8)}` +
    `${(l.abre_ficha_da_pessoa ? 'sim' : '—').padStart(7)}${alerta}`,
  );
}

if (quebradas.length) {
  console.log('\n  TELAS QUE CONSULTAM TABELA INEXISTENTE (abrem e falham em silêncio)');
  for (const l of quebradas) {
    console.log(`    ${l.rotulo}: ${l.tabelas_inexistentes.join(', ')}`);
  }
}

if (compartilhadas.length) {
  console.log('\n  ENTRADAS DE MENU QUE ABREM A MESMA TELA');
  for (const [arquivo, rotulos] of compartilhadas) {
    console.log(`    ${rotulos.join(' e ')} -> ${arquivo.split('/').pop()}`);
  }
}

const doMenu = linhas.filter(l => l.no_menu).length;
console.log(`\n  ${porArquivo.size} telas — ${doMenu} no menu, ${linhas.length - doMenu} abertas de dentro (·)`);
console.log(`  ${quebradas.length} consultam tabela que não existe`);
console.log(`  ${semCamada.length} falam direto com o banco, sem a camada única`);
console.log(`  ${grandes.length} passam de 1.500 linhas`);
console.log(`  ${linhas.filter(l => l.abre_ficha_da_pessoa).length} abrem a ficha da pessoa\n`);
