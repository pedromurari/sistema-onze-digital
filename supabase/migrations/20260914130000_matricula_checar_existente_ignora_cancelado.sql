-- matricula_checar_existente encontrava aluno_id mesmo quando o cadastro
-- antigo estava com status='cancelado', o que travava matricula_time_comercial_criar
-- com erro 'ja_matriculado' para sempre -- quem cancelou nunca mais conseguia
-- se matricular de novo pelo fluxo normal.
--
-- Caso real 2026-09-14: Danieli da Silva Macedo Pereira se matriculou em
-- turma antiga, não pagou nenhuma parcela, foi cancelada -- e ao tentar se
-- matricular de novo (venda da Helen, turma #02726) o sistema recusava por
-- "já matriculado", achando o aluno_id do cadastro cancelado.
--
-- Fix: ignora alunos com status='cancelado' na checagem por aluno_id (o
-- lead_id continua igual, sem alteração -- é só sinalização de lead antigo,
-- não bloqueia nada).

create or replace function public.matricula_checar_existente(p_email text, p_phone9 text)
returns json
language sql
security definer
set search_path to 'public'
as $function$
  select json_build_object(
    'lead_id', (
      select id from leads
      where email = p_email or (p_phone9 <> '' and whatsapp ilike '%' || p_phone9 || '%')
      order by criado_em desc nulls last
      limit 1
    ),
    'aluno_id', (
      select id from alunos
      where email = p_email and status <> 'cancelado'
      limit 1
    )
  );
$function$;
