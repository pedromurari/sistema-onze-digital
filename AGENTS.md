# Instruções para quem (ou o quê) for trabalhar neste repositório

Este arquivo é lido tanto pelo Codex (CLI da OpenAI) quanto pelo Claude
Code — é o jeito dos dois agentes terem o mesmo contexto sem precisar
repetir explicação toda vez. Se você é um agente de IA abrindo este
projeto, leia isto antes de mexer em qualquer arquivo.

## O que é este projeto

CRM interno da Onze Digital / IDM (Instituto Despertamente) — gestão de
leads, matrícula, financeiro, comercial e operação da empresa.

## Cérebro da empresa (Obsidian)

Existe um cofre do Obsidian em `C:\Users\pedro\Documents\Cerebro Onze Digital`
(fora deste repositório) que documenta a estrutura organizacional da
empresa: departamentos, quem é diretor/gerente de cada um (humano ou
agente de IA), funcionários/skills e o que cada um faz ou deveria fazer.
Tudo em Markdown com `[[wikilinks]]`, nó central em
`Grupo Despertamente - Constituição.md`.

**Antes de tomar decisão sobre estrutura organizacional, papel de alguém,
ou prioridade entre departamentos, leia esse cofre.** Ele é a fonte da
verdade de "quem cuida do quê" — não repetir explicação que já está lá.

**Depois de implementar algo que esse cofre descreve como pendência**
(ex: uma skill marcada ⚪ "não construído"), atualize a nota correspondente
pra 🟢/🟡 e registre o que mudou — mesmo princípio do `ROADMAP.md` da
franquia: não deixar o mapa desatualizado em relação ao código.

Há um cofre irmão em `C:\Users\pedro\Documents\Cerebro Franquia IDM PSI`,
específico do projeto `idmpc-franqueadora` (outro repositório, outro banco)
— não confundir os dois nem misturar conteúdo.

## Trabalho em andamento — RH e Pedagógico

Ver **`ROADMAP.md`** antes de começar qualquer tarefa nova de RH ou
Pedagógico — documenta o que já existe, o que falta, bloqueios reais
(conteúdo pendente do time pedagógico, OAuth do Google pendente do Pedro)
e a ordem sugerida, pra dois agentes trabalharem em paralelo sem duplicar.

## Não é o mesmo projeto da franquia

Existe outro repositório, local nesta mesma máquina, em
`E:\idmpc-franqueadora` — é o Portal do Franqueado da Franquia IDM PSI.
São dois produtos, dois repositórios, dois projetos Supabase e dois
projetos Vercel **separados**. Ver o `AGENTS.md` de lá antes de mexer
naquele projeto.

## Stack

Vite + React + TypeScript + Tailwind + shadcn/ui + Supabase (auth +
Postgres com RLS). SPA sem framework de SSR.

## Segurança — convenções deste projeto

- RLS em toda tabela nova, e a tabela também precisa de `GRANT` pro papel
  `authenticated` (RLS sozinha não basta).
- Tabelas de acesso restrito a staff usam a função `tem_permissao(recurso,
  acao)` nas policies — ver `role_permissoes` / `app_recursos` e exemplos
  recentes em `supabase/migrations/*dre_fechamentos*`.
- Nunca usar a chave `service_role` no navegador — qualquer coisa que
  precise bypassar RLS é edge function.
