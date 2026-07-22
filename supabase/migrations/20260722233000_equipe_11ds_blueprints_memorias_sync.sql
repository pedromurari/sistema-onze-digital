-- Blueprint visual versionado, memória confiável e auditoria visual da Equipe 11DS.
-- A migração é aditiva para permitir rollout gradual do compositor v2.

CREATE TABLE IF NOT EXISTS public.equipe_11ds_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.conteudo_clientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('tipografico', 'fotografico')),
  versao INTEGER NOT NULL CHECK (versao > 0),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'substituido', 'arquivado')),
  referencia_url TEXT,
  base_visual_url TEXT,
  spec JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  substitui_id UUID REFERENCES public.equipe_11ds_blueprints(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, tipo, versao)
);

CREATE UNIQUE INDEX IF NOT EXISTS equipe_11ds_blueprints_ativo_cliente_tipo_idx
  ON public.equipe_11ds_blueprints (cliente_id, tipo)
  WHERE status = 'ativo';
CREATE INDEX IF NOT EXISTS equipe_11ds_blueprints_cliente_idx
  ON public.equipe_11ds_blueprints (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS equipe_11ds_blueprints_criado_por_idx
  ON public.equipe_11ds_blueprints (criado_por);
CREATE INDEX IF NOT EXISTS equipe_11ds_blueprints_substitui_idx
  ON public.equipe_11ds_blueprints (substitui_id);

ALTER TABLE public.equipe_11ds_blueprints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view visual blueprints" ON public.equipe_11ds_blueprints;
CREATE POLICY "Authenticated users can view visual blueprints"
  ON public.equipe_11ds_blueprints FOR SELECT TO authenticated
  USING (true);

ALTER TABLE public.equipe_11ds_memorias
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'agente',
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.conteudo_clientes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS regra TEXT,
  ADD COLUMN IF NOT EXISTS evidencia JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS agentes_consumidores TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prioridade SMALLINT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS substitui_id UUID REFERENCES public.equipe_11ds_memorias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS github_sha TEXT,
  ADD COLUMN IF NOT EXISTS tentativas_sync SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proxima_tentativa_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sincronizada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS erro_sync TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.equipe_11ds_memorias
  ALTER COLUMN caminho_obsidian DROP NOT NULL;

ALTER TABLE public.equipe_11ds_memorias
  DROP CONSTRAINT IF EXISTS equipe_11ds_memorias_status_check,
  DROP CONSTRAINT IF EXISTS equipe_11ds_memorias_origem_check,
  DROP CONSTRAINT IF EXISTS equipe_11ds_memorias_prioridade_check,
  DROP CONSTRAINT IF EXISTS equipe_11ds_memorias_tentativas_sync_check;

UPDATE public.equipe_11ds_memorias
SET status = CASE status
  WHEN 'invalidada' THEN 'substituida'
  WHEN 'removida' THEN 'arquivada'
  ELSE status
END;

ALTER TABLE public.equipe_11ds_memorias
  ADD CONSTRAINT equipe_11ds_memorias_status_check
    CHECK (status IN ('pendente_sincronizacao', 'ativa', 'substituida', 'arquivada')),
  ADD CONSTRAINT equipe_11ds_memorias_origem_check
    CHECK (origem IN ('usuario', 'agente')),
  ADD CONSTRAINT equipe_11ds_memorias_prioridade_check
    CHECK (prioridade BETWEEN 0 AND 100),
  ADD CONSTRAINT equipe_11ds_memorias_tentativas_sync_check
    CHECK (tentativas_sync BETWEEN 0 AND 10);

CREATE INDEX IF NOT EXISTS equipe_11ds_memorias_cliente_status_idx
  ON public.equipe_11ds_memorias (cliente_id, tipo, prioridade DESC, created_at DESC)
  WHERE status IN ('ativa', 'pendente_sincronizacao');
CREATE INDEX IF NOT EXISTS equipe_11ds_memorias_sync_pendente_idx
  ON public.equipe_11ds_memorias (proxima_tentativa_em, created_at)
  WHERE status = 'pendente_sincronizacao';
CREATE INDEX IF NOT EXISTS equipe_11ds_memorias_substitui_idx
  ON public.equipe_11ds_memorias (substitui_id);
CREATE UNIQUE INDEX IF NOT EXISTS equipe_11ds_memorias_deduplicacao_idx
  ON public.equipe_11ds_memorias (solicitante_id, conteudo_hash)
  WHERE status IN ('ativa', 'pendente_sincronizacao');

ALTER TABLE public.conteudo_posts
  ADD COLUMN IF NOT EXISTS blueprint_id UUID REFERENCES public.equipe_11ds_blueprints(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blueprint_versao INTEGER,
  ADD COLUMN IF NOT EXISTS qa_visual JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS qa_visual_status TEXT NOT NULL DEFAULT 'pendente';

ALTER TABLE public.conteudo_posts
  DROP CONSTRAINT IF EXISTS conteudo_posts_qa_visual_status_check;
ALTER TABLE public.conteudo_posts
  ADD CONSTRAINT conteudo_posts_qa_visual_status_check
    CHECK (qa_visual_status IN ('pendente', 'aprovado', 'reprovado'));

CREATE INDEX IF NOT EXISTS conteudo_posts_blueprint_idx
  ON public.conteudo_posts (blueprint_id);
CREATE INDEX IF NOT EXISTS conteudo_posts_qa_pendente_idx
  ON public.conteudo_posts (created_at DESC)
  WHERE qa_visual_status <> 'aprovado';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'equipe-11ds-referencias',
  'equipe-11ds-referencias',
  true,
  20971520,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users upload own 11DS visual references" ON storage.objects;
CREATE POLICY "Users upload own 11DS visual references"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'equipe-11ds-referencias'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  );

DROP POLICY IF EXISTS "Users update own 11DS visual references" ON storage.objects;
CREATE POLICY "Users update own 11DS visual references"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'equipe-11ds-referencias'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  )
  WITH CHECK (
    bucket_id = 'equipe-11ds-referencias'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  );

DROP POLICY IF EXISTS "Users delete own 11DS visual references" ON storage.objects;
CREATE POLICY "Users delete own 11DS visual references"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'equipe-11ds-referencias'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  );

-- O bucket é público para servir as referências por URL. Não criamos policy de
-- SELECT porque ela também permitiria listar todos os objetos do bucket.
DROP POLICY IF EXISTS "Authenticated users read 11DS visual references" ON storage.objects;

COMMENT ON TABLE public.equipe_11ds_blueprints IS
  'Contratos geométricos e visuais versionados usados pelo compositor da Equipe 11DS.';
COMMENT ON COLUMN public.equipe_11ds_memorias.origem IS
  'Diretivas do usuário não passam pelo veto do Curador; inferências de agente passam pela régua de relevância.';
COMMENT ON COLUMN public.equipe_11ds_memorias.status IS
  'Memória confirmada localmente pode aguardar sincronização com o cofre GitHub/Obsidian.';
