# Roadmap — RH e Pedagógico

Prioridade confirmada com o Pedro e o Rodrygo (14/10/2026): **Financeiro,
Pedagógico e RH** são os três departamentos essenciais agora. Financeiro já
tem base rodando (ver `docs/FINANCEIRO.md`). Este arquivo cobre o que falta
em **RH** e **Pedagógico** — pra qualquer agente (Claude ou Codex) que
pegar o projeto saber onde continuar sem duplicar trabalho.

**Antes de implementar qualquer item, leia `AGENTS.md`** (convenções de
RLS/GRANT/`tem_permissao`) e o cofre do Obsidian em
`C:\Users\pedro\Documents\Cerebro Onze Digital\RH` e `\Pedagógico` — cada
item abaixo tem uma nota lá com o raciocínio completo, decisões já tomadas
e o que ainda tá em aberto.

Convenção de status: 🟢 pronto · 🟡 parcial/em andamento · ⚪ não iniciado.

---

## RH

### 1. Cadastro de Profissional 🟢 — cadastro disponível no RH

**15/10/2026:** tabela `profissionais` e tela de cadastro/edição no RH em
produção, com nome, função, contato, Pix, documento, vínculo, modelo de
pagamento, valores, observações e status ativo/inativo. O cadastro não gera
contas a pagar nem calcula a folha automaticamente.

Tabela de profissionais (professor, etc.): nome, função, contato, Pix,
dados fiscais, vínculo, ativo/inativo, modelo de pagamento (fixo, por
aula, comissão, ajuda de custo, híbrido). Precisa existir antes dos itens
2 e 3 terem em quem se apoiar. Tela esboço já existe em `RH.tsx` — usar
como referência de campo, mas construir banco + ligar de verdade.

Registrar novo recurso `rh` em `app_recursos` + `role_permissoes` (admin e
gestor, ver/editar — mesmo padrão de `financeiro`) antes de criar as
policies das tabelas novas.

### 2. Lista de Presença 🟡 — base criada, fluxo pendente

As tabelas `aulas` e `presencas` já existem. Ainda falta a tela para lançar
e assinar presença de professor e alunos e conectar os registros à folha.

Registro de aula (data, turma, professor, horário) + presença assinada do
professor e de cada aluno. Alimenta o item 3 (RH) e a frequência do aluno
(Pedagógico, item 5, ainda não desenhado). Nota completa:
`Pedagógico/Lista de Presença.md` no cofre (vive conceitualmente nos dois
departamentos).

### 3. Fechamento de Folha ⚪ — depende dos itens 1 e 2

No dia de pagamento, soma aulas dadas × valor por profissional (usando o
modelo de pagamento do item 1 e os registros do item 2), manda o total via
[[Bot da Empresa]] (Telegram) pro Pedro só conferir e transferir — sem
calcular nada na mão.

---

## Pedagógico

### 4. Avaliações e Correção 🟡 — editor de rascunhos no ar; publicação pendente

**15/10/2026 — Codex (worktree `avaliacoes-pedagogicas`):** migration
`20261015020000_pedagogico_avaliacoes_base.sql` preparada com avaliações,
questões, entregas e respostas. Todas as tabelas têm RLS, GRANT para
`authenticated` e policies com `tem_permissao('pedagogico_avaliacoes', ...)`;
`anon` não recebe acesso. O recurso novo é concedido a admin, gestor e
professora, sem herdar o acesso amplo de Mapa Mental. A tela permite montar
rascunhos e questões, mas não publica links nem recebe trabalhos de alunos.
**15/10/2026 (publicação):** migration aplicada somente para este módulo no
Supabase do CRM e registrada no histórico remoto. Editor publicado em
**Gestão → Provas e Trabalhos** no `sistema.idmpsi.com.br`. O piloto foi criado
como rascunho privado no banco e o fluxo autenticado de leitura/edição das
questões foi conferido. Nenhum link de prova para alunos foi publicado.
Há também um piloto autoral para o módulo inicial de Fundamentos da Psicanálise:
5 questões discursivas, 10 pontos, com respostas esperadas e rubricas editáveis.
Usa a ementa resumida já existente no projeto e conferências introdutórias de
Freud como referência. É apenas proposta, não conteúdo oficial: Jocimara
precisa revisar antes de qualquer publicação ou correção automática.

Form próprio do site (não terceiro). Maioria das questões é dissertativa;
a IA já sabe a resposta esperada de cada módulo, corrige e dá nota; manda
resumo pra professora só aprovar ou não (não corrige do zero). Tela esboço
em `ProvasTrabalhos.tsx`.

**Bloqueio real: falta o time pedagógico validar o piloto e fornecer as
perguntas dos demais módulos.** A estrutura e a primeira proposta podem ser
revisadas agora, mas não liberadas ao aluno como prova oficial.

### 5. Agenda de Aulas (Google Meet) 🟡 — base e prévia prontas; integração depende de OAuth

**14/10/2026 — Codex:** reutilizada a tabela existente `aulas` da Lista de
Presença, com `turma_id`, `profissional_id`, data/horários, status e
`link_meet` opcional. Nenhuma tabela ou migration adicional criada.
RLS, GRANT para `authenticated` e policies com `tem_permissao('rh', ...)`
conferidos no banco. Menu **Gestão → Agenda de Aulas** consulta por mês e
mostra uma prévia interna do cartão do professor, com botão do Meet quando
houver link válido e aula agendada. Acesso restrito à permissão `rh.ver`.

Ainda pendentes: OAuth/geração de links, vínculo seguro entre identidade
do professor e profissional, acesso somente às próprias aulas, entrega por
Telegram, link de presença e reagendamento pelo bot. A prévia não envia
mensagens, não cadastra aulas e não integra com o Google. Cadastro de aulas
permanece na trilha da Lista de Presença, evitando trabalho duplicado.

Cada aula gera link do Google Meet com o professor como organizador, no
horário certo. Entrega pro professor via [[Bot da Empresa]] (Telegram,
acesso limitado só às próprias aulas). Diretora pedagógica (Jocimara)
reagenda **conversando direto com o bot** — decisão final do Pedro
(14/10/2026) é a IA executar a ação de verdade a partir da mensagem dela,
sem fase manual antes, mesmo com risco de erro no caminho. Nota completa:
`Pedagógico/Agenda de Aulas (Google Meet).md`.

**Bloqueio real: precisa do Pedro configurar OAuth do Google (Calendar/
Meet API)** antes de qualquer código de integração fazer sentido — mesmo
tipo de passo que ele fez pro bot do Telegram e pra API do Claude (ação
que só ele consegue fazer, gera credencial).

---

## Ordem sugerida

**1 → 2 → 3** fecham o RH sozinho (nenhum depende de nada de fora). Podem
andar em paralelo com **4** assim que o conteúdo chegar, e com **5** assim
que o Pedro configurar o Google OAuth. Se dois agentes (Claude + Codex)
forem trabalhar ao mesmo tempo: um pega a trilha do RH (1→2→3), o outro
prepara a estrutura de dados do item 4 (schema, sem esperar o conteúdo
chegar pra travar tudo) ou do item 5 (o que dá pra montar sem o OAuth
ainda, tipo a tela/fluxo no lado do app).
