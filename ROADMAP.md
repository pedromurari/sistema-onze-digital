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

**15/10/2026 (tarde):** botão "Pagamentos" por profissional abre histórico —
tabela `profissionais_pagamentos`, lançamento manual (data, valor, descrição,
turma opcional) com anexo de comprovante e nota fiscal (bucket privado
`profissionais-pagamentos`, link via URL assinada). Filtro por mês e total do
período. Ainda é lançamento manual — não calcula nada sozinho, é só o
registro/arquivo organizado por profissional (`HistoricoPagamentos.tsx`).

Tabela de profissionais (professor, etc.): nome, função, contato, Pix,
dados fiscais, vínculo, ativo/inativo, modelo de pagamento (fixo, por
aula, comissão, ajuda de custo, híbrido). Precisa existir antes dos itens
2 e 3 terem em quem se apoiar. Tela esboço já existe em `RH.tsx` — usar
como referência de campo, mas construir banco + ligar de verdade.

Registrar novo recurso `rh` em `app_recursos` + `role_permissoes` (admin e
gestor, ver/editar — mesmo padrão de `financeiro`) antes de criar as
policies das tabelas novas.

### 2. Lista de Presença 🟡 — links públicos e assinatura por aula

As tabelas `aulas` e `presencas` já existem. Cadastro, histórico e marcação
pela equipe ficam em Gestão → Agenda de aulas. A aba duplicada do RH foi
removida. Cada aula tem link público do aluno e link privado do professor;
a Edge Function valida matrícula e assinatura. Falta conectar à folha.

Registro de aula (data, turma, professor, horário) + presença assinada do
professor e de cada aluno. Alimenta o item 3 (RH) e a frequência do aluno
(Pedagógico, item 5, ainda não desenhado). Nota completa:
`Pedagógico/Lista de Presença.md` no cofre (vive conceitualmente nos dois
departamentos).

### 3. Fechamento de Folha 🟢 — fecha por competência, trava o valor

No dia de pagamento, soma aulas dadas × valor por profissional (usando o
modelo de pagamento do item 1 e os registros do item 2), manda o total via
[[Bot da Empresa]] (Telegram) pro Pedro só conferir e transferir — sem
calcular nada na mão.

**17/10/2026 — Codex:** prévia de consulta no RH por competência: conta apenas
aulas realizadas com presença positiva do professor e calcula a parcela
por aula quando há tarifa cadastrada.

**20/10/2026 — Claude:** tela própria `FechamentoFolha.tsx` (DP RH →
Fechamento de Folha). Soma aulas × valor por aula, valor fixo e comissões
pendentes (via `comissoes_vendedores`, ligado por
`profissionais.comissoes_vendedor`), desconta o já pago no mês
(`profissionais_pagamentos`). Botão "Fechar competência" trava o cálculo em
`folha_fechamentos`/`folha_fechamentos_itens`; "Reabrir" permite recalcular.
Quem é comissão sem vendedor vinculado (ex: repasse de sócio por % de
faturamento de turma) aparece marcado para revisão manual, não calculado
sozinho. Pagamento continua manual com comprovante — isto só trava o número
certo do mês. Falta só o envio automático pelo Telegram: a função
`bot-rh-consulta` já existe no servidor, falta ligar no n8n (ação do Pedro).

---

## Pedagógico

### 4. Avaliações e Correção ⚪ — bloqueado, aguardando conteúdo

Form próprio do site (não terceiro). Maioria das questões é dissertativa;
a IA já sabe a resposta esperada de cada módulo, corrige e dá nota; manda
resumo pra professora só aprovar ou não (não corrige do zero). Tela esboço
em `ProvasTrabalhos.tsx`.

**Bloqueio real: falta o time pedagógico mandar as perguntas de prova/
trabalho de cada módulo.** Sem isso não dá pra desenhar o form nem o
gabarito esperado da IA — não adianta começar a codar antes disso chegar.

### 5. Agenda de Aulas (Google Meet) 🟡 — base e prévia prontas; integração depende de OAuth

**14/10/2026 — Codex:** reutilizada a tabela existente `aulas` da Lista de
Presença, com `turma_id`, `profissional_id`, data/horários, status e
`link_meet` opcional. Nenhuma tabela ou migration adicional criada.
RLS, GRANT para `authenticated` e policies com `tem_permissao('rh', ...)`
conferidos no banco. Menu **Gestão → Agenda de Aulas** mostra apenas aulas
de hoje em diante, da mais próxima à mais distante, com filtro por turma e
mês atual selecionado por padrão. O modo Histórico dá acesso às aulas passadas. Cada cartão reúne
o botão do Meet (quando houver link), a marcação manual de presença e os
links de presença do aluno e do professor (abertos sob demanda). Acesso
restrito à permissão `rh.ver`.

Ainda pendentes: OAuth/geração de links, vínculo seguro entre identidade
do professor e profissional, acesso somente às próprias aulas, entrega por
Telegram e reagendamento pelo bot. A tela não envia
mensagens nem integra com o Google. As aulas são cadastradas nesta Agenda,
sem segunda tela de Lista de Presença no RH.

**17/10/2026 — horário das tutorias (corrigido):** início fixo às 20h de Brasília,
fim sugerido às 21h e ajustável conforme a duração real (geralmente até 21h20).
Não há duração mínima de 1h30 para tutoria; aulas comuns podem durar 1h30 ou mais.
Tutorias futuras antes terminando exatamente às 21h30 foram ajustadas para 21h.

Cada aula gera link do Google Meet com o professor como organizador, no
horário certo. Entrega pro professor via [[Bot da Empresa]] (Telegram,
acesso limitado só às próprias aulas). Diretora pedagógica (Jocimara)
reagenda **conversando direto com o bot** — decisão final do Pedro
(14/10/2026) é a IA executar a ação de verdade a partir da mensagem dela,
sem fase manual antes, mesmo com risco de erro no caminho. Nota completa:
`Pedagógico/Agenda de Aulas (Google Meet).md`.

**19-20/10/2026 — Claude: OAuth configurado e Meet ao vivo.** Credencial
criada (`11digitalstrategy@gmail.com` hospeda o projeto, `contato@
rodrygomurari.com.br` autoriza via OAuth Playground), secrets salvos no
Supabase, função `meet-criar-aulas` gera o evento/link de verdade. Testado
em aula real. Aviso automático no grupo de WhatsApp da turma (função
`aulas-aviso-meet`, cron a cada minuto) também construído, desligado até o
Pedro ligar de propósito. Bloqueio de OAuth está resolvido; falta convite
por e-mail do professor (sem e-mails coletados ainda) e reagendamento pelo
bot a partir de mensagem da Jocimara.

---

## Ordem sugerida

**1 → 2 → 3** fecham o RH sozinho (nenhum depende de nada de fora). Podem
andar em paralelo com **4** assim que o conteúdo chegar, e com **5** assim
que o Pedro configurar o Google OAuth. Se dois agentes (Claude + Codex)
forem trabalhar ao mesmo tempo: um pega a trilha do RH (1→2→3), o outro
prepara a estrutura de dados do item 4 (schema, sem esperar o conteúdo
chegar pra travar tudo) ou do item 5 (o que dá pra montar sem o OAuth
ainda, tipo a tela/fluxo no lado do app).
