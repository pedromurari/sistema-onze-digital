-- Autorizado pelo dono em 22/08/2026, apos ver o antes/depois.
--
-- ══ PARTE 1: o padrao do papel `vendedor` estava invertido ══════════════════
--
-- `role_permissoes` concedia 27 permissoes ao vendedor — dashboard, lancamentos, npa,
-- operacoes, mapa_mental, pipeline, franquia_psi, aula_secreta, rodrygo. Praticamente o
-- sistema inteiro. Cada vendedora real era entao podada individualmente: 36 linhas de
-- negacao em `user_permissao_override`, 12 por pessoa.
--
-- Isso ja falhou na pratica. A conta "Teste" tinha 10 negacoes em vez de 12 — faltaram
-- `lancamentos/ver` e `franquia_psi/ver` — e por isso enxergava telas que Helen e Miguel
-- nao enxergam. Ninguem decidiu; esqueceram duas linhas. E um vendedor novo nascia vendo
-- tudo ate alguem lembrar de criar as 12 negacoes na mao.
--
-- Os outros papeis nao tem esse problema: `parceiro` tem 4 concessoes pontuais sobre um
-- padrao vazio, que e a direcao certa. So o vendedor estava ao contrario.
--
-- Permissao efetiva de Helen e Miguel: IDENTICA antes e depois. Conferida contra
-- `public.snapshot_permissao_20260822`, tirada momentos antes desta migration.
-- A conta "Teste" APERTA — passa a ver o mesmo que as outras vendedoras.

begin;

delete from public.role_permissoes where papel::text = 'vendedor';

insert into public.role_permissoes (papel, recurso, acao) values
  -- A carteira: ver e trabalhar aluno. `ver_todos` e decisao do dono — o pool de leads
  -- e comum, e o vendedor precisa do numero para ligar.
  ('vendedor', 'alunos',         'ver'),
  ('vendedor', 'alunos',         'editar'),
  ('vendedor', 'alunos',         'ver_todos'),
  -- Ficha da pessoa: mesma logica de alunos.
  ('vendedor', 'pessoas',        'ver'),
  ('vendedor', 'pessoas',        'editar'),
  ('vendedor', 'pessoas',        'ver_todos'),
  -- A tela onde o vendedor trabalha.
  ('vendedor', 'time_comercial', 'ver'),
  ('vendedor', 'time_comercial', 'editar');

-- As negacoes so existiam para desfazer o excesso do padrao. Agora que o padrao nao
-- concede mais nada alem do acima, todas viraram redundantes. Ruido em tabela de
-- permissao foi o que produziu este bug — nao deixar ruido novo.
delete from public.user_permissao_override o
 using public.user_roles ur
 where ur.user_id = o.user_id
   and ur.role::text = 'vendedor'
   and o.permitido = false;

comment on table public.role_permissoes is
  'Padrao por papel. Regra da casa: o padrao e o MINIMO do cargo, e a excecao vai em user_permissao_override CONCEDENDO. Padrao largo + negacao na mao ja produziu bug — ver a migration vendedor_padrao_restrito_e_split_por_turma.';

-- ══ PARTE 2: o split de receita segue o mesmo escopo dos pagamentos ═════════
--
-- A camada aplicada ha pouco exigia `financeiro/ver` para ler `turma_responsaveis`, e isso
-- ja tirou vendedor e parceiro. Mas a investidora tem `financeiro/ver` limitado as turmas
-- em que investe: os pagamentos dela sao 591 de 2.507, filtrados por
-- `turmas_financeiro_permitidas()`. O split nao tinha esse filtro, entao ela lia as 8
-- linhas — inclusive o percentual dos outros socios em turmas que nao sao dela.
--
-- Mesma regra dos pagamentos, para as duas telas nunca discordarem sobre o que ela ve.
drop policy if exists turma_responsaveis_ver on public.turma_responsaveis;

create policy turma_responsaveis_ver on public.turma_responsaveis
  for select to authenticated
  using (
    tem_permissao('financeiro', 'ver')
    and (
      tem_permissao('financeiro', 'ver_todos')
      or turma_id::text = any (turmas_financeiro_permitidas())
    )
  );

comment on policy turma_responsaveis_ver on public.turma_responsaveis is
  'Mesmo escopo por turma que pagamentos_ver: quem so investe em algumas turmas so ve o split delas.';

commit;
