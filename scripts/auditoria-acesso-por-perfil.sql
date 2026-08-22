-- ============================================================================
-- Auditoria de acesso por perfil — Sistema 11ds
--
-- Para cada pessoa ativa da equipe, quantas linhas de cada tabela sensível ela
-- REALMENTE alcança. Simula o login trocando `request.jwt.claims`, exatamente como o
-- PostgREST faz quando a pessoa usa o sistema.
--
-- SOMENTE LEITURA. Só faz SELECT e count. Não escreve em lugar nenhum, não chama edge
-- function, não dispara gatilho — pode rodar em produção.
--
-- COMO USAR: cole no SQL Editor do Supabase (precisa de service_role para trocar de papel).
--
-- POR QUE ISTO EXISTE: os três furos encontrados na sprint 3 — parceira enxergando 11.775
-- leads, `leads_historico_fase` esquecida, investidora vendo as 12.121 pessoas — não
-- apareciam lendo o código nem no inventário de policies. Só aparecem contando linha por
-- perfil. Rodar isto depois de mexer em qualquer policy.
--
-- COMO LER: compare com o esperado. Vendedor com número em `pagamentos`, parceiro com
-- número em qualquer coisa, investidor vendo mais que as próprias turmas = investigar.
-- ============================================================================

do $$
declare
  r        record;
  t        text;
  n        bigint;
  linha    text;
  saida    text := '';
  tabelas  text[] := array[
    'pagamentos', 'alunos', 'leads', 'lancamento_leads', 'npa_evento_leads',
    'whatsapp_mensagens', 'cobranca_templates', 'balanco_itens', 'email_config',
    'pessoas', 'pessoa_vinculos', 'leads_historico_fase', 'user_access_permissions'
  ];
begin
  -- Coleta os usuários ANTES de trocar de papel: depois da troca, a RLS de `profiles`
  -- esconde a própria lista (foi o que fez a primeira versão deste script voltar vazia).
  create temp table _auditoria_usuarios on commit drop as
    select p.id, p.nome, coalesce(ur.role::text, '(sem papel)') as papel
      from public.profiles p
      left join public.user_roles ur on ur.user_id = p.id
     where p.ativo;

  for r in select * from _auditoria_usuarios order by papel, nome loop
    linha := '';
    foreach t in array tabelas loop
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims',
                         json_build_object('sub', r.id, 'role', 'authenticated')::text, true);
      begin
        execute format('select count(*) from public.%I', t) into n;
      exception when others then
        n := -1;   -- sem permissão nem para contar
      end;
      perform set_config('role', 'postgres', true);
      linha := linha || format('%s=%s ', t, n);
    end loop;
    saida := saida || format(E'%-18s %-12s %s\n', r.nome, r.papel, linha);
  end loop;

  create temp table _auditoria_resultado as select saida as relatorio;
end $$;

select relatorio from _auditoria_resultado;

-- ── Esperado em 22/08/2026, para comparação ────────────────────────────────
--
--  admin / gestor  : tudo cheio (email_config só admin)
--  vendedor        : pagamentos=0, alunos=198, leads=11693 (pool), pessoas=12121
--  investidor      : pagamentos=576, alunos=42, leads=0, pessoas=42
--  parceiro        : ZERO em tudo (usa o ParceiroPortal, não o CRM)
--
-- Qualquer desvio disso sem uma mudança de permissão correspondente é regressão.
