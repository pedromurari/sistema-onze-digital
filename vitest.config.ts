import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Testes do Sistema 11ds.
 *
 * REGRA DE SEGURANÇA, decidida com o dono: nenhum teste pode enviar mensagem para lead.
 * Isso não é combinado verbal — é estrutural:
 *
 *   - Só entram testes de função pura. Nada aqui abre conexão com o Supabase.
 *   - `src/lib/db/**` é testado com cliente falso, nunca com o real.
 *   - `src/test/sem-envio.test.ts` falha o build se algum teste referenciar uma função
 *     de envio (wpp-enviar, enviar-cobranca, disparar-fase, boas-vindas...).
 *
 * As três tabelas com gatilho de envio são `lancamento_leads` e `npa_evento_leads`
 * (boas-vindas, PIX e e-mail via n8n). Nenhum teste escreve nelas.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Sem setup que importe o cliente do Supabase: se um teste precisar dele, é sinal de
    // que não é teste de função pura e não deveria estar aqui.
    globals: false,
  },
});
