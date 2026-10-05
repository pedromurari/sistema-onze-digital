-- Unifica o planejamento editorial da franqueadora com Operações no CRM interno.
-- Mantém os status legados usados pela equipe 11DS e acrescenta "aprovado",
-- necessário entre revisão e programação no fluxo editorial.
begin;

alter table public.conteudo_calendario
  drop constraint if exists conteudo_calendario_status_check;

alter table public.conteudo_calendario
  add constraint conteudo_calendario_status_check check (
    status = any (array[
      'ideia'::text,
      'roteiro'::text,
      'gravando'::text,
      'editando'::text,
      'aprovado'::text,
      'agendado'::text,
      'publicado'::text
    ])
  );

-- Espelha os cortes que já estavam no calendário editorial da franqueadora.
-- A chave título + data deixa a importação idempotente e evita duplicação caso a
-- migração seja reaplicada em um ambiente restaurado.
with cortes(titulo, data_publicacao, status, link) as (
  values
    ('Corte 01', date '2026-10-05', 'editando', 'https://drive.google.com/file/d/1M1VV0qmWirgYUwl7UjKDFr3YW2RDszpc/view?usp=drivesdk'),
    ('Corte 02', date '2026-10-07', 'editando', 'https://drive.google.com/file/d/1bv4REGd7DiBxor9nk1QhQW41BblFmT8V/view?usp=drivesdk'),
    ('Corte 03', date '2026-10-09', 'editando', 'https://drive.google.com/file/d/18vj7g1TIpu51jWP7nKta0KFvnLlY7gHK/view?usp=drivesdk'),
    ('Corte 04', date '2026-10-12', 'editando', 'https://drive.google.com/file/d/1ZsTDcS0X0H334cdGrKVCOU7peJGqlXzQ/view?usp=drivesdk'),
    ('Corte 05', date '2026-10-14', 'editando', 'https://drive.google.com/file/d/1Cj7a0H53okEZcatpUogBbn4dLIR-6KYr/view?usp=drivesdk'),
    ('Corte 06', date '2026-10-16', 'editando', 'https://drive.google.com/file/d/13vVq9O9HGL3-LOVtSdyr-fSaflnGqF1M/view?usp=drivesdk'),
    ('Corte 07', date '2026-10-19', 'editando', 'https://drive.google.com/file/d/1NEnYj43uB_EkXorrbLw95_WtdtalT4IK/view?usp=drivesdk'),
    ('Corte 08', date '2026-10-21', 'editando', 'https://drive.google.com/file/d/1nYmsdBRxiSiSwxV1gq3QNI0PNvAtrLLf/view?usp=drivesdk'),
    ('Corte 09', date '2026-10-23', 'editando', 'https://drive.google.com/file/d/1hAiMIU5YNCJV8U7_yxtMZMga-Y4kh2Zx/view?usp=drivesdk'),
    ('Corte 10', date '2026-10-26', 'editando', 'https://drive.google.com/file/d/1MJ3BnbKXsAfPWI9vcAvfda-mwExSNerf/view?usp=drivesdk'),
    ('Corte 11', date '2026-10-28', 'ideia', null),
    ('Corte 12', date '2026-10-30', 'ideia', null)
)
insert into public.conteudo_calendario (
  titulo,
  plataforma,
  formato,
  status,
  data_publicacao,
  link,
  observacoes,
  gerado_por
)
select
  cortes.titulo,
  'instagram',
  'reels',
  cortes.status,
  cortes.data_publicacao,
  cortes.link,
  'Importado do calendário editorial da franqueadora.',
  'migracao_franqueadora'
from cortes
where not exists (
  select 1
  from public.conteudo_calendario existente
  where lower(btrim(existente.titulo)) = lower(btrim(cortes.titulo))
    and existente.data_publicacao = cortes.data_publicacao
);

commit;
