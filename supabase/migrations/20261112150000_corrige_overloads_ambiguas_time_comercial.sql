-- Bug grave achado pelo dono do produto (2026-11-12), a partir do sintoma
-- "Vendas fechadas: 0" na Visão Geral com uma venda real na tela do lado.
--
-- Três funções do Time Comercial tinham DUAS versões cada -- uma sem
-- parâmetro nenhum e outra com o mesmo nome aceitando um parâmetro opcional
-- (p_mes ou p_num_parcelas) com DEFAULT NULL. Como uma função com todos os
-- parâmetros tendo DEFAULT já pode ser chamada sem argumento nenhum, manter
-- as duas versões ao mesmo tempo torna a chamada sem argumento AMBÍGUA --
-- o Postgres recusa escolher ("function is not unique") e a RPC falha.
--
-- time_comercial_alunos_vendedor() e time_comercial_resumo_vendedor()
-- falhavam de verdade (o frontend chama sem nenhum argumento pra pegar o
-- total geral), zerando silenciosamente "Vendas fechadas", ticket médio,
-- leads trabalhados etc. na visão "Todos" (admin) -- sem erro visível pro
-- usuário, só os números errados.
--
-- matricula_time_comercial_criar não estava quebrando na prática porque o
-- único chamador real (MatriculaTimeComercial.tsx) sempre manda a chave
-- p_num_parcelas (mesmo null), o que desambigua -- mas é a função mais
-- crítica do módulo (cria a matrícula/pré-matrícula de verdade) e qualquer
-- chamada futura sem essa chave cairia na mesma armadilha. Limpo também.
DROP FUNCTION IF EXISTS public.time_comercial_alunos_vendedor();
GRANT EXECUTE ON FUNCTION public.time_comercial_alunos_vendedor(text) TO authenticated;

DROP FUNCTION IF EXISTS public.time_comercial_resumo_vendedor();
GRANT EXECUTE ON FUNCTION public.time_comercial_resumo_vendedor(text) TO authenticated;

DROP FUNCTION IF EXISTS public.matricula_time_comercial_criar(
  text, text, text, text, text, text, date, text, text, text, text, text, integer, text, text, text, numeric, numeric, text, date
);
GRANT EXECUTE ON FUNCTION public.matricula_time_comercial_criar(
  text, text, text, text, text, text, date, text, text, text, text, text, integer, text, text, text, numeric, numeric, text, date, integer
) TO anon, authenticated;
