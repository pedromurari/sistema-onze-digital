CREATE TABLE IF NOT EXISTS "public"."cobranca_ia_config" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."cobranca_ia_config" OWNER TO "postgres";

ALTER TABLE ONLY "public"."cobranca_ia_config"
    ADD CONSTRAINT "cobranca_ia_config_pkey" PRIMARY KEY ("id");

ALTER TABLE "public"."cobranca_ia_config" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cobranca_ia_config_ver" ON "public"."cobranca_ia_config"
    FOR SELECT USING (tem_permissao('cobranca'::text, 'ver'::text));

CREATE POLICY "cobranca_ia_config_inserir" ON "public"."cobranca_ia_config"
    FOR INSERT WITH CHECK (tem_permissao('cobranca'::text, 'ver'::text) AND tem_permissao('cobranca'::text, 'editar'::text));

CREATE POLICY "cobranca_ia_config_update" ON "public"."cobranca_ia_config"
    FOR UPDATE USING (tem_permissao('cobranca'::text, 'ver'::text) AND tem_permissao('cobranca'::text, 'editar'::text))
    WITH CHECK (tem_permissao('cobranca'::text, 'ver'::text) AND tem_permissao('cobranca'::text, 'editar'::text));

CREATE POLICY "cobranca_ia_config_delete" ON "public"."cobranca_ia_config"
    FOR DELETE USING (tem_permissao('cobranca'::text, 'ver'::text) AND tem_permissao('cobranca'::text, 'editar'::text));

INSERT INTO "public"."cobranca_ia_config" ("id", "ativo") VALUES ('default', false)
ON CONFLICT ("id") DO NOTHING;
