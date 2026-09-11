-- Os jobs usavam pg_sleep para simular segundos dentro de uma agenda de minuto.
-- Isso ocupava workers do pg_cron sem fazer trabalho: nas 24 horas anteriores a
-- esta correção, o banco registrou centenas de `job startup timeout`. O POST feito
-- por pg_net já é assíncrono e retorna rápido, portanto segurar a conexão não traz
-- ordenação confiável e só aumenta a fila.
--
-- Esta migração remove TODO pg_sleep presente nos jobs ativos ou inativos. Os jobs
-- que não precisam rodar a cada minuto também recebem offsets reais no cron, para
-- não disputarem todos o segundo zero. Os seis workers de minuto mantêm a frequência
-- original: pg_cron 1.6 aceita intervalos de 1 a 59 segundos, mas não oferece um
-- intervalo de 60 segundos com offset; reduzir para 2 minutos mudaria a operação.
--
-- Escrito pelo Codex. NÃO aplicado: o Claude deve revisar e aplicar.

do $$
declare
  v_job record;
  v_command text;
begin
  for v_job in
    select jobid, command
      from cron.job
     where command ~* 'pg_sleep[[:space:]]*[(]'
  loop
    v_command := regexp_replace(
      v_job.command,
      '^[[:space:]]*select[[:space:]]+pg_sleep[[:space:]]*[(][[:space:]]*[0-9.]+[[:space:]]*[)][[:space:]]*;[[:space:]]*$',
      '',
      'gim'
    );

    if v_command ~* 'pg_sleep[[:space:]]*[(]' then
      raise exception 'Não foi possível retirar pg_sleep do cron job %', v_job.jobid;
    end if;

    perform cron.alter_job(job_id := v_job.jobid, command := v_command);
  end loop;
end $$;

-- Offsets deliberados para rotinas menos frequentes. `cron.alter_job` preserva
-- comando, banco, usuário e estado quando o argumento correspondente fica NULL.
do $$
declare
  v_offset record;
  v_job_id bigint;
begin
  for v_offset in
    select *
      from (values
        ('funil-processar-cron',                    '1-59/5 * * * *'),
        ('grupo-add-worker',                        '2-59/7 * * * *'),
        ('aquecimento-lead-enviar-fase-cron',       '2-59/3 * * * *'),
        ('npa-lembrete-30min-cron',                 '3-59/5 * * * *'),
        ('followup-vendedor-enviar-cron',           '4-59/15 * * * *'),
        ('leads-ia-followup-tick',                  '12,42 * * * *'),
        ('matricula-boleto-mensal-gerar-cron',      '2 12,18 * * *'),
        ('time-comercial-followup-alerta-cron',     '7 12 * * *')
      ) as offsets(jobname, nova_agenda)
  loop
    select jobid into v_job_id
      from cron.job
     where jobname = v_offset.jobname;

    -- Ambientes novos podem ainda não ter todos os módulos. Nesse caso a migração
    -- continua; quando o job for criado, sua própria migração define a agenda.
    if found then
      perform cron.alter_job(job_id := v_job_id, schedule := v_offset.nova_agenda);
    end if;
  end loop;
end $$;
