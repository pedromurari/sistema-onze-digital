-- Pedido do Pedro (08/11/2026): a página /diva estava sem depoimentos e
-- sem rodapé com contato/redes sociais. diva_config já existia mas só com
-- video_captura_url, criada ad-hoc direto no banco (sem migration) -- esta
-- migration versiona o que já existe e adiciona os campos novos, editáveis
-- por um painel de configuração dentro do CRM (aba Diretoria do Divã).
alter table public.diva_config
  add column if not exists video_captura_url text,
  add column if not exists whatsapp_contato text,
  add column if not exists redes_sociais jsonb not null default '[]'::jsonb,
  add column if not exists depoimentos jsonb not null default '[]'::jsonb;

comment on column public.diva_config.redes_sociais is 'Array de {label, url} -- links de rodapé da página /diva (Instagram, TikTok etc.).';
comment on column public.diva_config.depoimentos is 'Array de {nome, texto, video_url} -- depoimentos de clientes/alunos na página /diva. video_url opcional (texto sozinho já renderiza).';
