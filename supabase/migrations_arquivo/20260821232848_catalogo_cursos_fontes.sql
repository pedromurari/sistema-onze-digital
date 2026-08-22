-- Sprint 1.1g — Para o loop de 6.600 requisicoes/dia batendo 403.
--
-- `cursos` e `fontes` so tinham policy de SELECT. O `LeadsContext` carrega as duas,
-- ve zero linhas e tenta semear os valores padrao com INSERT; sem policy de INSERT
-- o Postgres devolve 403, a tabela continua vazia e a proxima carga tenta de novo.
-- Em 24h: 4.110 POST /rest/v1/fontes e 2.489 POST /rest/v1/cursos, todos 403.
-- Efeito visivel pra quem usa: os seletores de curso e de fonte ficam sempre vazios.
--
-- Correcao em duas partes: semear aqui (o cliente para de tentar assim que encontra
-- linha) e dar policy de escrita — camada D do plano: logado le, admin escreve.

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

-- Escrita de catalogo e coisa de admin (a tela que edita, Settings, ja e admin-only).
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
