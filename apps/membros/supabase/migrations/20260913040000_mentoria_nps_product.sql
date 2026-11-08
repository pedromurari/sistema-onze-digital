-- Cria o produto "Mentoria NPS" (R$100/mês, 5 mapas/mês enquanto em dia).
-- Segue o mesmo padrão de "Mentoria NPA" (product_type='mentorship'), mas com
-- payment_type='subscription' já que é cobrança recorrente mensal.
insert into public.products (
  slug, title, description, product_type, is_published,
  price, currency, payment_type
) values (
  'mentoria-nps',
  'Mentoria NPS',
  'Acesso a 5 mapas numerológicos (Mapa 7 Esferas) por mês, enquanto a mensalidade estiver em dia.',
  'mentorship',
  true,
  100.00,
  'BRL',
  'subscription'
)
on conflict (slug) do nothing;
