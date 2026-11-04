-- A migration inicial criou policies staff sem TO authenticated. O Postgres
-- avaliava tem_permissao() também para anon e rejeitava a leitura pública.
-- Apenas restringe o alvo dessas policies; não toca em dados.
begin;
alter policy webinarios_ver on public.webinarios to authenticated;
alter policy webinario_sessoes_ver on public.webinario_sessoes to authenticated;
alter policy webinario_mensagens_chat_ver on public.webinario_mensagens_chat to authenticated;
commit;
