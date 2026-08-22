ALTER TABLE boas_vindas_config
  ADD COLUMN IF NOT EXISTS wpp_message_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS wpp_media_url text;
