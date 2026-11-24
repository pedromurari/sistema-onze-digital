-- Formato "live" no calendário de conteúdo (filtro "🔴 Lives" no Social Media).
-- Pedido do Pedro em 24/11/2026: lives do Rodrygo (Instagram/YouTube) viram card próprio.
alter table public.conteudo_calendario drop constraint conteudo_calendario_formato_check;
alter table public.conteudo_calendario add constraint conteudo_calendario_formato_check
  check (formato = any (array['reels','feed','stories','carrossel','video','short','anuncio','live']));
