-- A legenda do card serve pro Instagram (Reels). O YouTube Shorts precisa de titulo
-- proprio (curto, com peso de busca) e descricao propria, com CTA e links diferentes.
alter table conteudo_calendario
  add column if not exists titulo_youtube text,
  add column if not exists descricao_youtube text;

comment on column conteudo_calendario.titulo_youtube is 'Titulo para publicar no YouTube Shorts (separado do titulo interno do card)';
comment on column conteudo_calendario.descricao_youtube is 'Descricao para publicar no YouTube Shorts (separada da legenda do Instagram)';
