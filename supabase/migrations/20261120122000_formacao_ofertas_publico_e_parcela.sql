-- 1) A ficha de inscrição é pública (sem login): precisa ler nome e preço da
--    oferta ativa pra montar a tela. São os mesmos dados que já aparecem na
--    página de vendas aberta na internet -- nada sensível.
--    `formacao_inscricoes` continua fechada (só staff), porque ali tem dado
--    pessoal de comprador.
grant select on public.formacao_ofertas to anon;

drop policy if exists formacao_ofertas_publico_ativo on public.formacao_ofertas;
create policy formacao_ofertas_publico_ativo on public.formacao_ofertas
  for select to anon
  using (ativo = true);

-- 2) O valor da parcela no cartão NÃO é preco/max_parcelas: o Mercado Pago
--    cobra os juros do parcelamento do comprador. No Despertar Sistêmico o
--    Pedro fechou R$497 à vista no Pix ou 12x de R$50,88 (R$610,56 no total)
--    -- a conta ingênua daria R$41,42 e a ficha prometeria um valor que o
--    cartão não vai cobrar.
alter table public.formacao_ofertas
  add column if not exists parcela_cartao numeric(10,2);

comment on column public.formacao_ofertas.parcela_cartao is
  'Valor real da parcela no número máximo de parcelas (já com juros do gateway). Só exibição -- a cobrança usa preco + installments, e o MP aplica os juros.';

update public.formacao_ofertas
   set parcela_cartao = 50.88
 where slug = 'constelacao-familiar';
