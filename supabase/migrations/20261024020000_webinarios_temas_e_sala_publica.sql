-- Somente adições: leitura pública mínima para a sala, três campanhas e
-- pendências editoriais. Não publica vídeo que ainda não foi gravado.
begin;

grant select (id, nome, slug, video_url, video_duracao_segundos,
  oferta_offset_segundos, grupo_whatsapp_url, ativo)
  on public.webinarios to anon;
create policy webinarios_anon_ativos on public.webinarios for select to anon
  using (ativo = true);

grant select (id, webinario_id, inicio_em, status)
  on public.webinario_sessoes to anon;
create policy webinario_sessoes_anon_ativas on public.webinario_sessoes
  for select to anon using (
    exists (select 1 from public.webinarios w
      where w.id = webinario_id and w.ativo = true)
  );

insert into public.webinarios
  (nome, slug, produto_id, video_url, video_duracao_segundos,
   oferta_offset_segundos, ativo)
values
  ('A escuta que vai além do conselho', 'escuta-psicanalitica',
   '5b249002-ce8c-4836-8d4d-6f6f3b2d376c', null, null, null, true),
  ('Por que repetimos padrões?', 'padroes-emocionais',
   '5b249002-ce8c-4836-8d4d-6f6f3b2d376c', null, null, null, true),
  ('O caminho de formação em psicanálise', 'formacao-psicanalise',
   '5b249002-ce8c-4836-8d4d-6f6f3b2d376c', null, null, null, true)
on conflict (slug) do nothing;

-- A grade diária do cron continuará nos dias seguintes. Este seed garante
-- que os formulários já tenham uma sessão disponível antes do próximo cron.
insert into public.webinario_sessoes (webinario_id, inicio_em)
select w.id, horario.inicio_em
from public.webinarios w
cross join generate_series(0, 2) as dias(d)
cross join generate_series(6, 23) as horas(h)
cross join (values (0), (30)) as minutos(m)
cross join lateral (
  select (((timezone('America/Sao_Paulo', now())::date + dias.d)::timestamp
    + make_interval(hours => horas.h, mins => minutos.m))
    at time zone 'America/Sao_Paulo') as inicio_em
) horario
where w.slug in ('escuta-psicanalitica', 'padroes-emocionais', 'formacao-psicanalise')
  and not (horas.h = 23 and minutos.m = 30)
  and not exists (
    select 1 from public.webinario_sessoes s
    where s.webinario_id = w.id
      and s.inicio_em = horario.inicio_em
  );

with pautas(titulo, data_publicacao, legenda, observacoes) as (
  values
    ('[Webinário] Rodrygo gravar — A escuta que vai além do conselho', date '2026-10-27',
     'Por que ouvir não é o mesmo que escutar? Uma aula gratuita sobre escuta, ética e formação em psicanálise. CTA: Quero assistir à aula gratuita.',
     'Responsável: Rodrygo Murari. PENDÊNCIA DE GRAVAÇÃO. Roteiro integral: CRM > Canais de Aquisição > Webinário > A escuta que vai além do conselho > Configuração > Roteiro. Arquivo-fonte: docs/campanhas/WEBINARIO-01-ESCUTA.md. Link de captura: https://sistema.idmpsi.com.br/webinario/escuta-psicanalitica. Data sugerida, ajustar com Rodrygo. Não programar publicação antes de subir vídeo real no R2.'),
    ('[Webinário] Rodrygo gravar — Por que repetimos padrões?', date '2026-10-28',
     'Você percebe um padrão — mas por que ele se repete? Aula gratuita sobre repetição, contexto e perguntas melhores, sem diagnóstico rápido. CTA: Quero assistir à aula gratuita.',
     'Responsável: Rodrygo Murari. PENDÊNCIA DE GRAVAÇÃO. Roteiro integral: CRM > Canais de Aquisição > Webinário > Por que repetimos padrões? > Configuração > Roteiro. Arquivo-fonte: docs/campanhas/WEBINARIO-02-PADROES.md. Link de captura: https://sistema.idmpsi.com.br/webinario/padroes-emocionais. Data sugerida, ajustar com Rodrygo. Não programar publicação antes de subir vídeo real no R2.'),
    ('[Webinário] Rodrygo gravar — O caminho de formação em psicanálise', date '2026-10-29',
     'Quer estudar psicanálise? Comece entendendo o caminho, não só o certificado. Aula gratuita sobre teoria, escuta, ética e prática. CTA: Quero assistir à aula gratuita.',
     'Responsável: Rodrygo Murari. PENDÊNCIA DE GRAVAÇÃO. Roteiro integral: CRM > Canais de Aquisição > Webinário > O caminho de formação em psicanálise > Configuração > Roteiro. Arquivo-fonte: docs/campanhas/WEBINARIO-03-FORMACAO.md. Link de captura: https://sistema.idmpsi.com.br/webinario/formacao-psicanalise. Data sugerida, ajustar com Rodrygo. Não programar publicação antes de subir vídeo real no R2.')
)
insert into public.conteudo_calendario
  (titulo, plataforma, formato, status, data_publicacao, legenda,
   observacoes, gerado_por, tipo_conteudo, produto_slug)
select p.titulo, 'youtube', 'video', 'roteiro', p.data_publicacao,
  p.legenda, p.observacoes, 'codex_webinario', 'ambos',
  (select slug from public.produtos where id = '5b249002-ce8c-4836-8d4d-6f6f3b2d376c')
from pautas p
where not exists (select 1 from public.conteudo_calendario c
  where c.titulo = p.titulo);

commit;
