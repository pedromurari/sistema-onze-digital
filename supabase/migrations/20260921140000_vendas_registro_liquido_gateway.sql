-- Vendas lancadas so no fechamento (linhas 'registro', ex: Vanderleia PNL R$497)
-- tambem descontam a taxa de gateway: valor_venda - taxa real do pagamento do
-- aluno ligado (Vanderleia: 497 - 24,76 = 472,24). A comissao dela estava com
-- aluno_id nulo; ligada ao cadastro (93dc4eeb...) so pra achar a taxa.
-- Corpo das duas funcoes = migration vendas_registro_liquido_gateway aplicada em
-- producao (time_comercial_alunos_vendedor e time_comercial_minhas_vendas).
UPDATE public.comissoes_vendedores SET aluno_id = '93dc4eeb-dede-43cc-a3c1-8dc2475dbea6'
 WHERE id = '9248740a-e7d6-4bf0-9065-62e46fc5da20' AND aluno_id IS NULL;
