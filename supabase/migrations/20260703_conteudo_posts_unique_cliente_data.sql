-- Evita posts duplicados quando o pipeline roda mais de uma vez pro mesmo
-- cliente/dia (o script agora faz upsert em vez de insert simples).
ALTER TABLE conteudo_posts ADD CONSTRAINT conteudo_posts_cliente_data_unique UNIQUE (cliente_id, data_post);
