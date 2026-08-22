-- ── Módulo Pedagógico ─────────────────────────────────────────────────────────

-- Turmas
CREATE TABLE IF NOT EXISTS public.pedagogico_turmas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  status text DEFAULT 'ativa' CHECK (status IN ('ativa', 'encerrada', 'rascunho')),
  professora_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Módulos dentro de cada turma
CREATE TABLE IF NOT EXISTS public.pedagogico_modulos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id uuid NOT NULL REFERENCES public.pedagogico_turmas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  ordem int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Materiais (links, vídeos, documentos)
CREATE TABLE IF NOT EXISTS public.pedagogico_materiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_id uuid NOT NULL REFERENCES public.pedagogico_modulos(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  tipo text DEFAULT 'link' CHECK (tipo IN ('link', 'video', 'documento')),
  url text NOT NULL,
  ordem int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Tarefas com questões em JSONB
CREATE TABLE IF NOT EXISTS public.pedagogico_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_id uuid NOT NULL REFERENCES public.pedagogico_modulos(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text,
  instrucoes text,
  questoes jsonb DEFAULT '[]'::jsonb,
  criterios_ia text,
  pontuacao_max numeric DEFAULT 10,
  data_entrega timestamptz,
  status text DEFAULT 'rascunho' CHECK (status IN ('aberta', 'fechada', 'rascunho')),
  created_at timestamptz DEFAULT now()
);

-- Alunos matriculados por turma
CREATE TABLE IF NOT EXISTS public.pedagogico_alunos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id uuid NOT NULL REFERENCES public.pedagogico_turmas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text,
  whatsapp text,
  documento text,
  created_at timestamptz DEFAULT now()
);

-- Entregas dos alunos
CREATE TABLE IF NOT EXISTS public.pedagogico_entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id uuid NOT NULL REFERENCES public.pedagogico_tarefas(id) ON DELETE CASCADE,
  aluno_nome text NOT NULL,
  aluno_documento text NOT NULL,
  aluno_email text,
  respostas jsonb DEFAULT '{}'::jsonb,
  nota_ia numeric,
  feedback_ia text,
  nota_final numeric,
  feedback_professor text,
  status text DEFAULT 'entregue' CHECK (status IN ('entregue', 'em_correcao', 'corrigido')),
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.pedagogico_turmas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedagogico_modulos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedagogico_materiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedagogico_tarefas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedagogico_alunos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedagogico_entregas  ENABLE ROW LEVEL SECURITY;

-- Authenticated (admin / professora): full access
CREATE POLICY "auth_all_turmas"    ON public.pedagogico_turmas    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_modulos"   ON public.pedagogico_modulos   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_materiais" ON public.pedagogico_materiais FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_tarefas"   ON public.pedagogico_tarefas   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_alunos"    ON public.pedagogico_alunos    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_entregas"  ON public.pedagogico_entregas  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon (alunos sem login): lê tarefas abertas, insere entregas
CREATE POLICY "anon_read_tarefas"    ON public.pedagogico_tarefas  FOR SELECT TO anon USING (status = 'aberta');
CREATE POLICY "anon_read_modulos"    ON public.pedagogico_modulos  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_entregas" ON public.pedagogico_entregas FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_read_entregas"   ON public.pedagogico_entregas FOR SELECT TO anon USING (true);

-- Add 'professora' to user_roles check (if constrained)
-- (No-op if already allows any text — just documents the new role value)
