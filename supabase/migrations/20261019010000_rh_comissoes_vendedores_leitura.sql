-- RH passa a ler as comissoes dos vendedores (pedido do Pedro 19/10/2026).
-- Leitura apenas: quem tem rh.ver ve; alteracoes continuam so pelo dono.
create policy comissoes_vendedores_rh_ver on public.comissoes_vendedores
  for select using (( select public.tem_permissao('rh'::text, 'ver'::text) ));

-- Liga o profissional ao nome que aparece em comissoes_vendedores.vendedor.
alter table public.profissionais add column comissoes_vendedor text;
update public.profissionais set comissoes_vendedor = 'Helen Magna' where id = '9ab813c1-f1f0-4e97-9eff-2bc5f04bca9a';
