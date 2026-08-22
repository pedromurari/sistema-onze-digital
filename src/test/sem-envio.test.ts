import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Guarda de segurança: nenhum teste deste projeto pode disparar mensagem para lead.
 *
 * O dono pediu isso explicitamente, e num sistema que manda WhatsApp e e-mail a partir de
 * gatilho de banco não basta tomar cuidado — o cuidado precisa falhar o build quando
 * alguém esquecer.
 *
 * Duas coisas são checadas:
 *   1. Nenhum arquivo de teste menciona uma edge function de envio.
 *   2. Nenhum arquivo de teste escreve nas tabelas que têm gatilho de envio.
 *
 * Se um teste precisar exercitar esse caminho um dia, o jeito é mockar a fronteira —
 * nunca chamar de verdade, nem contra o banco de desenvolvimento.
 */

/** Edge functions que mandam mensagem para fora. */
const FUNCOES_DE_ENVIO = [
  'wpp-enviar',
  'enviar-cobranca',
  'cobranca-ia-responder',
  'boas-vindas-enviar',
  'disparar-fase',
  'disparo-runner',
  'email-enviar',
  'push-enviar',
  'aquecimento-lead-enviar-fase',
  'aquecimento-lead-enviar-isca',
  'aquecimento-worker',
  'leads-ia-responder',
  'leads-ia-followup',
  'evo-resposta',
  'npa-bv-trigger',
  'npa-pix-trigger',
];

/**
 * Tabelas cujo INSERT dispara envio por gatilho no banco.
 * Verificado em 22/08/2026: `lancamento_lead_bv`, `npa_bv_auto`, `npa_pix_auto` e
 * `trg_npa_bv_email` chamam net.http_post.
 */
const TABELAS_COM_GATILHO_DE_ENVIO = ['lancamento_leads', 'npa_evento_leads'];

function arquivosDeTeste(dir: string, achados: string[] = []): string[] {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const caminho = path.join(dir, entrada.name);
    if (entrada.isDirectory()) arquivosDeTeste(caminho, achados);
    else if (entrada.name.endsWith('.test.ts')) achados.push(caminho);
  }
  return achados;
}

describe('guarda de segurança dos testes', () => {
  const testes = arquivosDeTeste(path.resolve(__dirname, '..'))
    .filter(f => !f.endsWith('sem-envio.test.ts'));   // este arquivo cita os nomes de propósito

  it('nenhum teste referencia edge function de envio', () => {
    const infracoes: string[] = [];

    for (const arquivo of testes) {
      const conteudo = fs.readFileSync(arquivo, 'utf-8');
      for (const funcao of FUNCOES_DE_ENVIO) {
        if (conteudo.includes(funcao)) {
          infracoes.push(`${path.relative(process.cwd(), arquivo)} menciona "${funcao}"`);
        }
      }
    }

    expect(infracoes, infracoes.join('\n')).toEqual([]);
  });

  it('nenhum teste escreve em tabela com gatilho de envio', () => {
    const infracoes: string[] = [];

    for (const arquivo of testes) {
      const conteudo = fs.readFileSync(arquivo, 'utf-8');
      for (const tabela of TABELAS_COM_GATILHO_DE_ENVIO) {
        const escreve = new RegExp(`from\\(['"]${tabela}['"]\\)[\\s\\S]{0,200}?\\.(insert|upsert|update)\\(`);
        if (escreve.test(conteudo)) {
          infracoes.push(`${path.relative(process.cwd(), arquivo)} escreve em "${tabela}"`);
        }
      }
    }

    expect(infracoes, infracoes.join('\n')).toEqual([]);
  });

  it('nenhum teste importa o cliente real do Supabase', () => {
    const infracoes: string[] = [];

    for (const arquivo of testes) {
      const conteudo = fs.readFileSync(arquivo, 'utf-8');
      if (conteudo.includes("from '@/integrations/supabase/client'")) {
        infracoes.push(path.relative(process.cwd(), arquivo));
      }
    }

    expect(infracoes, `Estes testes importam o cliente real:\n${infracoes.join('\n')}`).toEqual([]);
  });
});
