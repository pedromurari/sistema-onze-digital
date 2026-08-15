# Leads Diretos como tela de trabalho do vendedor + cartas de negociação — design

Data: 2026-08-15
Componentes: `Pipeline.tsx` (existente, tela "Leads Diretos"), tabelas novas `leads_cartas_negociacao`/`lead_cartas_usadas`, extensão de `aquecimento-lead-enviar-isca`.

## 1. Contexto

Com os 3 vendedores contratados e o fluxo de [[aquecimento_leads_vendedores]] em produção, a tela "Leads Diretos" (Kanban existente, `Pipeline.tsx`, leads da tabela `leads` com `origem='Direto'`) passa a ser a tela de trabalho do vendedor: onde ele vê os leads atribuídos a ele (tanto os que já vinham do SDR/anúncio quanto os novos do aquecimento) e consulta as "cartas de negociação" — o que ele pode oferecer (desconto, parcelamento, bônus) sem precisar perguntar pro gestor toda hora.

**Por que:** decisão explícita do usuário — vendedores são bons de verdade, a ferramenta deles precisa ser simples e funcional, sem telas extras pra navegar. Sem emoji em nenhuma parte da UI (sistema profissional).

## 2. Cartas de negociação

### Dados
- `leads_cartas_negociacao`: `id`, `titulo`, `descricao`, `tipo` (`desconto`|`parcelamento`|`bonus`|`outro`), `ativo`, `ordem`, `created_at`, `updated_at`.
- `lead_cartas_usadas`: `id`, `lead_id` (FK `leads`), `carta_id` (FK `leads_cartas_negociacao`), `usado_por` (FK `profiles`), `usado_em`.

### Comportamento
- Painel fixo na tela de Leads Diretos lista as cartas ativas (título + descrição), sempre visível pro vendedor.
- Somente admin vê o botão "Editar cartas" — abre um CRUD simples (criar/editar/desativar/reordenar) sobre `leads_cartas_negociacao`. Vendedor não tem esse botão.
- Dentro do card expandido de um lead (`LeadExpandedInfo`), lista das cartas com um toggle "usada" por carta — grava/remove linha em `lead_cartas_usadas`. Sem ordem/hierarquia entre cartas: qualquer uma pode ser marcada a qualquer momento, o vendedor decide.
- Sem emoji nos rótulos de tipo — usar texto ("Desconto", "Parcelamento", "Bônus", "Outro") e cor de badge pra distinguir.

## 3. Ponte: aquecimento → Leads Diretos

`aquecimento-lead-enviar-isca` (edge function já existe), após enviar a isca com sucesso, além de marcar `lead_aquecimento_leads.status='isca_enviada'`, agora também insere uma linha em `leads`:
- `nome` = `lead_aquecimento_leads.nome`, `telefone`/`whatsapp` = `phone`
- `origem` = `'Aquecimento'` (valor novo, distinto de `'Direto'`)
- `status` = `'novo'` (primeira coluna do Kanban)
- `responsavel_id` = o `usuario_id` do vendedor sorteado no rodízio (via `lead_aquecimento_vendedores.usuario_id`)
- `produto` = `'direto'` (mesmo curso da Formação, reaproveitando o que já existe pra leads Diretos)

Isso é o que faz o lead "cair" pro vendedor — não precisa de nenhum evento novo, só a criação da linha em `leads` na hora certa.

## 4. Pipeline.tsx (Leads Diretos)

- `fetchLeads`: query passa a buscar `origem IN ('Direto', 'Aquecimento')` em vez de só `'Direto'` (hoje é `.eq('origem', 'Direto')`). Mesma troca no filtro do `postgres_changes` da subscription realtime.
- Badge de origem em cada card, sempre visível, sem emoji: "Anúncio" (origem Direto) ou "Aquecimento" (origem Aquecimento) — cor de badge diferente pra escaneabilidade rápida no Kanban, sem precisar abrir o card.
- **Escopo por papel:**
  - Vendedor (`user.tipo === 'vendedor'`): `filtroResponsavel` é travado no próprio `user.id`, sem exibir o dropdown de responsável — ele só vê os leads dele.
  - Admin: comportamento atual mantido (dropdown de responsável, vê todos).
- Painel de cartas de negociação: seção nova na tela (acima ou ao lado do Kanban, layout a definir na implementação pra não brigar com o espaço do board), sempre visível pra todo mundo com acesso à tela.

## 5. Fora de escopo

- Não há hierarquia/ordem de escalonamento entre cartas.
- Não há tela/aba nova no menu — tudo dentro de "Leads Diretos".
- Não há limite de quantas cartas podem ser usadas por lead.
- Chat/scripts de mensagem gerados por IA não fazem parte desta entrega (cartas são só desconto/parcelamento/bônus).

## 6. Testes/verificação

- Simular isca enviada (via cron manual ou update direto) e confirmar que aparece um lead novo em Leads Diretos, na coluna "Novo Lead", atribuído ao vendedor certo, com badge "Aquecimento".
- Logar como vendedor (ou simular `tipo='vendedor'`) e confirmar que o dropdown de responsável não aparece e só os leads dele aparecem.
- Logar como admin e confirmar que nada mudou no comportamento de visualização (vê todos, filtro continua disponível).
- Marcar uma carta como usada num lead, recarregar a página, confirmar que o estado persiste.
- Admin edita/desativa uma carta e confirma que ela some/atualiza no painel na hora (ou próximo refresh).
