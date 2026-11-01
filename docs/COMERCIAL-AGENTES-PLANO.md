# Comercial — gerente de IA e apoio à vendedora

Decisão de 01/11/2026: construir primeiro a gestão dentro do CRM. O bot no
Telegram fica em **standby**; não criar fluxo n8n, token, envio ou acesso da
vendedora por esse canal agora.

## 1. Base de gestão — em andamento

- Diretoria Comercial mostra prioridades operacionais reais: retornos
  atrasados, retornos de hoje e leads novos do mês sem vendedor. Consulta
  agregada, somente leitura; nenhuma mensagem é enviada.
- Próximo passo: abrir a fila detalhada apenas para quem tem permissão de
  direção/gestão, sem expor os leads de outros vendedores a cada vendedor.
- Definir data real de fechamento da venda e manter histórico de transições
  do funil. A taxa de conversão atual usa coorte de criação do lead e é só
  aproximação; não apresentar como conversão fechada do período.
- Medir tempo até primeiro contato, proposta sem próxima ação, follow-up
  vencido e qualidade do cadastro por vendedor e origem. Excluir bases
  antigas de retorno do denominador operacional quando não trabalhadas.

## 2. Gerente Comercial — Rodrygo

- Relatório diário consultivo com números e fontes: entradas, distribuição,
  follow-ups, propostas, fechamentos, meta e comissões.
- Primeira versão sem IA generativa nem execução automática: regras
  determinísticas no CRM, com horário de atualização e erro de consulta
  visíveis. Depois, síntese em linguagem natural apoiada em dados
  verificados e rastreáveis.
- Qualquer alteração de lead, atribuição ou envio futuro exige comando
  explícito, checagem de permissão e trilha de auditoria.

## 3. Apoio à Helen — standby fora do CRM

- Futuro assistente com acesso só aos próprios leads e playbook aprovado;
  autenticação de identidade antes de consultar dados pessoais.
- Pode sugerir resposta e próxima ação, mas não enviar WhatsApp nem mover
  etapa sozinho. Ações dependem de confirmação e registro.
- Telegram/n8n permanecem desligados até decisão posterior do Pedro.

## 4. Melhorias visuais

- Diretoria: faixa de prioridades do dia antes da meta, com estados vazios
  e erros explícitos; acesso rápido à fila correspondente no CRM.
- Funil: próxima ação, prazo e responsável no cartão; filtros por origem,
  vendedor, canal e turma/produto; visão de exceções.
- Metas e comissões: suporte a vários vendedores reais (hoje
  `INITIAL_VENDORS` é fixo), separar venda confirmada, comissão reservada
  e comissão paga. Ajuda de custo não é faturamento.

## Segurança e coordenação

Seguir `AGENTS.md`: RLS, GRANT e `tem_permissao` em qualquer tabela/API
nova. Não usar `service_role` no navegador. Não duplicar o fluxo de
follow-up ou disparo já existente; consultar `TimeComercial.tsx`,
`followup-vendedor-enviar` e o playbook da Diretoria antes de alterar.
O cofre do Obsidian (`Comercial`) é a fonte de papéis e decisões.
