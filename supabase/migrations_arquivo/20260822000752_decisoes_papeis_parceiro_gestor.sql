-- Sprint 1.3a — Decisoes do dono sobre papeis (2026-08-21).
--
-- 1) Parceiro nao ve nada do CRM.
-- 2) Pedro Murari vira `gestor`.
-- 3) Vendedor continua enxergando os numeros que precisa pra ligar.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Parceiro sem nenhum recurso do CRM
--
-- Na tela isso ja era verdade sem ninguem saber: `src/pages/Index.tsx:57` desvia quem
-- e `parceiro` para o `ParceiroPortal` antes de montar o CRM. O problema era na API —
-- o papel herdava o default de nao-admin (mesma coisa que um vendedor), entao Jocimara
-- e Renata tinham `financeiro`, `balanco`, `pipeline` e `time_comercial` liberados pra
-- quem chamasse o endpoint direto. Removendo aqui, a sprint 1.3 fecha de verdade.
--
-- O portal delas nao depende disso: `parceiros_entregas`, `parceiros_metas` e cia tem
-- policy propria por dono (`parceiro_id in (select id from parceiros where user_id = auth.uid())`).
delete from public.role_permissoes where papel = 'parceiro'::public.app_role;

comment on table public.role_permissoes is
  'O que cada papel pode por padrao. `parceiro` nao tem nenhuma linha de proposito: parceiro usa o ParceiroPortal, nao o CRM.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Pedro Murari: admin -> gestor
--
-- Motivo: ele ja estava com quase todos os switches desligados na tela de permissoes,
-- mas via tudo assim mesmo, porque `canAccessView` libera admin antes de olhar flag.
-- A tela mentia. `gestor` faz o que se esperava: opera o negocio inteiro, mas nao mexe
-- em Configuracoes, Equipe, Produtos, Parceiros nem nos modulos de midia.
update public.user_roles
   set role = 'gestor'::public.app_role
 where user_id = (select id from public.profiles where nome = 'Pedro Murari')
   and role = 'admin'::public.app_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) As policies que so conheciam `admin` passam a conhecer `gestor`
--
-- Sem isto o Pedro perderia acesso a dado que ele precisa no dia a dia: veria so os
-- proprios leads, nenhuma resposta de lead, e so o proprio perfil — o que quebraria
-- ate as listas de vendedor espalhadas pelo sistema.
--
-- O ramo do vendedor nas policies de `leads` continua intacto: ele segue vendo os
-- proprios leads MAIS os de Time Comercial sem dono ou no nome dele — que e como ele
-- pega contato e liga.
drop policy if exists select_leads on public.leads;
create policy select_leads on public.leads
  for select to authenticated
  using (
    auth.uid() = responsavel_id
    or public.is_gestor()
    or (origem = 'Time Comercial'
        and (vendedor is null
             or vendedor = (select p.nome from public.profiles p where p.id = auth.uid())))
  );

drop policy if exists update_leads on public.leads;
create policy update_leads on public.leads
  for update to authenticated
  using (
    auth.uid() = responsavel_id
    or public.is_gestor()
    or (origem = 'Time Comercial'
        and (vendedor is null
             or vendedor = (select p.nome from public.profiles p where p.id = auth.uid())))
  );

drop policy if exists "admins read lead_respostas" on public.lead_respostas;
create policy lead_respostas_gestor_le on public.lead_respostas
  for select to authenticated
  using (public.is_gestor());

drop policy if exists select_profile on public.profiles;
create policy select_profile on public.profiles
  for select to authenticated
  using (auth.uid() = id or public.is_gestor());

drop policy if exists update_profile on public.profiles;
create policy update_profile on public.profiles
  for update to authenticated
  using (auth.uid() = id or public.is_gestor());

drop policy if exists select_role on public.user_roles;
create policy select_role on public.user_roles
  for select to authenticated
  using (auth.uid() = user_id or public.is_gestor());

-- Mudar papel continua sendo so do admin: gestor nao promove ninguem, nem a si mesmo.
drop policy if exists update_role on public.user_roles;
create policy update_role on public.user_roles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
