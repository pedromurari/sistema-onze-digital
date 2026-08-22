# Redesign visual — CRM Time Comercial

## Contexto

`src/components/crm/TimeComercial.tsx` foi trazido de um commit anterior (`e4878fe`) e já
funciona ponta a ponta: funil próprio (leads `origem='Time Comercial'`), aba de operação
(links de matrícula, alunos aguardando turma), metas pessoais/de equipe, aquisição (Semana
do Despertar) e remuneração (calculadora de comissão), com um seletor "Ver como" que simula
cada vendedor(a) vendo só os próprios dados (Aline, gerente, vê de todos).

O problema não é funcional — é visual. As 6 abas têm o mesmo peso, o seletor de vendedor é um
dropdown genérico que ignora as cores já cadastradas por pessoa (Gestão da Equipe), e as
tabelas (Remuneração, Metas, Aquisição) usam estilo padrão sem hierarquia de leitura.

## Objetivo

Reorganizar a hierarquia visual da página pra ficar clara e fácil de navegar tanto pro
vendedor quanto pro admin, tanto no celular quanto no computador — **sem remover nenhuma
informação ou funcionalidade que existe hoje**. É um redesign de apresentação, não de escopo.

## Decisões de design (validadas com o dono do negócio)

### 1. Abas em duas linhas: "Hoje" vs "Referência"

Todas as 6 abas continuam visíveis e clicáveis — nada fica escondido atrás de menu (importante
pro admin, que pode precisar de qualquer aba a qualquer momento). Mudança é só de agrupamento
visual, com rótulo pequeno acima de cada linha:

- **Hoje** (uso diário, estilo preenchido/vinho): Funil, Operação
- **Referência** (consulta ocasional, estilo neutro): Meta Pessoal, Meta de Equipe, Aquisição,
  Remuneração

Mesma estrutura em mobile e desktop — só empilha.

### 2. Seletor "Ver como" — chips de avatar coloridos

O `Select` (dropdown) atual vira uma fileira de avatares circulares com iniciais, um por
vendedor(a) + um avatar "Todos" pro admin/gerente. Cada avatar usa uma cor fixa de
identificação (mesmo padrão de cor por pessoa usado nos cards do Pipeline/Gestão da Equipe).
O avatar ativo fica com anel de destaque. Clicar troca o filtro "Ver como" — mesma função que o
Select tinha, só a interação vira clique direto em vez de abrir dropdown. Compacto, rápido de
reconhecer visualmente, e funciona em mobile com scroll horizontal se a equipe crescer.

Como Helen/Miguel/Aline ainda não são usuários reais no sistema (comentário no código:
"Sem contas reais ainda"), a cor de cada um fica fixa no array `INITIAL_VENDORS` por enquanto
(campo novo `cor`) — quando virarem contas de verdade, trocar pela cor de `AppUser.cor`.

### 3. Tabelas largas — scroll horizontal, não cards empilhados

Remuneração, Metas e Aquisição têm tabelas com muitas colunas. Em vez de recriar como cards
empilhados no mobile (mais trabalho, risco de esconder coluna), elas ficam dentro de um
container com `overflow-x: auto` — comportamento correto pra tabelas de comparação onde ver a
linha inteira junto importa. Evita over-engineering numa área que é consulta ocasional.

### 4. Paleta — vinho como cor de marca, tabelas em estilo "premium"

- **Vinho (`--primary` / `#A93356`, já usado no sistema)** continua sendo a cor de identidade
  em toda a interface: aba ativa "Hoje", cabeçalho de card, bolinha do vendedor no dropdown,
  valores de destaque (ex: "A receber").
- **Tabelas** (Remuneração em especial) ganham tratamento mais rico que a tabela padrão do
  design system:
  - Cabeçalho em degradê vinho (`from-primary to-primary/80`), texto branco
  - Linhas zebradas em tom de vinho bem claro (não cinza neutro)
  - Pílulas de nível de meta com cor semântica: Base = cinza neutro, Motivo = dourado/âmbar,
    Superação = verde — reaproveita as cores que `BonusPill` já usa (`bg-muted`,
    `bg-warning/15`, `bg-success/15`), só aplicadas também à pílula de nível na tabela, não só
    no componente isolado.
  - Rodapé de totais com fundo vinho bem claro, texto vinho em negrito

Isso não introduz cor nova ao sistema — é uma aplicação mais consistente das cores que já
existem (`--primary`, `--warning`, `--success`, `--muted`) em vez de tabelas monocromáticas.

## Escopo desta mudança

**Dentro do escopo:**
- Reestruturar o cabeçalho de `TimeComercial()` (linhas ~1170-1191): duas linhas de abas com
  rótulo, chips de avatar coloridos substituindo o Select de "Ver como"
- Estilizar a tabela de `RemuneracaoTab` (cabeçalho degradê, zebra, pílulas de nível, rodapé)
  como componente de tabela premium reutilizável dentro do arquivo
- Aplicar o mesmo tratamento de tabela premium às tabelas de `MetasTab` e `AquisicaoTab` por
  consistência
- Garantir overflow-x nas tabelas em telas estreitas

**Fora do escopo (não mexer):**
- Lógica de dados, queries Supabase, cálculo de comissão/faturamento — tudo continua igual
- Estrutura de permissões (`canViewTimeComercial`) — já existe e funciona
- `FunilTimeComercial` (cards de lead, colunas do funil) — já segue o padrão visual do Pipeline,
  não precisa de mudança
- Trocar "Ver como" por autenticação real por vendedor — fora do escopo deste ajuste visual

## Critério de sucesso

- Nenhuma aba, coluna, texto explicativo ou ação que existe hoje desaparece
- Dá pra identificar em menos de 1 segundo se a aba ativa é de uso diário ou de referência
- Dá pra saber de quem são os dados (cor) sem ler o texto do dropdown
- Funciona sem quebrar layout em mobile (375px) e desktop
