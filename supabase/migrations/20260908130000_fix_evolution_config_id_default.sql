-- Bug real achado 2026-09-08: evolution_config.id (PK) tinha default
-- literal 'default'::text em vez de gerar um identificador unico. Um
-- INSERT sem id explicito (ex: cadastro manual de nova instancia de
-- WhatsApp) caia nesse valor fixo -- funcionava por sorte so enquanto
-- nenhuma outra linha tivesse esse id, e colidiria (erro de PK duplicada)
-- na proxima vez que alguem inserisse sem passar id.
ALTER TABLE public.evolution_config
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
