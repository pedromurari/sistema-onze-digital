-- Segmentação de leads (DDD/cidade/produto) + Quadros de campanha (kanban customizável
-- por segmento salvo, reaproveitando a infra de kanban_colunas já usada em
-- Lançamento/NPA/Aula Secreta).

-- 1. Lookup estático de DDD -> cidade principal / estado. Aproximado: identifica a
-- região do DDD, não a cidade real do lead (não temos essa informação cadastrada).
CREATE TABLE IF NOT EXISTS public.ddd_regioes (
  ddd    INTEGER PRIMARY KEY,
  cidade TEXT NOT NULL,
  estado TEXT NOT NULL,
  uf     TEXT NOT NULL
);

INSERT INTO public.ddd_regioes (ddd, cidade, estado, uf) VALUES
  (11, 'São Paulo', 'São Paulo', 'SP'),
  (12, 'São José dos Campos', 'São Paulo', 'SP'),
  (13, 'Santos', 'São Paulo', 'SP'),
  (14, 'Bauru', 'São Paulo', 'SP'),
  (15, 'Sorocaba', 'São Paulo', 'SP'),
  (16, 'Ribeirão Preto', 'São Paulo', 'SP'),
  (17, 'São José do Rio Preto', 'São Paulo', 'SP'),
  (18, 'Presidente Prudente', 'São Paulo', 'SP'),
  (19, 'Campinas', 'São Paulo', 'SP'),
  (21, 'Rio de Janeiro', 'Rio de Janeiro', 'RJ'),
  (22, 'Campos dos Goytacazes', 'Rio de Janeiro', 'RJ'),
  (24, 'Volta Redonda', 'Rio de Janeiro', 'RJ'),
  (27, 'Vitória', 'Espírito Santo', 'ES'),
  (28, 'Cachoeiro de Itapemirim', 'Espírito Santo', 'ES'),
  (31, 'Belo Horizonte', 'Minas Gerais', 'MG'),
  (32, 'Juiz de Fora', 'Minas Gerais', 'MG'),
  (33, 'Governador Valadares', 'Minas Gerais', 'MG'),
  (34, 'Uberlândia', 'Minas Gerais', 'MG'),
  (35, 'Poços de Caldas', 'Minas Gerais', 'MG'),
  (37, 'Divinópolis', 'Minas Gerais', 'MG'),
  (38, 'Montes Claros', 'Minas Gerais', 'MG'),
  (41, 'Curitiba', 'Paraná', 'PR'),
  (42, 'Ponta Grossa', 'Paraná', 'PR'),
  (43, 'Londrina', 'Paraná', 'PR'),
  (44, 'Maringá', 'Paraná', 'PR'),
  (45, 'Cascavel', 'Paraná', 'PR'),
  (46, 'Francisco Beltrão', 'Paraná', 'PR'),
  (47, 'Joinville', 'Santa Catarina', 'SC'),
  (48, 'Florianópolis', 'Santa Catarina', 'SC'),
  (49, 'Chapecó', 'Santa Catarina', 'SC'),
  (51, 'Porto Alegre', 'Rio Grande do Sul', 'RS'),
  (53, 'Pelotas', 'Rio Grande do Sul', 'RS'),
  (54, 'Caxias do Sul', 'Rio Grande do Sul', 'RS'),
  (55, 'Santa Maria', 'Rio Grande do Sul', 'RS'),
  (61, 'Brasília', 'Distrito Federal', 'DF'),
  (62, 'Goiânia', 'Goiás', 'GO'),
  (63, 'Palmas', 'Tocantins', 'TO'),
  (64, 'Rondonópolis', 'Mato Grosso', 'MT'),
  (65, 'Cuiabá', 'Mato Grosso', 'MT'),
  (66, 'Sinop', 'Mato Grosso', 'MT'),
  (67, 'Campo Grande', 'Mato Grosso do Sul', 'MS'),
  (68, 'Rio Branco', 'Acre', 'AC'),
  (69, 'Porto Velho', 'Rondônia', 'RO'),
  (71, 'Salvador', 'Bahia', 'BA'),
  (73, 'Ilhéus', 'Bahia', 'BA'),
  (74, 'Juazeiro', 'Bahia', 'BA'),
  (75, 'Feira de Santana', 'Bahia', 'BA'),
  (77, 'Vitória da Conquista', 'Bahia', 'BA'),
  (79, 'Aracaju', 'Sergipe', 'SE'),
  (81, 'Recife', 'Pernambuco', 'PE'),
  (82, 'Maceió', 'Alagoas', 'AL'),
  (83, 'João Pessoa', 'Paraíba', 'PB'),
  (84, 'Natal', 'Rio Grande do Norte', 'RN'),
  (85, 'Fortaleza', 'Ceará', 'CE'),
  (86, 'Teresina', 'Piauí', 'PI'),
  (87, 'Petrolina', 'Pernambuco', 'PE'),
  (88, 'Juazeiro do Norte', 'Ceará', 'CE'),
  (89, 'Picos', 'Piauí', 'PI'),
  (91, 'Belém', 'Pará', 'PA'),
  (93, 'Santarém', 'Pará', 'PA'),
  (94, 'Marabá', 'Pará', 'PA'),
  (95, 'Boa Vista', 'Roraima', 'RR'),
  (96, 'Macapá', 'Amapá', 'AP'),
  (97, 'Tefé', 'Amazonas', 'AM'),
  (98, 'São Luís', 'Maranhão', 'MA'),
  (99, 'Imperatriz', 'Maranhão', 'MA')
ON CONFLICT (ddd) DO NOTHING;

ALTER TABLE public.ddd_regioes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ddd_regioes' AND policyname='ddd_regioes_authenticated_read') THEN
    CREATE POLICY "ddd_regioes_authenticated_read" ON public.ddd_regioes
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- 2. Quadros de campanha: um segmento salvo (filtro) + kanban de fases próprio.
CREATE TABLE IF NOT EXISTS public.leads_quadros (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  filtro     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leads_quadros ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leads_quadros' AND policyname='leads_quadros_authenticated') THEN
    CREATE POLICY "leads_quadros_authenticated" ON public.leads_quadros
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. kanban_colunas ganha um dono a mais: um quadro de leads (reaproveita a mesma
-- tabela/hook que já serve Lançamento, NPA e Aula Secreta).
ALTER TABLE public.kanban_colunas
  ADD COLUMN IF NOT EXISTS leads_quadro_id UUID REFERENCES public.leads_quadros(id) ON DELETE CASCADE;

-- 4. Cartões: qual lead está em qual coluna, dentro de qual quadro. Um mesmo lead
-- pode aparecer em vários quadros independentemente.
CREATE TABLE IF NOT EXISTS public.leads_quadro_cards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quadro_id     UUID NOT NULL REFERENCES public.leads_quadros(id) ON DELETE CASCADE,
  origem_tabela TEXT NOT NULL,
  origem_id     UUID NOT NULL,
  coluna_id     UUID REFERENCES public.kanban_colunas(id) ON DELETE SET NULL,
  observacoes   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quadro_id, origem_tabela, origem_id)
);

ALTER TABLE public.leads_quadro_cards ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leads_quadro_cards' AND policyname='leads_quadro_cards_authenticated') THEN
    CREATE POLICY "leads_quadro_cards_authenticated" ON public.leads_quadro_cards
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. View leads_unificados ganha ddd/cidade/estado (derivados do telefone, best-effort
-- via regex — números malformados podem não resolver) e produto (coluna já existente
-- em lancamentos.produto_destino / alunos.produto / seu_numerologo_leads.produto;
-- NPA não tem produto próprio, vira rótulo fixo).
DROP VIEW IF EXISTS public.leads_unificados;

CREATE VIEW public.leads_unificados AS
WITH base AS (
  SELECT
    'lancamento_leads'::text AS origem_tabela,
    ll.id AS origem_id,
    'Lançamento: ' || COALESCE(l.nome, '(sem lançamento)') AS origem,
    ll.nome,
    ll.whatsapp AS telefone,
    ll.email,
    COALESCE(kc.nome, '(sem fase)') AS fase,
    CASE
      WHEN kc.nome ILIKE '%matríc%' OR kc.nome ILIKE '%matric%' THEN 'quente'
      WHEN kc.nome ILIKE '%oferta%' OR kc.nome ILIKE '%negocia%' THEN 'morno'
      ELSE 'frio'
    END AS temperatura,
    COALESCE(ll.bv_enviado, false) AS bv_enviado,
    COALESCE(l.produto_destino, 'Semana do Despertar') AS produto,
    ll.created_at AS criado_em
  FROM public.lancamento_leads ll
  LEFT JOIN public.lancamentos l ON l.id = ll.lancamento_id
  LEFT JOIN public.kanban_colunas kc ON kc.id = NULLIF(ll.fase, '')::uuid

  UNION ALL

  SELECT
    'npa_evento_leads',
    nel.id,
    'Evento NPA: ' || COALESCE(ne.nome, '(sem evento)'),
    nel.nome,
    nel.whatsapp,
    nel.email,
    COALESCE(nel.fase, '(sem fase)'),
    CASE
      WHEN nel.fase = 'matricula' THEN 'quente'
      WHEN nel.fase IN ('ingresso_pago', 'confirmado', 'evento') THEN 'morno'
      ELSE 'frio'
    END,
    COALESCE(nel.bv_enviado, false),
    'IDM Pelo Brasil',
    nel.created_at
  FROM public.npa_evento_leads nel
  LEFT JOIN public.npa_eventos ne ON ne.id = nel.npa_evento_id

  UNION ALL

  SELECT
    'alunos',
    a.id,
    'Aluno: ' || COALESCE(t.nome, '(sem turma)'),
    a.nome,
    a.whatsapp,
    a.email,
    a.status,
    'quente',
    EXISTS (
      SELECT 1 FROM public.boas_vindas_logs bvl
      WHERE bvl.whatsapp = a.whatsapp AND bvl.wpp_status = 'sent'
    ),
    COALESCE(a.produto, '(sem produto)'),
    a.created_at
  FROM public.alunos a
  LEFT JOIN public.turmas t ON t.id = a.turma_id

  UNION ALL

  SELECT
    'seu_numerologo_leads',
    snl.id,
    'Numerólogo',
    snl.nome,
    snl.whatsapp,
    snl.email,
    CASE
      WHEN snl.pago_at IS NOT NULL THEN 'comprou'
      WHEN snl.comprou_at IS NOT NULL THEN 'comprando'
      WHEN snl.calculou_at IS NOT NULL THEN 'calculou'
      ELSE 'novo'
    END,
    CASE
      WHEN snl.pago_at IS NOT NULL THEN 'quente'
      WHEN snl.comprou_at IS NOT NULL OR snl.calculou_at IS NOT NULL THEN 'morno'
      ELSE 'frio'
    END,
    EXISTS (
      SELECT 1 FROM public.boas_vindas_logs bvl
      WHERE bvl.whatsapp = snl.whatsapp AND bvl.wpp_status = 'sent'
    ),
    COALESCE(snl.produto, 'Seu Numerólogo'),
    snl.created_at
  FROM public.seu_numerologo_leads snl
),
com_ddd AS (
  SELECT
    b.*,
    CASE
      WHEN regexp_replace(COALESCE(b.telefone, ''), '\D', '', 'g') ~ '^55\d{10,11}$'
        THEN substring(regexp_replace(b.telefone, '\D', '', 'g') from 3 for 2)::int
      WHEN length(regexp_replace(COALESCE(b.telefone, ''), '\D', '', 'g')) IN (10, 11)
        THEN substring(regexp_replace(b.telefone, '\D', '', 'g') from 1 for 2)::int
      ELSE NULL
    END AS ddd_raw
  FROM base b
)
SELECT
  cd.origem_tabela, cd.origem_id, cd.origem, cd.nome, cd.telefone, cd.email,
  cd.fase, cd.temperatura, cd.bv_enviado, cd.produto, cd.criado_em,
  r.ddd, r.cidade, r.estado
FROM com_ddd cd
LEFT JOIN public.ddd_regioes r ON r.ddd = cd.ddd_raw;

REVOKE ALL ON public.leads_unificados FROM anon;
REVOKE ALL ON public.leads_unificados FROM authenticated;
GRANT SELECT ON public.leads_unificados TO authenticated;
