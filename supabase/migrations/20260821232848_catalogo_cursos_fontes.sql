-- Sprint 1.1g — Para o loop de 6.600 requisicoes/dia batendo 403.
-- `cursos` e `fontes` so tinham policy de SELECT. O LeadsContext ve zero linhas,
-- tenta semear com INSERT, toma 403, a tabela continua vazia e a proxima carga
-- tenta de novo. Em 24h: 4.110 POST em fontes e 2.489 em cursos, todos 403.
-- Efeito pro usuario: seletores de curso e fonte sempre vazios.

insert into public.cursos (nome)
select unnest(array[
  'Psicanálise Clínica',
  'Formação em Psicanálise',
  'Curso Livre de Psicanálise',
  'Especialização',
  'Supervisão Clínica',
  'Outro'
])
where not exists (select 1 from public.cursos);

insert into public.fontes (nome)
select unnest(array[
  'WhatsApp',
  'Google Forms',
  'Site',
  'Instagram',
  'Facebook',
  'LinkedIn',
  'Indicação',
  'YouTube',
  'Google Ads',
  'Outro'
])
where not exists (select 1 from public.fontes);

create policy cursos_admin_escreve on public.cursos
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

create policy fontes_admin_escreve on public.fontes
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

comment on table public.cursos is 'Catalogo de cursos. Camada D: logado le, admin escreve.';
comment on table public.fontes is 'Catalogo de fontes de lead. Camada D: logado le, admin escreve.';
