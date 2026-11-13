-- Fase 7 do Divã IDM (13/11/2026) -- split automático via Mercado Pago,
-- reaproveitando a infra de parceiros/afiliadas que já existe e funciona
-- (parceiros.mp_access_token via OAuth + parceiros_produtos + checkout
-- público /comprar/:produtoId + checkout-criar-pagamento fazendo o split
-- via application_fee). Decisão do Pedro (13/11): abandonar o caminho
-- Asaas (split via subconta/walletId exige contrato de parceiro de
-- indicação + KYC por subconta + Período de Avaliação limitado a
-- R$2.000/60 dias) -- o modelo Mercado Pago já resolve com onboarding bem
-- mais simples (terapeuta loga na própria conta MP e autoriza, só isso).
alter table public.diva_terapeutas
  add column if not exists parceiro_id uuid references public.parceiros(id);

comment on column public.diva_terapeutas.parceiro_id is 'Linka ao parceiro (tabela parceiros, reaproveitada) dono dos produtos/checkout/split desse terapeuta no Mercado Pago. Null = ainda não conectou.';
