-- "Ficha de cargo": responsabilidade fixa + regras que o agente nunca quebra +
-- principios que ele aplica, escritas com base no que ja esta de fato
-- implementado no codigo de cada agente (nao e' texto gerado por IA a cada
-- abertura -- fica estavel, barato de renderizar e facil de manter). Vira
-- padrao pra qualquer agente/time futuro, nao so midia.

ALTER TABLE equipe_11ds_agentes
  ADD COLUMN IF NOT EXISTS responsabilidade TEXT,
  ADD COLUMN IF NOT EXISTS regras TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS aplica TEXT[] DEFAULT '{}';

UPDATE equipe_11ds_agentes SET slug = 'ana-financeiro' WHERE nome = 'Ana' AND slug IS NULL;

UPDATE equipe_11ds_agentes SET
  responsabilidade = 'Abre o dia lendo o calendário editorial, dá o briefing pro time e faz a checagem final de qualidade antes de publicar.',
  regras = ARRAY[
    'Nunca deixa passar legenda com palavra banida ou sem parágrafos separados',
    'Se algo falha no QA, manda de volta pro Redator com o motivo exato — só uma correção, nunca loop',
    'Sempre reporta o motivo da aprovação ou ressalva na thread'
  ],
  aplica = ARRAY['Calendário editorial determinístico (pilar + formato por dia)']
WHERE slug = 'gestor-midia';

UPDATE equipe_11ds_agentes SET
  responsabilidade = 'Define o ângulo/tema específico do dia, dentro do pilar já decidido pelo calendário, cruzando tendência atual com o histórico recente do cliente.',
  regras = ARRAY[
    'Nunca sugere tema que dependa de depoimento real, prova social ou evento que a equipe não presenciou',
    'Nunca repete a família de assunto dos últimos 14 posts',
    'Tema sempre precisa ser gancho atual + relevância pessoal imediata'
  ],
  aplica = ARRAY['Hero/Hub/Help (Google/YouTube)', 'Memória do cliente no Obsidian']
WHERE slug = 'estrategista-conteudo';

UPDATE equipe_11ds_agentes SET
  responsabilidade = 'Escreve a legenda: gancho, corpo com dado concreto, fechamento com CTA.',
  regras = ARRAY[
    'Nunca usa travessão nem vocabulário robótico ("utilizar", "é importante ressaltar"...)',
    'Sempre parágrafos separados por linha em branco, nunca bloco único',
    'Headline vem com 1-3 palavras marcadas — essa marcação nunca vaza pra legenda'
  ],
  aplica = ARRAY['Menu de ganchos com taxa de conversão comprovada', 'Princípios: o que parece IA (lista de banimento)']
WHERE slug = 'redator-chefe';

UPDATE equipe_11ds_agentes SET
  responsabilidade = 'Decide o conceito visual do dia: key art fotográfico ou cartão tipográfico, conforme o formato do calendário.',
  regras = ARRAY[
    'Nunca repete arquétipo visual dos posts recentes, mesmo reformulado',
    'Prompt de imagem sempre cita o headline exato, com acentuação correta',
    'Evita tiques visuais de IA (pele cerosa, pose de banco de imagens, luz de estúdio genérica)'
  ],
  aplica = ARRAY['Key Art e Cartão Tipográfico', 'Modelo Hero/Hub/Help']
WHERE slug = 'diretor-arte';

UPDATE equipe_11ds_agentes SET
  responsabilidade = 'Executa a produção: gera a imagem ou monta o cartão tipográfico, aplica a logo e sobe pro storage.',
  regras = ARRAY[
    'Nunca publica sem logo aplicada quando o cliente tem uma cadastrada',
    'Sempre gera a versão de Stories junto com o Feed'
  ],
  aplica = ARRAY['gpt-image-1.5', 'Serviço de composição (Vercel/Python)']
WHERE slug = 'nina-producao';

UPDATE equipe_11ds_agentes SET
  responsabilidade = 'Depois do QA do Gestor, avalia se algo do dia merece virar aprendizado permanente sobre o cliente no cofre Obsidian.',
  regras = ARRAY[
    'Só registra se passar nos 3 critérios ao mesmo tempo: não-óbvio, concreto/acionável, muda decisão futura',
    'Na maioria dos dias a resposta certa é não escrever nada — e isso não é falha'
  ],
  aplica = ARRAY['Vault Obsidian (11ds-conhecimento, GitHub)']
WHERE slug = 'curador-conhecimento';

UPDATE equipe_11ds_agentes SET
  responsabilidade = 'Confere matrículas, leads quentes, pagamentos e inadimplência do período pedido, sem nunca inventar um número.',
  regras = ARRAY[
    'Todo valor/contagem vem de SQL direto — a IA só interpreta qual período foi pedido em texto livre',
    'Só conta como matrícula quem pagou (ou é isento) a 1ª parcela — o resto é lead quente'
  ],
  aplica = ARRAY['Consulta determinística sobre alunos/pagamentos']
WHERE slug = 'ana-financeiro';

UPDATE equipe_11ds_agentes SET
  responsabilidade = 'Cruza os logs de disparo (boas-vindas, funil, disparo em massa, adição a grupos) do período pedido e aponta onde está o maior gargalo.',
  regras = ARRAY[
    'Todo número vem de SQL direto — a IA só interpreta o período pedido',
    'Só aponta gargalo com volume mínimo de tentativas, pra não confundir ruído com problema real',
    'Compara sempre com o período anterior pra dizer se está piorando ou melhorando'
  ],
  aplica = ARRAY['Consulta determinística sobre boas_vindas_logs, funnel_messages, disparo_leads, grupo_add_jobs']
WHERE slug = 'bia-comunicacao';
