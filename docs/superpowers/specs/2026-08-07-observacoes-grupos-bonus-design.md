# Histórico de observações + confirmação de grupo da turma e bônus

## Problema

Hoje, na ficha do aluno (modal de edição em `Financeiro.tsx`), o campo "Observações"
(`alunos.observacoes`) é um texto único que se sobrescreve a cada edição — não há data/hora de
quando foi escrito, e não há como saber se aquilo já foi resolvido ou ainda está pendente. Além
disso, não existe nenhuma forma de registrar se o aluno já foi confirmado no grupo de WhatsApp da
turma, nem se já recebeu os bônus da matrícula — bônus hoje nem é um dado estruturado, é só texto
fixo dentro de mensagens de WhatsApp (`lancamento-templates.ts`, `vega-webhook/index.ts`).

São duas necessidades relacionadas (ambas vivem na mesma ficha do aluno) mas independentes uma da
outra.

## Peça 1 — Histórico de observações

### Dados
Nova tabela, seguindo o mesmo molde de `cobranca_logs` (insert-only, nunca sobrescreve):

```sql
CREATE TABLE public.aluno_observacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'resolvido')),
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolvido_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolvido_em TIMESTAMPTZ
);

ALTER TABLE public.aluno_observacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aluno_observacoes_authenticated" ON public.aluno_observacoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_aluno_observacoes_aluno_id ON public.aluno_observacoes(aluno_id);
```

A coluna antiga `alunos.observacoes` continua existindo no banco (não é uma migration destrutiva),
mas deixa de ser escrita a partir de agora — vira legado.

### Backfill
Para todo aluno com `observacoes` preenchido, insere uma linha em `aluno_observacoes` com o texto
existente, `status = 'pendente'` (conforme decidido — não marca como resolvido automaticamente) e
`created_at` = `alunos.created_at` do aluno (fallback `NOW()` se a coluna não existir/estiver nula).

### Frontend — componente novo
`src/components/crm/finance/AlunoObservacoes.tsx`. Props: `alunoId: string`.

- Busca `aluno_observacoes` por `aluno_id`, ordenado por `created_at desc`, ao montar.
- Lista as pendentes visíveis por padrão, cada uma mostrando texto + `criado em DD/MM/AAAA HH:mm` +
  botão "Solucionado".
- As resolvidas ficam atrás de um toggle "Mostrar resolvidas (N)" — quando expandido, mostra texto +
  `resolvido em DD/MM/AAAA HH:mm`.
- Textarea + botão "Adicionar observação" no topo, sempre visível. Ao adicionar:
  ```ts
  await supabase.from('aluno_observacoes').insert({ aluno_id, texto, criado_por: userId });
  ```
- Botão "Solucionado" faz:
  ```ts
  await supabase.from('aluno_observacoes')
    .update({ status: 'resolvido', resolvido_por: userId, resolvido_em: new Date().toISOString() })
    .eq('id', obsId);
  ```
- Após qualquer insert/update, refaz o fetch local (sem depender de realtime).

Esse componente substitui o bloco atual do `<Textarea>` de Observações no modal de edição
(`Financeiro.tsx:3473-3478`):
```tsx
<AlunoObservacoes alunoId={editAlunoForm.id} />
```

### Frontend — aluno novo (form de criação)
O form de "Adicionar Aluno" (`newAlunoForm`, `Financeiro.tsx:3184-3185`) mantém o `<Textarea>` de
observações como está hoje — não dá pra ligar `aluno_observacoes` a um `aluno_id` que ainda não
existe. Ao salvar o novo aluno, se o texto não estiver vazio, insere ele como a primeira linha de
`aluno_observacoes` (status `pendente`) logo depois do insert em `alunos`, usando o id retornado. O
form de criação **não** ganha a seção de Grupo/Bônus da Peça 2 (também depende do aluno já existir).

### Preview na listagem
`Financeiro.tsx:2604-2607` hoje mostra `aluno.observacoes` truncado embaixo do nome. Passa a mostrar
a observação **pendente** mais recente de cada aluno:
- Uma query só, ao carregar a lista de alunos: `aluno_observacoes` com `status = 'pendente'`,
  ordenado por `created_at desc`.
- Client-side, monta um mapa `Record<alunoId, string>` pegando a primeira ocorrência de cada
  `aluno_id` (que é a mais recente, por causa do order).
- Some da listagem automaticamente assim que a última observação pendente daquele aluno for
  resolvida.

### Efeito colateral — resumo impresso
`Financeiro.tsx:1912` (HTML de resumo/contrato) hoje lê `editAlunoForm.observacoes || alunoDetail.observacoes`.
Passa a ler a observação mais recente (pendente ou resolvida, tanto faz) do histórico já carregado no
modal, em vez do campo antigo.

## Peça 2 — Confirmação de grupo da turma e bônus

### Dados — grupo da turma
Duas colunas novas em `alunos` (flag simples, sem histórico de remoção — só o bônus pediu isso):
```sql
ALTER TABLE public.alunos ADD COLUMN IF NOT EXISTS grupo_turma_confirmado_em TIMESTAMPTZ;
ALTER TABLE public.alunos ADD COLUMN IF NOT EXISTS grupo_turma_confirmado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;
```
Marcar o checkbox grava `NOW()` + `userId`; desmarcar limpa os dois campos.

### Dados — bônus (lista configurável + histórico por aluno)
```sql
CREATE TABLE public.bonus_tipos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.aluno_bonus_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  bonus_id UUID NOT NULL REFERENCES public.bonus_tipos(id) ON DELETE CASCADE,
  acao TEXT NOT NULL CHECK (acao IN ('adicionado', 'removido')),
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bonus_tipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aluno_bonus_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_tipos_authenticated" ON public.bonus_tipos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "aluno_bonus_eventos_authenticated" ON public.aluno_bonus_eventos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_aluno_bonus_eventos_aluno_id ON public.aluno_bonus_eventos(aluno_id);
```

`aluno_bonus_eventos` é um log append-only (mesmo padrão de `cobranca_logs`): cada
marcar/desmarcar grava uma linha nova, nunca faz update. O status atual de um bônus para um aluno é
a ação da linha mais recente daquele par `(aluno_id, bonus_id)` — se for `'adicionado'`, o checkbox
aparece marcado (com "adicionado em DD/MM HH:mm"); se for `'removido'` ou não houver nenhuma linha,
aparece desmarcado. Isso preserva o histórico completo de entrada/saída, como pedido.

### Frontend — `AlunoGruposBonus.tsx`
`src/components/crm/finance/AlunoGruposBonus.tsx`. Props: `alunoId: string`.

- Busca `bonus_tipos` onde `ativo = true` (ordenado por `ordem`) + todos os `aluno_bonus_eventos`
  daquele aluno, ao montar. Reduz os eventos para o status atual por `bonus_id`.
- Checkbox "Confirmado no grupo da turma" no topo, com o texto auxiliar "confirmado em DD/MM HH:mm"
  quando marcado.
- Lista de checkboxes, um por bônus ativo. Marcar/desmarcar insere um novo evento
  (`acao: 'adicionado'` ou `'removido'`) e refaz o fetch local.
- Botão "Gerenciar bônus" no canto, abre `BonusConfigModal`.
- Esta seção nova entra no modal de edição do aluno, logo abaixo da seção de Observações:
  ```tsx
  <AlunoGruposBonus alunoId={editAlunoForm.id} />
  ```

### Frontend — `BonusConfigModal.tsx`
`src/components/crm/finance/BonusConfigModal.tsx`. CRUD simples sobre `bonus_tipos`:
- Lista todos os bônus (inclusive inativos, marcados visualmente como "(inativo)").
- Campo de texto + botão "Adicionar bônus" (insere com `ativo: true`, `ordem` = maior ordem atual + 1).
- Cada linha tem botão de renomear (edição inline) e toggle ativo/inativo.
- **Não há exclusão definitiva** — só desativar (`ativo = false`), porque `aluno_bonus_eventos` pode
  referenciar o bônus e apagar quebraria o histórico. Um bônus desativado some da lista de checkboxes
  de `AlunoGruposBonus`, exceto para alunos que já têm algum evento registrado para ele (aparece
  desabilitado, só leitura, com o rótulo "(inativo)").

## Fora de escopo
- `FichaAlunoResumo.tsx` (versão somente-leitura aberta de dentro do Chat) não é alterada — o pedido
  é sobre a ficha do Financeiro.
- Excluir um `bonus_tipo` de verdade (só desativar).
- Notificações/alertas quando uma observação fica pendente por muito tempo.
- Grupo da turma com histórico de múltiplas entradas/saídas (só bônus pediu isso).
- Migrar a busca por indicação (`leads.observacoes`, linha 1541 de `Financeiro.tsx`) — é uma tabela e
  campo diferentes, não relacionados a esta feature.

## Testes
- `npx tsc --noEmit` limpo.
- Migration aplicada localmente: confirmar que alunos com `observacoes` preenchido ganham uma linha
  pendente em `aluno_observacoes` com o texto correto.
- No navegador, abrir a ficha de um aluno com observação legada: confirmar que ela aparece como
  pendente no novo histórico.
- Adicionar uma observação nova, confirmar data/hora exibida e que ela aparece no preview da
  listagem.
- Clicar "Solucionado": confirmar que some do preview da listagem e vai para a seção "resolvidas".
- Marcar "Confirmado no grupo da turma": confirmar data/hora exibida; desmarcar e confirmar que some.
- Criar um bônus novo em "Gerenciar bônus", marcar para um aluno, desmarcar, marcar de novo:
  confirmar que o checkbox reflete o estado atual e que existe mais de uma linha em
  `aluno_bonus_eventos` para aquele par (histórico preservado).
- Desativar um bônus que já tem eventos registrados: confirmar que ele some da lista de novos
  checkboxes mas continua visível (read-only) na ficha do aluno que já tinha marcado.
