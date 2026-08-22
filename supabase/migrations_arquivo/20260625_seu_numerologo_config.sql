-- seu_numerologo_leads: add authenticated read/update policies
CREATE POLICY "auth_read_leads" ON public.seu_numerologo_leads
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_update_leads" ON public.seu_numerologo_leads
  FOR UPDATE TO authenticated USING (true);

-- Config table for Mapa 7 Esperas message templates
CREATE TABLE IF NOT EXISTS public.seu_numerologo_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem_pix_template TEXT NOT NULL DEFAULT 'Olá {{nome}}! 👋

Seu PIX para o Mapa 7 Esperas foi gerado com sucesso.

✔ O pagamento é 100% seguro
✔ Seu mapa é liberado automaticamente após a confirmação

Segue o código PIX logo abaixo:',
  mensagem_compra_template TEXT NOT NULL DEFAULT 'Olá {{nome}}! 🎉

Seu Mapa 7 Esperas foi confirmado com sucesso!

Estou preparando seu mapa numerológico personalizado e enviarei em breve. ✨

Fique de olho nas próximas mensagens!',
  mensagem_envio_mapa TEXT NOT NULL DEFAULT 'Olá {{nome}}! 🌟

Seu Mapa 7 Esperas está pronto!

Seus 7 números:
🔮 Alma: {{alma}}
👁 Imagem: {{imagem}}
✨ Expressão: {{expressao}}
🎯 Talento: {{talento}}
🧠 Psíquico: {{psiquico}}
⭐ Destino: {{destino}}
📅 Ano Pessoal: {{ano_pessoal}}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.seu_numerologo_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sn_config_all" ON public.seu_numerologo_config FOR ALL TO authenticated USING (true);

INSERT INTO public.seu_numerologo_config DEFAULT VALUES ON CONFLICT DO NOTHING;
