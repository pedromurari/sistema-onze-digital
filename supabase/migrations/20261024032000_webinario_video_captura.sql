-- URL opcional do vídeo curto na página de captura, separada da aula longa.
-- Somente adições; vídeos e cadastros existentes permanecem inalterados.
alter table public.webinarios
  add column if not exists captura_video_url text;

grant select (captura_video_url) on public.webinarios to anon;
