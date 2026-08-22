-- Turmas (edições) de cada bônus + registro de em qual turma o aluno entrou.
--
-- Cada bônus (PNL, CICATRIZES...) roda em edições próprias, com grupo de WhatsApp
-- separado — não dá pra reaproveitar `turmas`, que carrega mensalidade/vencimento
-- e alimenta a geração de parcelas. Daí uma lista enxuta por bônus.

-- 1) Edições de cada bônus --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bonus_turmas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bonus_id UUID NOT NULL REFERENCES public.bonus_tipos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bonus_turmas_bonus_id ON public.bonus_turmas(bonus_id);

ALTER TABLE public.bonus_turmas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "bonus_turmas_authenticated" ON public.bonus_turmas
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Em qual edição do bônus o aluno entrou ---------------------------------
-- aluno_bonus_eventos é append-only: trocar a turma do bônus grava um evento
-- novo, e o mais recente é o que vale (mesma leitura que a UI já faz).
ALTER TABLE public.aluno_bonus_eventos
  ADD COLUMN IF NOT EXISTS bonus_turma_id UUID REFERENCES public.bonus_turmas(id) ON DELETE SET NULL;

-- 3) Em qual turma o aluno entrou no grupo da formação ----------------------
-- Normalmente é a turma da matrícula (alunos.turma_id), mas aluno remanejado
-- pode acabar no grupo de outra — o que vale aqui é onde ele de fato entrou.
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS grupo_turma_id UUID REFERENCES public.turmas(id) ON DELETE SET NULL;

-- Backfill: quem já estava confirmado entrou no grupo da própria turma.
UPDATE public.alunos
SET grupo_turma_id = turma_id
WHERE grupo_turma_confirmado_em IS NOT NULL
  AND grupo_turma_id IS NULL
  AND turma_id IS NOT NULL;
