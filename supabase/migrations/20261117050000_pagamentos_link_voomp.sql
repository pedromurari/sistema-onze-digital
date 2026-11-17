-- Link de boleto gerado pela Voomp, por parcela -- mesmo papel de
-- link_pagamento_asaas/link_pagamento_mp, usado pela ficha do aluno (ver
-- `linkBoleto` em src/components/crm/Financeiro.tsx) pra mostrar o botao de
-- copiar link/cobrar tambem em parcelas pagas via Voomp.

alter table public.pagamentos add column if not exists link_pagamento_voomp text;
