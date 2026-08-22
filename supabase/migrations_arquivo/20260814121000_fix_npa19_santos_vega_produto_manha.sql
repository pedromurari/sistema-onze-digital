-- Correção de dado: "NPA #19 Santos" estava com vega_produto_id (produto da
-- Turma Manhã) cadastrado igual a vega_produto_tarde -- os dois apontavam pro
-- mesmo produto "Turma Tarde". Isso fazia o vega-webhook, ao receber uma
-- compra real de Turma Tarde, casar com vega_produto_id e rotular a pessoa
-- como "Turma Manhã" (mensagem errada + link de grupo errado).
-- Aplicada diretamente via MCP em 2026-08-14; arquivo adicionado pro
-- histórico de migrations do projeto ficar completo.

update npa_eventos
set vega_produto_id = 'INGRESSO Santos - 29/08 - Turma Manha - IDM Pelo Brasil'
where id = '1c079952-5ce9-4d26-9ca9-d3110bef769e';
