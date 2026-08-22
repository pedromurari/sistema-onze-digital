-- Sprint 1.1d — As 5 tabelas que estavam com RLS ligado e ZERO policies.
--
-- Sem policy, RLS nega tudo. Para tabela que so o backend usa isso e o correto
-- (service_role ignora RLS) — mas ficava implicito, ninguem sabia se era proposital.
-- Aqui cada uma vira uma decisao explicita e documentada.
--
-- `seu_numerologo_leads` era o caso quebrado: 51 linhas, tres telas do sistema
-- lendo (SeuNumerologoKanban, DisparosMonitor, AquecimentoLeads) e nenhuma policy
-- — o kanban do Seu Numerologo aparecia vazio para todo mundo.

-- ── Corrige o quebrado ──────────────────────────────────────────────────────
create policy seu_numerologo_leads_authenticated
  on public.seu_numerologo_leads
  for all
  to authenticated
  using (true)
  with check (true);

comment on table public.seu_numerologo_leads is
  'Leads do funil Seu Numerologo. Acesso: usuario logado (escopo por dono entra na sprint 1.3).';

-- ── Confirma o que e so-backend (service_role ignora RLS; nenhuma policy = ninguem mais entra) ──
comment on table public.leads_ia_debounce is
  'Fila de debounce do SDR de IA. Somente service_role (edge function evo-resposta). RLS sem policy e proposital.';

comment on table public.sheet_leads_33 is
  'Espelho bruto de planilha, sem consumidor no app. Somente service_role. RLS sem policy e proposital.';

comment on table public.subtarefas is
  'Tabela vazia e sem consumidor no codigo. Somente service_role ate ser adotada ou removida (sprint 6).';

comment on table public.idm_criativos_log is
  'Log de criativos IDM, sem consumidor no app. Somente service_role. RLS sem policy e proposital.';
