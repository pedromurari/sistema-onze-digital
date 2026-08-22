-- ================================================================
-- Sistema de Cobrança Automatizada com Evolution API (WhatsApp)
-- ================================================================

-- 1. Configuração da instância Evolution API
CREATE TABLE IF NOT EXISTS public.evolution_config (
  id            TEXT PRIMARY KEY DEFAULT 'default',
  api_url       TEXT NOT NULL DEFAULT '',
  api_key       TEXT NOT NULL DEFAULT '',
  instance_name TEXT NOT NULL DEFAULT '',
  ativo         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.evolution_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='evolution_config' AND policyname='evolution_config_authenticated') THEN
    CREATE POLICY "evolution_config_authenticated" ON public.evolution_config
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO public.evolution_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- 2. Configuração das regras de cobrança
CREATE TABLE IF NOT EXISTS public.cobranca_config (
  id                      TEXT PRIMARY KEY DEFAULT 'default',
  ativo                   BOOLEAN NOT NULL DEFAULT FALSE,
  horario_envio           TIME NOT NULL DEFAULT '09:00',
  dias_pre_vencimento     INTEGER[] NOT NULL DEFAULT '{3,1}',
  enviar_pre_vencimento   BOOLEAN NOT NULL DEFAULT TRUE,
  enviar_no_vencimento    BOOLEAN NOT NULL DEFAULT TRUE,
  dias_pos_vencimento     INTEGER[] NOT NULL DEFAULT '{1,3,7,15}',
  enviar_pos_vencimento   BOOLEAN NOT NULL DEFAULT TRUE,
  enviar_apenas_dias_uteis BOOLEAN NOT NULL DEFAULT TRUE,
  pausar_fins_semana      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.cobranca_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cobranca_config' AND policyname='cobranca_config_authenticated') THEN
    CREATE POLICY "cobranca_config_authenticated" ON public.cobranca_config
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO public.cobranca_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- 3. Templates de mensagens WhatsApp
CREATE TABLE IF NOT EXISTS public.cobranca_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('pre_vencimento', 'vencimento', 'pos_vencimento', 'quitacao', 'aviso_cancelamento')),
  dias_offset INTEGER NOT NULL DEFAULT 0,
  mensagem    TEXT NOT NULL,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  ordem       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.cobranca_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cobranca_templates' AND policyname='cobranca_templates_authenticated') THEN
    CREATE POLICY "cobranca_templates_authenticated" ON public.cobranca_templates
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Templates padrão
INSERT INTO public.cobranca_templates (nome, tipo, dias_offset, mensagem, ordem) VALUES
(
  'Lembrete 3 dias antes',
  'pre_vencimento',
  -3,
  'Olá {{nome}}! 👋

Passando para lembrar que sua parcela {{parcela}} no valor de *R$ {{valor}}* vence em *3 dias ({{vencimento}})*.

{{#link_pagamento}}Para facilitar, aqui está seu link de pagamento:
{{link_pagamento}}{{/link_pagamento}}

Qualquer dúvida estou à disposição! 😊',
  1
),
(
  'Lembrete 1 dia antes',
  'pre_vencimento',
  -1,
  'Oi {{nome}}! ⏰

Amanhã vence sua parcela {{parcela}} — *R$ {{valor}}*.

{{#link_pagamento}}Link de pagamento: {{link_pagamento}}{{/link_pagamento}}

Aproveite para pagar hoje e não se preocupar amanhã! 🙏',
  2
),
(
  'Aviso no dia do vencimento',
  'vencimento',
  0,
  'Olá {{nome}}! 📅

*Hoje* vence sua parcela {{parcela}} no valor de *R$ {{valor}}*.

{{#link_pagamento}}Clique aqui para pagar: {{link_pagamento}}{{/link_pagamento}}

Após o pagamento, por favor nos confirme! 😊',
  3
),
(
  'Cobrança 1 dia após',
  'pos_vencimento',
  1,
  'Oi {{nome}}, tudo bem?

Notamos que sua parcela {{parcela}} de *R$ {{valor}}* (vencimento {{vencimento}}) ainda não foi identificada em nosso sistema.

{{#link_pagamento}}Caso ainda não tenha pago, o link continua disponível:
{{link_pagamento}}{{/link_pagamento}}

Se já pagou, por favor nos encaminhe o comprovante! 🙂',
  4
),
(
  'Cobrança 3 dias após',
  'pos_vencimento',
  3,
  'Olá {{nome}},

Sua parcela {{parcela}} de *R$ {{valor}}* está com {{dias_atraso}} dias de atraso.

{{#link_pagamento}}Para regularizar: {{link_pagamento}}{{/link_pagamento}}

Precisando de ajuda para encontrar uma solução, me chama! Estamos aqui para te ajudar 💙',
  5
),
(
  'Cobrança 7 dias após',
  'pos_vencimento',
  7,
  'Oi {{nome}},

Passando para verificar sobre a parcela {{parcela}} de *R$ {{valor}}* que está em aberto há {{dias_atraso}} dias.

Gostaríamos muito de encontrar uma solução juntos para que você continue aproveitando o conteúdo!

{{#link_pagamento}}Link de pagamento: {{link_pagamento}}{{/link_pagamento}}

Me retorna quando puder 🙏',
  6
),
(
  'Cobrança 15 dias após',
  'pos_vencimento',
  15,
  'Olá {{nome}},

Sua parcela {{parcela}} de *R$ {{valor}}* está com {{dias_atraso}} dias em atraso e seu acesso pode ser suspenso em breve.

Vamos resolver isso? Entre em contato comigo agora para encontrarmos a melhor solução! 🤝

{{#link_pagamento}}{{link_pagamento}}{{/link_pagamento}}',
  7
),
(
  'Confirmação de Quitação',
  'quitacao',
  0,
  'Olá {{nome}}! 🎉

Recebemos sua parcela {{parcela}} de *R$ {{valor}*. Obrigado!

Seu pagamento foi confirmado e está tudo em dia. Continue aproveitando o curso! 💙',
  8
)
ON CONFLICT DO NOTHING;

-- 4. Log de cobranças enviadas
CREATE TABLE IF NOT EXISTS public.cobranca_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id        UUID REFERENCES public.alunos(id) ON DELETE SET NULL,
  pagamento_id    UUID REFERENCES public.pagamentos(id) ON DELETE SET NULL,
  aluno_nome      TEXT NOT NULL DEFAULT '',
  telefone        TEXT NOT NULL,
  mensagem        TEXT NOT NULL,
  template_nome   TEXT,
  template_tipo   TEXT,
  status          TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviado','erro','cancelado')),
  erro_msg        TEXT,
  agendado_para   TIMESTAMPTZ,
  enviado_em      TIMESTAMPTZ,
  enviado_por     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  manual          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cobranca_logs_aluno_idx   ON public.cobranca_logs(aluno_id);
CREATE INDEX IF NOT EXISTS cobranca_logs_status_idx  ON public.cobranca_logs(status);
CREATE INDEX IF NOT EXISTS cobranca_logs_created_idx ON public.cobranca_logs(created_at DESC);

ALTER TABLE public.cobranca_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cobranca_logs' AND policyname='cobranca_logs_authenticated') THEN
    CREATE POLICY "cobranca_logs_authenticated" ON public.cobranca_logs
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. Campo no aluno para desativar cobrança individual
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS cobranca_ativa     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS cobranca_telefone  TEXT,
  ADD COLUMN IF NOT EXISTS ultimo_contato_em  TIMESTAMPTZ;

-- 6. Função utilitária: busca alunos inadimplentes com dados de pagamento para cobrança
CREATE OR REPLACE FUNCTION public.get_alunos_para_cobranca(p_data DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  aluno_id        UUID,
  aluno_nome      TEXT,
  telefone        TEXT,
  pagamento_id    UUID,
  valor           NUMERIC,
  parcela         INTEGER,
  data_vencimento DATE,
  dias_offset     INTEGER,
  link_pagamento  TEXT
) LANGUAGE sql STABLE AS $$
  SELECT
    a.id            AS aluno_id,
    a.nome          AS aluno_nome,
    COALESCE(a.cobranca_telefone, a.whatsapp) AS telefone,
    p.id            AS pagamento_id,
    p.valor,
    p.numero_parcela AS parcela,
    p.data_vencimento,
    (p_data - p.data_vencimento)::INTEGER AS dias_offset,
    COALESCE(a.asaas_link, a.voomp_link, '') AS link_pagamento
  FROM public.pagamentos p
  JOIN public.alunos     a ON a.id = p.aluno_id
  WHERE
    a.status NOT IN ('cancelado', 'concluido')
    AND a.cobranca_ativa = TRUE
    AND a.forma_pagamento = 'boleto'
    AND p.status IN ('pendente', 'atrasado')
    AND COALESCE(a.cobranca_telefone, a.whatsapp) IS NOT NULL
    AND COALESCE(a.cobranca_telefone, a.whatsapp) <> ''
  ORDER BY a.nome, p.data_vencimento;
$$;
