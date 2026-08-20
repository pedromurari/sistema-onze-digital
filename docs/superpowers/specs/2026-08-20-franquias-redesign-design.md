# Redesign visual — IDM PSI Franquias

## Contexto

`src/components/crm/IDMPsiFranquias.tsx` gerencia leads de franquia (funil próprio,
`franquia_leads`) e métricas de campanha (`franquia_campanha`). Funciona ponta a ponta:
métricas de campanha, histórico, busca + filtro por vendedor, tabela de todos os leads, pool
de leads sem atribuição e kanban por fase — mas tudo empilhado numa única página, com
componentes de estilo padrão (Select genérico, tabelas monocromáticas, cards de métrica
simples).

O CRM Time Comercial (`src/components/crm/TimeComercial.tsx`) passou por um redesign visual
recente (spec: `docs/superpowers/specs/2026-08-17-time-comercial-redesign-design.md`) que
introduziu um vocabulário visual consistente: abas em duas linhas com header "Meu trabalho",
avatares coloridos por vendedor, tabelas "premium" (cabeçalho degradê vinho, zebra, rodapé de
totais), `StatTile` e `SectionBar`. Franquias deve seguir esse mesmo vocabulário.

## Objetivo

Reorganizar a página de Franquias pra usar o mesmo padrão visual e de navegação do Time
Comercial, sem remover nenhuma informação ou funcionalidade existente. Redesign de
apresentação e organização, não de escopo funcional ou de regras de acesso.

## Decisões de design (validadas com o dono do negócio)

### 1. Página vira 3 abas, com header "Meu trabalho"

Hoje é uma página única com scroll longo. Vira abas, mesmo componente visual usado no Time
Comercial (`TabsList` com cartão de destaque vinho, `Zap`/ícone de contexto, subtítulo):

- **Funil** — kanban por fase (Novo, Contatado, Reunião Agendada, Fechado, Perdido), igual ao
  que existe hoje. Único ajuste: cada card do kanban passa a mostrar o avatar colorido do
  vendedor responsável (ver decisão 2) em vez de só o nome em texto.
- **Leads** — busca + filtro por vendedor, pool de "Leads Sem Atribuição" (destaque âmbar, como
  já é hoje) no topo, e a tabela completa de todos os leads embaixo, agora em estilo premium.
- **Campanha** — os 6 `StatTile` de métricas (Gasto Total, Impressões, Cliques, Leads, CPL,
  CTR) e o histórico de campanha como tabela premium.

Todas as abas continuam sempre visíveis e clicáveis, sem nada escondido atrás de menu — mesmo
critério do Time Comercial, porque tanto admin quanto vendedor podem precisar de qualquer aba a
qualquer momento.

### 2. Identidade visual do vendedor — avatar colorido por hash do id

Diferente do Time Comercial (2 pessoas fixas, cor cadastrada manualmente no array
`INITIAL_VENDORS`), os vendedores de Franquias vêm da tabela `responsaveis` do Supabase — lista
dinâmica, sem campo de cor. Pra não exigir migração de banco agora, a cor de cada vendedor é
gerada deterministicamente a partir do `id` (hash simples → índice numa paleta fixa de ~8 cores
vinho/complementares), calculada no cliente com `useMemo`. Mesmo id sempre gera a mesma cor
durante a sessão (e entre sessões, já que o hash é determinístico).

Essa cor aparece como avatar circular com iniciais em três lugares:
- Coluna "Vendedor" da tabela de leads
- Card de lead no kanban (ao lado do nome, substituindo o ícone `UserCheck` genérico atual)
- Chip do filtro "Vendedor" na aba Leads (troca o `Select` dropdown por chips de avatar
  clicáveis, mesmo padrão do `VendorSwitch` do Time Comercial — inclui chip "Todos" e "Sem
  atribuição")

### 3. Tabelas — tratamento premium, igual Time Comercial

Reaproveita os mesmos utilitários já existentes no arquivo do Time Comercial (extraídos ou
duplicados localmente, ver Escopo):
- `PREMIUM_TABLE_HEADER_ROW` — cabeçalho em degradê vinho, texto branco
- `premiumZebraRow` — linhas zebradas em tom de vinho claro
- Rodapé de totais com fundo vinho claro (tabela de histórico de campanha ganha linha de total:
  soma de gasto/impressões/cliques/leads, CPL e CTR agregados — os mesmos valores que já
  aparecem nos StatTiles do topo, não é cálculo novo)

Aplica-se à tabela de "Todos os Leads" e ao "Histórico de Campanha". Mantém `overflow-x-auto`
nos containers.

### 4. Métricas — `StatTile` no lugar do `MetricCard` atual

Os 6 cards de métrica de campanha trocam o componente `MetricCard` local (ícone colorido em
badge, sem destaque) pelo `StatTile` do Time Comercial (label em vinho maiúsculo, ícone em
badge vinho sólido, leve brilho decorativo no canto). Mesmos ícones e dados atuais (`DollarSign`,
`Eye`, `MousePointerClick`, `Users`, `Target`, `TrendingUp`).

### 5. Kanban por fase — mantém como está, só o card muda

O layout de colunas coloridas por fase (`FASES` com cor própria por fase: azul/âmbar/roxo/
verde/vermelho) já é claro e não precisa mudar — mesmo critério aplicado ao funil do Time
Comercial ("já segue o padrão visual, não precisa de mudança"). Único ajuste é o avatar de
vendedor no card (decisão 2).

## Escopo desta mudança

**Dentro do escopo:**
- Reestruturar `IDMPsiFranquias()` em 3 abas (Funil / Leads / Campanha) com header "Meu
  trabalho", reaproveitando o padrão de `Tabs`/`TabsList` do Time Comercial
- Função de cor determinística por id de vendedor (paleta fixa, hash simples)
- Trocar filtro de vendedor (Select) por chips de avatar coloridos na aba Leads
- Adicionar avatar colorido ao card do kanban e à coluna "Vendedor" da tabela
- Estilizar tabela de "Todos os Leads" e "Histórico de Campanha" como tabela premium
  (cabeçalho degradê, zebra, rodapé de totais no histórico de campanha)
- Trocar `MetricCard` local pelo `StatTile` do Time Comercial nos 6 cards de métrica de
  campanha
- Garantir `overflow-x-auto` nas tabelas em telas estreitas (375px)

**Fora do escopo (não mexer):**
- Lógica de dados, queries Supabase (`franquia_leads`, `franquia_campanha`, `responsaveis`) —
  tudo continua igual
- Regras de acesso — página continua sem trava por vendedor (todo mundo vê e reatribui todos os
  leads livremente); `isAdmin` continua sem uso funcional, como já está hoje
- Modal de edição/criação de lead (`LeadModal`) e modal de métricas de campanha — permanecem
  como estão, sem redesign
- Adicionar campo `cor` na tabela `responsaveis` do banco — a cor é só derivada no cliente

## Critério de sucesso

- Nenhuma aba, coluna, texto explicativo ou ação que existe hoje desaparece
- Dá pra saber de quem é cada lead (cor do avatar) sem ler o nome, tanto na tabela quanto no
  kanban
- Visual (tabelas, StatTiles, abas) fica consistente com o Time Comercial
- Funciona sem quebrar layout em mobile (375px) e desktop
