# NPA — Página de entrega do material (e-book + telas)

**Data:** 2026-08-01
**Status:** aprovado para virar plano de implementação

## Contexto e motivação

Nas aulas presenciais do NPA (Numerologia Pitagórica Aplicada), depois de cada turma são
vendidos um e-book e as "telas" (mapas numerológicos individuais) como material
complementar. Hoje não existe uma entrega digital premium para esse material — o pedido
é criar uma página, com a estética já usada em "Seu Numerólogo" e no Instituto
Despertamente (parceiro na entrega deste NPA), que:

- Identifica o comprador e casa o cadastro com o CRM real (`npa_evento_leads`, no projeto
  Supabase "Plataforma 11ds" — id `usqiyekfmwwnvkmkdlej` — que é o "Sistema 11 Digital"
  citado pelo usuário), marcando `comprou_material = true`.
- Entrega o e-book (link fixo por edição, liberado assim que a pessoa se identifica).
- Mantém as telas bloqueadas até o apresentador liberar ao vivo, no fim da aula — o link
  das telas só é definido depois, ao vivo.
- Junto da liberação das telas, mostra uma oferta de sessão individual do mapa com o
  Rodrygo (R$850 → R$300, vagas limitadas), os Instagrams `@murarirodrygo` e
  `@institutodespertamente`, e um botão fixo de WhatsApp da equipe.
- Funciona para qualquer edição/cidade do NPA (hoje é o NPA #17 Campinas, mas o mesmo
  evento se repete em outras cidades), com um jeito rápido de trocar os links por edição.

Investigação no banco confirmou que a tabela `npa_eventos` já tem uma linha ativa **"NPA
#17 Campinas"** (data 2026-08-01, hoje) e que `npa_evento_leads` já tem o campo
`comprou_material`. Todas as tabelas envolvidas exigem `auth.role() = 'authenticated'`
via RLS — então o acesso público passa obrigatoriamente por uma Edge Function com a
service role key, no mesmo padrão já usado em `webhook-leads`, `npa-pix-trigger` e
`npa-bv-trigger`.

## Onde vive

Dentro do projeto **Sistema 11ds** (Vite + React + TypeScript + Supabase), o mesmo
projeto do CRM. Não há nenhuma mudança no projeto `idm-membros` (plataforma de cursos
separada, em SQLite, sem relação com esse CRM).

## Arquitetura

### 1. Migration em `npa_eventos`

```sql
alter table npa_eventos
  add column slug             text unique,
  add column ebook_url        text,
  add column telas_url        text,
  add column telas_liberado   boolean not null default false,
  add column telas_liberado_em timestamptz;

alter table npa_evento_leads
  add column material_entregue_em timestamptz;
```

`slug` é preenchido manualmente pelo painel admin (ex: `npa-17-campinas`) — é o que vira
a URL pública. Nada de gerar automaticamente a partir do nome, porque o nome do evento
pode ter acentos/caracteres que não combinam com URL, e o operador pode querer um slug
mais curto para digitar num QR code de fácil leitura. Eventos já existentes (as 10 linhas
atuais de `npa_eventos`, incluindo o NPA #17 Campinas) nascem com `slug` vazio — o
operador preenche pelo painel antes de divulgar o link daquela edição.

### 2. Edge Function `npa-entrega` (nova)

Uma função, três ações no corpo da requisição (`{ action, ... }`), seguindo o padrão de
`webhook-leads` (CORS liberado, service role, validação de payload):

| Ação | Entrada | O que faz | Saída |
|---|---|---|---|
| `evento` | `{ slug }` | Busca o evento pelo slug. Não retorna nenhum link nem dado sensível. | `{ nome, local, data_evento, professor_convidado }` |
| `claim` | `{ slug, nome, email, whatsapp }` | Busca lead em `npa_evento_leads` (do evento) por `email` ou `whatsapp` normalizado (só dígitos). Achou → atualiza `comprou_material=true`, `material_entregue_em=now()`. Não achou → insere lead novo com `fase='novo'`, `comprou_material=true`, `observacoes` sinalizando que veio da página de entrega sem match prévio. Registra em `npa_eventos_log` (evento=`material_entregue`). | `{ lead_id, ebook_url, telas_liberado, telas_url? }` |
| `refresh` | `{ slug, lead_id }` | Confirma que o `lead_id` pertence ao evento e devolve o estado atual das telas — sem escrever nada, sem logar. Usado pelo polling. | `{ telas_liberado, telas_url? }` |

`claim` só roda uma vez por identificação (não é chamado de novo no polling — por isso
existe `refresh` separado, pra não duplicar linhas de log a cada 20s).

### 3. Página pública `/entrega/:slug`

Novo componente `src/pages/NpaEntrega.tsx`, carregado via `React.lazy` como as outras
páginas públicas, registrado em `App.tsx`.

**Fluxo:**

1. Ao montar, chama `evento` pra pegar nome/cidade/data e mostrar no topo — nenhum outro
   conteúdo (nem o card do e-book) aparece antes disso.
2. Se já existe uma identificação salva no `localStorage` (chave por slug) com
   `lead_id`, pula direto pro passo 4.
3. Mostra só o formulário (nome, e-mail, WhatsApp) sobre o nome do evento. Ao enviar,
   chama `claim`. Erro de rede → mensagem com botão "Tentar de novo". Se o evento não
   existir (slug errado) → tela de "evento não encontrado", sem formulário.
4. Salva `{ lead_id, nome }` no `localStorage` e mostra:
   - Card do e-book, sempre liberado (usa `ebook_url` retornado).
   - Card das telas: se `telas_liberado` for falso, aparece bloqueado — cadeado sobre uma
     prévia abstrata borrada (gráfico numerológico genérico em SVG/CSS, sem depender de
     imagem real) e o texto "libera ao vivo, no fim da aula". Se verdadeiro, aparece o
     botão "Ver minhas telas".
5. Enquanto `telas_liberado` for falso, a página consulta `refresh` a cada ~20s (e
   também ao voltar o foco na aba) pra saber se já foi liberado, sem precisar recarregar.
6. Ao clicar em "Ver minhas telas": abre `telas_url` numa aba nova **e** revela, na
   mesma página, o card da oferta do Rodrygo (preço riscado 850 → 300, "vagas
   limitadas", botão que abre o WhatsApp da equipe com mensagem pronta) junto dos links
   dos dois Instagrams. Nada disso aparece antes desse clique.
7. Botão flutuante de WhatsApp da equipe (5511919434040) fica sempre visível no canto,
   independente do estado — para dúvidas gerais, não é a oferta do Rodrygo.

**Visual:** estética "elegante/editorial" do Seu Numerólogo — fundo quase preto
(`#0C0800`/`#0a0700`), dourado em variações (`#D4B06A`, `#C8951A`, `#F0CC80`), tipografia
serifada nos títulos, cabeçalho discreto "NPA #[N] [Cidade] × Instituto Despertamente".
Mesma paleta e espaçamento em todos os estados (formulário → e-book liberado → telas
bloqueadas → telas liberadas → oferta), pra não parecer telas desenhadas em momentos
diferentes.

### 4. Painel `/entrega-admin`

Componente novo, com seu próprio `<AuthProvider>` local (o `AuthProvider` do projeto só
existe dentro de `Index.tsx` hoje, não é global) — reaproveita o mesmo login por
e-mail/senha que a equipe já usa (sessão do Supabase Auth é compartilhada, então quem já
estiver logado no sistema principal não precisa logar de novo). Sem login → mostra o
formulário de login existente. Com login → lista os eventos de `npa_eventos` (busca por
nome, evento com `ativo=true` e data mais próxima de hoje aparece primeiro), e ao
selecionar um permite editar `slug`, `ebook_url`, `telas_url`, e apertar **"Liberar
telas"** (grava `telas_liberado=true`, `telas_liberado_em=now()` — exige `telas_url`
preenchido antes) ou **"Bloquear de novo"**. Escrita direto via `supabase-js`
(RLS já libera pra qualquer usuário autenticado, mesmo padrão do resto do painel
interno) — sem precisar de Edge Function aqui. Interface pensada para uso no celular:
poucos campos, botões grandes.

## Erros e casos de borda

- Slug não encontrado → página de erro amigável, sem formulário.
- Falha ao identificar (rede/servidor) → botão de tentar de novo, sem perder o que foi
  digitado.
- Lead que já foi identificado antes (já tem `lead_id` salvo no navegador) mas
  `comprou_material` for alterado manualmente pra `false` no CRM → a página não
  reverte sozinha; ela só lê o estado das telas via `refresh`, que sempre responde com
  base no `lead_id` já obtido.
- Tentativa de liberar telas no painel sem `telas_url` preenchido → bloqueado com aviso
  antes de gravar.
- Dois dispositivos diferentes se identificando com os mesmos dados → cada um recebe seu
  próprio fluxo normalmente; o `claim` é idempotente em relação ao lead do CRM (atualiza
  o mesmo registro, não duplica).

## Fora de escopo (não pedido, não incluído)

- Nenhum fluxo de pagamento nesta página — o material já foi vendido ao vivo no evento;
  aqui só se confirma a identidade e libera a entrega.
- Nenhuma tela de gestão de leads além do necessário para liberar as telas (a gestão
  completa de leads do NPA já existe no painel interno do Sistema 11ds).
- Preço/condições da oferta do Rodrygo, Instagrams e WhatsApp da equipe são fixos no
  código (não variam por edição/cidade) — não pedido, sem campo no banco para isso.
