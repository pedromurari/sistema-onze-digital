import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Trava contra o retorno de um vazamento que ja aconteceu.
 *
 * Durante meses, cinco telas liam `evolution_config.api_key` e chamavam a Evolution
 * direto do navegador. Qualquer pessoa logada — a vendedora, a professora — conseguia
 * a chave que manda WhatsApp em nome da empresa abrindo o painel de rede.
 *
 * O banco hoje recusa a leitura daquela coluna, entao um retorno acidental quebraria em
 * producao. Este teste faz a quebra acontecer AQUI, com uma mensagem que explica o que
 * fazer, em vez de virar um bug silencioso numa tela que ninguem abre todo dia.
 */

const RAIZ = join(process.cwd(), 'src');

function arquivosFonte(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosFonte(caminho);
    return /\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

// Os tipos gerados descrevem o schema inteiro, chave incluida — descrever nao e ler.
// E este proprio arquivo cita os padroes proibidos para explicar o que procura.
const IGNORAR = [join('integrations', 'supabase', 'types.ts')];

const FONTES = arquivosFonte(RAIZ)
  .filter((f) => !IGNORAR.some((i) => f.includes(i)))
  .filter((f) => !/\.test\.tsx?$/.test(f));

describe('a chave da Evolution nao volta para o navegador', () => {
  it('nenhuma tela faz select(*) em evolution_config', () => {
    // `select('*')` traria a coluna negada junto e o banco recusa a consulta inteira.
    const culpados = FONTES.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return /from\(\s*['"]evolution_config['"]\s*\)[\s\S]{0,120}?select\(\s*['"]\*['"]/.test(src);
    });

    expect(
      culpados,
      'Use COLUNAS_EVOLUTION_VISIVEIS de @/lib/evolution. O banco nega select(*) nessa tabela.',
    ).toEqual([]);
  });

  it('nenhuma tela pede a coluna api_key', () => {
    const culpados = FONTES.filter((f) => {
      const src = readFileSync(f, 'utf8');
      // So dentro de um select(...) — comentario e formulario de escrita nao contam.
      return /select\(\s*['"`][^'"`]*\bapi_key\b/.test(src);
    });

    expect(
      culpados,
      'A leitura de api_key foi revogada para authenticated. Chame a Evolution pela edge function evo-proxy.',
    ).toEqual([]);
  });

  it('nenhuma tela manda a chave da Evolution num header apikey', () => {
    const culpados = FONTES.filter((f) => {
      const src = readFileSync(f, 'utf8');
      // `apikey: supabaseKey` e a chave anonima do Supabase, que e publica por natureza.
      // O que nao pode e a chave da instancia: `apikey: inst.api_key` e variantes.
      return /apikey\s*:\s*[A-Za-z_$][\w$]*\.api_key\b/.test(src);
    });

    expect(
      culpados,
      'Passe pela edge function evo-proxy: ela confere a permissao e injeta a chave no servidor.',
    ).toEqual([]);
  });
});
