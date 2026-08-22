-- ============================================================================
-- Seed do banco LOCAL de desenvolvimento e teste.
--
-- Roda automaticamente no `supabase db reset` / `supabase start`, depois das migrations.
-- NUNCA roda em produção — o Supabase CLI só aplica seed no banco local.
-- ============================================================================

-- ─── PRIMEIRO DE TUDO: desligar o que manda mensagem para fora ──────────────
--
-- Isto tem que ser a primeira coisa do arquivo, antes de qualquer INSERT.
--
-- O banco local nasce das mesmas migrations que a produção, então nasce com os gatilhos
-- de envio junto — e eles apontam para a URL REAL das edge functions, não para uma cópia.
-- Um `insert into lancamento_leads` num teste mandaria WhatsApp de boas-vindas para o
-- número que estivesse na linha. Se esse número for de um lead de verdade (e os dados de
-- teste costumam ser copiados da produção), a mensagem chega na pessoa.
--
-- `disable trigger` é local a este banco. A produção não é afetada.
alter table public.lancamento_leads disable trigger lancamento_lead_bv;
alter table public.npa_evento_leads disable trigger npa_bv_auto;
alter table public.npa_evento_leads disable trigger npa_pix_auto;
alter table public.npa_evento_leads disable trigger trg_npa_bv_email;
alter table public.lancamento_leads disable trigger trg_auto_disparo_36;

-- Deixa registrado no próprio banco, para quem abrir o psql e se perguntar.
comment on database postgres is
  'BANCO LOCAL DE TESTE. Gatilhos de envio (boas-vindas, PIX, disparo) desligados pelo seed.';

-- ─── Pessoas da equipe, uma por papel ───────────────────────────────────────
--
-- Ids fixos para os testes poderem referenciá-los sem consultar. Não são pessoas reais.
do $$
declare
  v_admin      uuid := '00000000-0000-4000-a000-000000000001';
  v_gestor     uuid := '00000000-0000-4000-a000-000000000002';
  v_vendedor   uuid := '00000000-0000-4000-a000-000000000003';
  v_investidor uuid := '00000000-0000-4000-a000-000000000004';
  v_parceiro   uuid := '00000000-0000-4000-a000-000000000005';
  v_turma      uuid := '00000000-0000-4000-b000-000000000001';
  v_outra      uuid := '00000000-0000-4000-b000-000000000002';
begin
  -- auth.users é obrigatório: profiles e as policies referenciam auth.uid().
  insert into auth.users (id, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, aud, role)
  select u.id, u.email, 'x', now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'
  from (values
    (v_admin,      'admin@teste.local'),
    (v_gestor,     'gestor@teste.local'),
    (v_vendedor,   'vendedor@teste.local'),
    (v_investidor, 'investidor@teste.local'),
    (v_parceiro,   'parceiro@teste.local')
  ) as u(id, email)
  on conflict (id) do nothing;

  insert into public.profiles (id, nome, email, cor, ativo)
  values
    (v_admin,      'Admin Teste',      'admin@teste.local',      '#A93356', true),
    (v_gestor,     'Gestor Teste',     'gestor@teste.local',     '#4A90E2', true),
    (v_vendedor,   'Vendedor Teste',   'vendedor@teste.local',   '#2E9E6C', true),
    (v_investidor, 'Investidor Teste', 'investidor@teste.local', '#C9762C', true),
    (v_parceiro,   'Parceiro Teste',   'parceiro@teste.local',   '#7B5FBF', true)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values
    (v_admin,      'admin'),
    (v_gestor,     'gestor'),
    (v_vendedor,   'vendedor'),
    (v_investidor, 'investidor'),
    (v_parceiro,   'parceiro')
  on conflict do nothing;

  -- Duas turmas: o investidor só pode ver a primeira.
  -- `tipo` e NOT NULL; os valores em producao sao 'psicanalise' e 'numerologia'.
  insert into public.turmas (id, nome, tipo, produto, valor_mensalidade, total_mensalidades)
  values (v_turma, 'Turma do Investidor', 'psicanalise', 'psicanalise', 100, 12),
         (v_outra, 'Turma de Fora',       'psicanalise', 'psicanalise', 100, 12)
  on conflict (id) do nothing;

  insert into public.user_access_permissions (user_id, allowed_financeiro_turma_ids, allowed_lancamento_ids)
  values (v_investidor, array[v_turma::text], array[]::text[])
  on conflict (user_id) do update set allowed_financeiro_turma_ids = excluded.allowed_financeiro_turma_ids;

  -- Dois alunos, um em cada turma, para o escopo do investidor ter o que separar.
  -- `alunos` NÃO tem gatilho de envio — é seguro inserir.
  -- `dia_vencimento` preenchido de proposito: o gatilho `gerar_mensalidades_aluno` usa
  -- esse valor pra montar as parcelas. (Ele agora tem fallback, mas dado de teste deve
  -- parecer dado real.)
  insert into public.alunos (id, nome, whatsapp, produto, status, turma_id, valor_mensalidade, dia_vencimento, total_mensalidades)
  values
    ('00000000-0000-4000-c000-000000000001', 'Aluno Da Turma', '11900000001', 'psicanalise', 'ativo', v_turma, 100, 10, 12),
    ('00000000-0000-4000-c000-000000000002', 'Aluno De Fora',  '11900000002', 'psicanalise', 'ativo', v_outra, 100, 10, 12)
  on conflict (id) do nothing;

  -- NAO inserimos pagamentos a mao: o gatilho `gerar_mensalidades_aluno` ja cria 12
  -- parcelas por aluno ao matricular. Inserir aqui duplicaria e bagunçaria as contagens
  -- que os testes conferem.

  -- Um lead no pool comum (origem Time Comercial sem vendedor).
  -- `leads` também não tem gatilho de envio.
  insert into public.leads (id, nome, whatsapp, origem)
  values ('00000000-0000-4000-e000-000000000001', 'Lead Do Pool', '11900000003', 'Time Comercial')
  on conflict (id) do nothing;
end $$;
