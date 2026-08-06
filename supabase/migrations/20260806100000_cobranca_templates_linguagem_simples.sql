-- Mensagens de cobrança reescritas em linguagem direta e simples, sempre com a data exata
-- do vencimento (3 dos 8 templates só diziam "X dias em atraso", sem data, obrigando o
-- aluno a fazer conta de cabeça) e corrigindo o typo "envido" -> "enviado". O bloco de
-- múltiplas parcelas também fica mais simples -- a lógica que decide o que entra nele
-- (nunca misturar parcela vencida com parcela que ainda não venceu) já foi corrigida no
-- código (enviar-cobranca/proximoGrupoElegivel e Cobranca.tsx/varsParaGrupo), então o
-- texto do bloco não precisa mais dizer "outras parcelas em aberto" de forma ambígua.
UPDATE public.cobranca_templates
SET mensagem = 'Oi {{nome}}! 👋

Sua parcela {{parcela}} de *R$ {{valor}}* vence em 3 dias, no dia *{{vencimento}}*.

O boleto está no seu e-mail, enviado pela Voomp (parceira da Faculdade Anhanguera). Se não achar, me chama que eu reenvio!

Qualquer dúvida, é só falar comigo 😊

{{#multiplas}}Além dessa, você também tem:
{{lista_parcelas}}

Somando tudo, dá *R$ {{total_devido}}* em {{qtd_parcelas}} parcelas.{{/multiplas}}'
WHERE id = '85a11e84-244b-43f3-a649-ab6a38b23d3f';

UPDATE public.cobranca_templates
SET mensagem = 'Oi {{nome}}! ⏰

Amanhã, dia *{{vencimento}}*, vence sua parcela {{parcela}} de *R$ {{valor}}*.

O boleto está no seu e-mail, enviado pela Voomp (parceira da Faculdade Anhanguera).

Qualquer dúvida, me chama! 😊

{{#multiplas}}Além dessa, você também tem:
{{lista_parcelas}}

Somando tudo, dá *R$ {{total_devido}}* em {{qtd_parcelas}} parcelas.{{/multiplas}}'
WHERE id = '15d7f28e-604b-4555-9082-3e2aefed55ca';

UPDATE public.cobranca_templates
SET mensagem = 'Oi {{nome}}! 📅

*Hoje*, dia {{vencimento}}, vence sua parcela {{parcela}} de *R$ {{valor}}*.

O boleto está no seu e-mail, enviado pela Voomp (parceira da Faculdade Anhanguera).

Depois de pagar, me manda o comprovante que eu confirmo! 😊

{{#multiplas}}Além dessa, você também tem:
{{lista_parcelas}}

Somando tudo, dá *R$ {{total_devido}}* em {{qtd_parcelas}} parcelas.{{/multiplas}}'
WHERE id = '4196c953-9f0b-4537-8360-ed9e78416d52';

UPDATE public.cobranca_templates
SET mensagem = 'Oi {{nome}}, tudo bem?

Sua parcela {{parcela}} de *R$ {{valor}}* venceu no dia {{vencimento}} e ainda não caiu aqui no sistema.

O boleto está no seu e-mail, enviado pela Voomp (parceira da Faculdade Anhanguera).

Se já pagou, me manda o comprovante! 🙂

{{#multiplas}}Além dessa, você também tem:
{{lista_parcelas}}

Somando tudo, dá *R$ {{total_devido}}* em {{qtd_parcelas}} parcelas.{{/multiplas}}'
WHERE id = 'b1aa7040-3bbc-4a79-a749-52ddba4ce03f';

UPDATE public.cobranca_templates
SET mensagem = 'Oi {{nome}},

Sua parcela {{parcela}} de *R$ {{valor}}* venceu no dia {{vencimento}} e está há {{dias_atraso}} dias sem pagamento.

O boleto está no seu e-mail, enviado pela Voomp (parceira da Faculdade Anhanguera).

Precisando de ajuda pra resolver, me chama! Estou aqui pra te ajudar 💙

{{#multiplas}}Além dessa, você também tem:
{{lista_parcelas}}

Somando tudo, dá *R$ {{total_devido}}* em {{qtd_parcelas}} parcelas.{{/multiplas}}'
WHERE id = '6b33d82b-b50b-422e-bb3a-4923acb960a5';

UPDATE public.cobranca_templates
SET mensagem = 'Oi {{nome}},

Sua parcela {{parcela}} de *R$ {{valor}}* venceu no dia {{vencimento}} e já está há {{dias_atraso}} dias em aberto.

Quero muito te ajudar a resolver isso e continuar com você no curso!

O boleto está no seu e-mail, enviado pela Voomp (parceira da Faculdade Anhanguera).

Me chama quando puder 🙏

{{#multiplas}}Além dessa, você também tem:
{{lista_parcelas}}

Somando tudo, dá *R$ {{total_devido}}* em {{qtd_parcelas}} parcelas.{{/multiplas}}'
WHERE id = 'c860cf7d-daf6-4a38-a7b6-f5b84fb5e74c';

UPDATE public.cobranca_templates
SET mensagem = 'Oi {{nome}},

Sua parcela {{parcela}} de *R$ {{valor}}* venceu no dia {{vencimento}} e já está há {{dias_atraso}} dias sem pagamento. Seu acesso pode ser suspenso em breve.

Vamos resolver isso agora? Me chama que a gente encontra uma solução juntos! 🤝

O boleto está no seu e-mail, enviado pela Voomp (parceira da Faculdade Anhanguera).

{{#multiplas}}Além dessa, você também tem:
{{lista_parcelas}}

Somando tudo, dá *R$ {{total_devido}}* em {{qtd_parcelas}} parcelas.{{/multiplas}}'
WHERE id = '3131f2bc-4cca-4c59-862d-f9fbc72ea3dd';
