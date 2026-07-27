# Leads unificados — visão consolidada pra montar campanhas futuras

**Data:** 2026-07-27
**Status:** aprovado para virar plano de implementação

## Contexto e motivação

Durante o trabalho na Cobrança, o usuário pediu uma tela que reúna todos os leads do
sistema numa visão só, mostrando a situação de cada um, para usar como base ao montar
campanhas de disparo futuras. Hoje os leads vivem espalhados em módulos separados sem
visão cruzada.

Mapeamos as tabelas candidatas no banco: existem ~24 tabelas com "lead" no nome, mas a
maioria é irrelevante — 20 tabelas `sheet_leads_NN` são espelhos brutos de planilha que
já sincronizam para `lancamento_leads` (a mais nova, `sheet_leads_47`, está vazia), e
tabelas como `franquia_leads`, `idm_quiz_leads`, `aula_secreta_leads`, `sv_leads` têm 0-3
linhas. As fontes com volume real, confirmadas com o usuário:

| Fonte | Linhas | Produto |
|---|---|---|
| `lancamento_leads` | 12.372 | Semana do Despertar |
| `npa_evento_leads` | 324 | IDM Pelo Brasil (eventos) |
| `alunos` | 191 | Matriculados |
| `seu_numerologo_leads` | 53 | Numerólogo |

**Abordagem escolhida** (das duas propostas): tabela filtrável com exportação CSV, que
alimenta o assistente de Nova Campanha já existente (`NovaCampanhaModal`, em
`DisparosMonitor.tsx`) — que já aceita CSV como fonte de leads. Nada de fiar a fonte
"leads unificados" direto no assistente nesta primeira versão; isso fica como evolução
futura se fizer falta.

## Arquitetura

### 1. View SQL `leads_unificados`

`UNION ALL` das 4 tabelas com colunas normalizadas:

| Coluna | Descrição |
|---|---|
| `origem_tabela` | `'lancamento_leads' \| 'npa_evento_leads' \| 'alunos' \| 'seu_numerologo_leads'` — chave técnica, não exibida |
| `origem_id` | id da linha na tabela de origem |
| `origem` | rótulo legível: `'Lançamento: ' || lancamento.nome`, `'Evento NPA: ' || evento.nome`, `'Aluno: ' || turma.nome`, `'Numerólogo'` |
| `nome` | nome do lead |
| `telefone` | whatsapp |
| `email` | email |
| `fase` | ver mapeamento por fonte abaixo |
| `temperatura` | `'quente' \| 'morno' \| 'frio'` — mesma regra que `NovaCampanhaModal` já usa hoje |
| `bv_enviado` | boolean — já recebeu boas-vindas |
| `criado_em` | data de entrada, pra ordenação/filtro por período |

**Mapeamento de `fase` por fonte:**
- `lancamento_leads` / `npa_evento_leads`: usa a própria coluna `fase` (já existe).
- `alunos`: usa `status` diretamente (ativo/inadimplente/cancelado/concluído — já é o
  vocabulário certo pra esse contexto).
- `seu_numerologo_leads`: deriva de timestamps — `pago_at IS NOT NULL` → `'comprou'`,
  senão `comprou_at IS NOT NULL` → `'comprando'`, senão `calculou_at IS NOT NULL` →
  `'calculou'`, senão `'novo'`.

**Mapeamento de `temperatura`** (mesma regra do `loadFromLancamento`/`loadFromTurma` em
`DisparosMonitor.tsx`): `matriculado`/`pago` → quente; `oferta`/`comprando` → morno; resto
→ frio. `alunos` sempre entra como quente (já é cliente).

**Mapeamento de `bv_enviado`:** `lancamento_leads.bv_enviado` e `npa_evento_leads.bv_enviado`
usados diretamente. Pra `alunos` e `seu_numerologo_leads` (que não têm essa coluna), cruza
por telefone contra `boas_vindas_logs.whatsapp` (existe pelo menos 1 log com `wpp_status =
'sent'`) — `LEFT JOIN LATERAL` ou subquery `EXISTS`, sem duplicar linha.

A view é `SECURITY INVOKER` (padrão), sem RLS própria — herda das tabelas de origem, que já
são `authenticated USING (true)` no restante do sistema.

### 2. UI — nova aba "Leads" em Central de Disparos

**Arquivo:** `src/components/crm/DisparosMonitor.tsx` — novo valor `'leads'` no union
`MainTab` (hoje `'funil' | 'campanhas' | 'boasvindas'`), novo botão de aba no header ao
lado de "Boas-vindas", e um novo componente `LeadsTab`.

- Busca por nome/telefone (`ilike`, com debounce).
- Filtros: origem (multi-select dos 4 rótulos), fase (dependente da origem escolhida, já
  que o vocabulário difere), temperatura (quente/morno/frio).
- Tabela paginada — 12k+ linhas não cabem de uma vez; a busca/filtro/paginação batem
  direto na view via `range()` do Supabase, não carrega tudo no client.
- Colunas: nome, telefone (mascarado, mesmo padrão de `maskPhone` já usado no arquivo),
  origem, fase, temperatura (badge colorido, reaproveita `TEMP_CFG` já existente no
  arquivo), boas-vindas (ícone sim/não).
- Botão **"Exportar CSV"** dos resultados **filtrados** (não da página só) — reaproveita o
  padrão de `exportCSV` já existente em `FunilTab` no mesmo arquivo. Formato de saída
  compatível com o parser de CSV que `NovaCampanhaModal` já lê (colunas `Nome`/
  `Whatsapp`), pra poder importar direto na campanha sem ajuste manual.

## Tratamento de erro / limites

- View não filtra por permissão de usuário além do que as tabelas de origem já impõem —
  mesma política do resto do sistema (`authenticated`, sem RLS granular por vendedor
  nessas tabelas hoje).
- Sem paginação real no Postgres além de `LIMIT`/`OFFSET` padrão do Supabase — aceitável
  pro volume atual (~13k linhas), reavaliar se crescer bem além disso.

## Testes / validação

Sem suíte automatizada (mesmo débito já conhecido do projeto). Validar rodando de
verdade: abrir a aba Leads, conferir contagem total bate com a soma das 4 fontes, filtrar
por cada origem e conferir que a fase exibida faz sentido pro vocabulário daquela fonte,
exportar CSV e importar no assistente de Nova Campanha pra confirmar compatibilidade de
colunas.

## Débito técnico conhecido (fora de escopo aqui)

- As ~20 tabelas `sheet_leads_NN` (staging bruto de planilha) não entram na view — se algum
  dia um lead existir só na staging e não tiver sincronizado pra `lancamento_leads`, ele
  fica de fora. Não foi pedido resolver isso agora.
- Sem opção de alimentar a campanha direto da tela de Leads (sem passar por CSV) — fica
  como evolução futura, não faz parte deste trabalho.
