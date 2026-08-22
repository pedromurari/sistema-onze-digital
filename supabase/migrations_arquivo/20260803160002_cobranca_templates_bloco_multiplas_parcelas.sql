-- Todos os templates ativos falavam de "sua parcela {{parcela}}" no
-- singular. Cada parcela atrasada entrava na fila como item independente, e
-- um aluno com 2+ parcelas em aberto recebia 2+ mensagens separadas em vez
-- de uma consolidada. Acrescenta um bloco condicional (só aparece quando o
-- envio-cobranca calcula multiplas=true, ou seja, quando o aluno tem mais de
-- 1 parcela em aberto) reaproveitando o motor de template existente
-- ({{#chave}}...{{/chave}} já suportado por renderTemplate), em vez de criar
-- um tipo de template novo. Guard "NOT LIKE" torna a migration idempotente.
UPDATE public.cobranca_templates
SET mensagem = mensagem || E'\n\n{{#multiplas}}Além dessa, você tem outras parcelas em aberto:\n{{lista_parcelas}}\n\nTotal geral em aberto ({{qtd_parcelas}} parcelas): R$ {{total_devido}}{{/multiplas}}'
WHERE mensagem NOT LIKE '%{{#multiplas}}%';
