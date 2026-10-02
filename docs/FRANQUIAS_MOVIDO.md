# IDM PSI Franquias — menu transferido

O menu `franquia_psi` (Kanban de compradores de franquia e campanhas) foi
retirado da navegação, da rota e da tela de permissões deste CRM. A nova área
fica no repositório `E:\idmpc-franqueadora`, rota ADM `/expansao`, em um
Supabase separado. O funil de **alunos** de cada unidade naquele portal usa
outras tabelas e não se mistura com estes contatos.

Os 5 contatos de `franquia_leads` foram copiados e conferidos no banco novo em
02/10/2026 pelo script idempotente `scripts/importar_leads_expansao.ps1`.
Os 5 originais e a tabela vazia `franquia_campanha` permanecem intactos até a
configuração do Cloudflare Turnstile da landing page de captura
`https://www.idmpsifranquia.com/`. Não recriar o menu neste CRM.
`lista_espera_cidades` é outra captura pública, documentada como
espera de cidades/turmas; ela não foi transferida como lead de franquia.

A migration `20261002120000_franquias_legado_somente_arquivo.sql` revogou
SELECT/UPDATE/DELETE dos papéis `authenticated` e `anon` nas duas tabelas
legadas. A migration `20261002130000_encerrar_insercao_franquias_legado.sql`
também revogou INSERT após a landing page deixar de apontar para este banco.
O HTML da landing page antiga tentou inserir
com a chave `anon`, mas a policy da tabela não permitia INSERT anônimo; em
02/10/2026, seu último lead registrado era de 09/08/2026. O novo HTML já foi
publicado sem apontar para este banco e não anuncia sucesso quando a gravação
falha. O arquivo histórico permanece acessível ao papel administrativo do
banco (`service_role`) para auditoria e conferência.
