-- pg_cron NÃO poda o próprio histórico (`cron.job_run_details`). Com ~16 jobs,
-- vários rodando a cada minuto, essa tabela chegou a 502 MB (era ~80% do banco
-- inteiro) e deixava a limpeza/consulta dela lenta na instância Micro.
--
-- Em 2026-09-10 foi feito um DELETE + VACUUM FULL manual (502 MB -> 9 MB).
-- Este job semanal evita que volte a inchar: domingo 04:15, apaga o que tem
-- mais de 7 dias. DELETE simples (autovacuum reaproveita o espaço); não precisa
-- de VACUUM FULL recorrente enquanto a poda rodar.
--
-- Aplicado via MCP em 2026-09-10 (cron.schedule -> jobid 23).

select cron.schedule(
  'prune-cron-job-run-details',
  '15 4 * * 0',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
