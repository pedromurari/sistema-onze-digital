-- Sprint 3g — Fecha duas brechas que a ficha da pessoa expos.
--
-- O teste da `pessoa_timeline` por perfil mostrou a parceira Jocimara com 0 pessoas e
-- 0 vinculos (correto) mas 23.388 eventos na linha do tempo. Duas causas:
--
-- 1) `select_leads` libera o pool comum (`origem = 'Time Comercial'` sem vendedor) para
--    QUALQUER usuario logado, sem exigir nenhuma permissao de recurso. O dono decidiu que
--    leads sao pool comum — mas tambem decidiu que parceiro nao ve nada. As duas decisoes
--    convivem se o pool exigir acesso comercial: quem tem Pipeline ou Time Comercial pega
--    do pool; quem nao tem, nao.
--
-- 2) `leads_historico_fase` (11.615 linhas) escapou de todas as camadas da sprint 1 —
--    continuava com SELECT liberado para authenticated.
--
-- Sozinha, nenhuma das duas aparecia: foi juntar os eventos numa view que tornou visivel
-- que esse dado estava alcancavel por quem nao deveria.

drop policy if exists select_leads on public.leads;
create policy select_leads on public.leads
  for select to authenticated
  using (
    auth.uid() = responsavel_id
    or public.is_gestor()
    or (
      (public.tem_permissao('pipeline', 'ver') or public.tem_permissao('time_comercial', 'ver'))
      and origem = 'Time Comercial'
      and (vendedor is null
           or vendedor = (select p.nome from public.profiles p where p.id = auth.uid()))
    )
  );

drop policy if exists update_leads on public.leads;
create policy update_leads on public.leads
  for update to authenticated
  using (
    auth.uid() = responsavel_id
    or public.is_gestor()
    or (
      (public.tem_permissao('pipeline', 'ver') or public.tem_permissao('time_comercial', 'ver'))
      and origem = 'Time Comercial'
      and (vendedor is null
           or vendedor = (select p.nome from public.profiles p where p.id = auth.uid()))
    )
  );

comment on table public.leads is
  'Pool comum por decisao do dono: quem tem Pipeline ou Time Comercial enxerga os leads sem vendedor e pode pegar. Fora isso, so o dono do lead e gestor/admin.';

select public.aplicar_camada_multi('leads_historico_fase', array['pipeline','time_comercial']);
