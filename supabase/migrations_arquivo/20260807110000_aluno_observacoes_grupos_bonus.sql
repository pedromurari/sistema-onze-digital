-- Histórico de observações por aluno (substitui o campo único alunos.observacoes) +
-- confirmação de grupo da turma + bônus configuráveis por aluno.

-- 1) Histórico de observações -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.aluno_observacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'resolvido')),
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolvido_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolvido_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_aluno_observacoes_aluno_id ON public.aluno_observacoes(aluno_id);

ALTER TABLE public.aluno_observacoes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "aluno_observacoes_authenticated" ON public.aluno_observacoes
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Confirmação de grupo da turma (flag simples por aluno) -------------------
ALTER TABLE public.alunos ADD COLUMN IF NOT EXISTS grupo_turma_confirmado_em TIMESTAMPTZ;
ALTER TABLE public.alunos ADD COLUMN IF NOT EXISTS grupo_turma_confirmado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3) Lista configurável de bônus -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.bonus_tipos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bonus_tipos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "bonus_tipos_authenticated" ON public.bonus_tipos
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4) Histórico de entrada/saída de bônus por aluno (append-only, como cobranca_logs) --
CREATE TABLE IF NOT EXISTS public.aluno_bonus_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  bonus_id UUID NOT NULL REFERENCES public.bonus_tipos(id) ON DELETE CASCADE,
  acao TEXT NOT NULL CHECK (acao IN ('adicionado', 'removido')),
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aluno_bonus_eventos_aluno_id ON public.aluno_bonus_eventos(aluno_id);

ALTER TABLE public.aluno_bonus_eventos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "aluno_bonus_eventos_authenticated" ON public.aluno_bonus_eventos
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5) Backfill: observações antigas viram a primeira nota do histórico, pendente --
INSERT INTO public.aluno_observacoes (aluno_id, texto, status, created_at)
SELECT id, observacoes, 'pendente', COALESCE(created_at, NOW())
FROM public.alunos
WHERE observacoes IS NOT NULL AND btrim(observacoes) <> '';
