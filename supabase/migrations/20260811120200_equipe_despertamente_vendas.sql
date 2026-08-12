-- Registra os dois agentes de IA que atendem WhatsApp (SDR de leads diretos e
-- o assistente de cobrança já existente) como membros visíveis da Equipe
-- Despertamente (Equipe11ds.tsx) -- mesmo padrão "ficha de cargo" usado pelos
-- outros times (ver migrations de 2026-07-17 do time de mídia): texto autoral
-- descrevendo o que o agente realmente faz, não gerado por IA a cada abertura.
--
-- Diferente dos times de Posts&Criativos/Vídeo/Financeiro/Operações, esses
-- dois agentes não participam do fluxo de "peça uma ordem -> plano ->
-- confirmação" (equipe-11ds-orquestrador) -- eles reagem sozinhos a mensagens
-- de WhatsApp via evo-resposta. Por isso não têm tarefas/recorrentes; a ficha
-- de cargo é só pra visibilidade de como cada um trabalha. O SDR ganha um
-- painel extra (fora desta migration, em Equipe11ds.tsx) pra aprovar
-- conhecimento novo aprendido com o time humano.

INSERT INTO public.equipe_11ds_times (id, nome, slug, emoji, ordem)
VALUES ('a1e6a6d0-6b1a-4c1a-9e6a-7f8c9d0e1f20', 'Vendas & Atendimento', 'vendas-atendimento', '💬', 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipe_11ds_agentes
  (time_id, nome, cargo, slug, ordem, executor_function, responsabilidade, regras, aplica)
VALUES
  (
    'a1e6a6d0-6b1a-4c1a-9e6a-7f8c9d0e1f20',
    'SDR', 'SDR de Leads — Psicanálise Integrativa', 'sdr-leads-idm', 0,
    'leads-ia-responder',
    'Atende no WhatsApp todo lead que chega pelo botão de anúncio da Formação em Psicanálise Integrativa, entende motivação, urgência e capacidade de investimento antes de apresentar qualquer coisa, e entrega qualificado pra um vendedor humano fechar.',
    ARRAY[
      'Nunca fecha a venda nem manda link de pagamento -- isso é sempre do time humano.',
      'Nunca menciona bônus ou promoção específica, porque isso muda com frequência e é o closer quem apresenta a oferta vigente.',
      'Nunca insiste duas vezes na mesma pergunta quando a resposta do lead continua vaga -- encaminha pra um humano.',
      'Nunca inventa informação sobre o curso: só usa o conhecimento fixo e o conhecimento aprovado pela equipe.'
    ],
    ARRAY['Rapport antes de apresentar', 'Escuta ativa', 'Âncora de preço + condição especial', 'Qualificação orgânica (motivação, urgência, investimento)']
  ),
  (
    'a1e6a6d0-6b1a-4c1a-9e6a-7f8c9d0e1f20',
    'Cobrança', 'Assistente de Cobrança', 'cobranca-ia', 1,
    'cobranca-ia-responder',
    'Responde no WhatsApp quando um aluno em atraso reage a uma mensagem de cobrança, acolhe o motivo do atraso e coleta uma data estimada de pagamento -- nunca negocia valor, desconto ou cancelamento.',
    ARRAY[
      'Nunca oferece desconto, isenção de juros ou parcelamento diferente do já combinado.',
      'Nunca confirma nem nega cancelamento ou suspensão de acesso.',
      'Nunca pede número de cartão, senha ou documento.',
      'Nunca insiste duas vezes pedindo o mesmo esclarecimento.'
    ],
    ARRAY['Coleta de data prometida', 'Handoff por motivo', 'Conhecimento fixo (pagamento via Voomp)']
  )
ON CONFLICT (slug) WHERE slug IS NOT NULL DO NOTHING;
