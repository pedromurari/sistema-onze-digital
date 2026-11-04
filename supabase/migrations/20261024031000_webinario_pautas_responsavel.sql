-- Ajuste aditivo nas três pautas criadas para gravação do Webinário.
update public.conteudo_calendario
set responsavel = 'cac2f265-196c-4a40-98e4-55d661ddd648'
where gerado_por = 'codex_webinario'
  and titulo in (
    '[Webinário] Rodrygo gravar — A escuta que vai além do conselho',
    '[Webinário] Rodrygo gravar — Por que repetimos padrões?',
    '[Webinário] Rodrygo gravar — O caminho de formação em psicanálise'
  )
  and responsavel is null;
