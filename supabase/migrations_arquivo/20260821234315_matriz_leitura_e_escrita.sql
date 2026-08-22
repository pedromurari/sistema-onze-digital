-- Sprint 1.2c — Leitura e escrita da matriz pelo TeamManagement.
--
-- Sem estas duas funcoes o frontend continuaria escrevendo em `user_access_permissions`
-- e a matriz viraria copia morta — duas fontes da verdade, que e exatamente o problema
-- que esta refatoracao existe pra resolver.
--
-- `permissoes_efetivas` devolve a matriz ja resolvida (override sobre padrao do papel) de
-- TODA a equipe numa chamada so, pra tela de permissoes.
-- `definir_permissao` grava um toggle: se a escolha bate com o padrao do papel, apaga o
-- override em vez de gravar; assim a tabela de excecao guarda so o que e de fato excecao,
-- e mudar o padrao de um papel passa a valer pra quem nunca foi customizado.

create or replace function public.permissoes_efetivas()
returns table (user_id uuid, recurso text, acao text, permitido boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select p.id,
         r.chave,
         a.acao,
         coalesce(
           (select o.permitido from public.user_permissao_override o
             where o.user_id = p.id and o.recurso = r.chave and o.acao = a.acao),
           exists (select 1 from public.role_permissoes rp
                    where rp.papel = ur.role and rp.recurso = r.chave and rp.acao = a.acao)
         )
  from public.profiles p
  left join public.user_roles ur on ur.user_id = p.id
  cross join public.app_recursos r
  cross join (values ('ver'),('editar'),('excluir'),('ver_todos')) a(acao)
  where public.is_admin();
$fn$;

comment on function public.permissoes_efetivas() is
  'Matriz resolvida de toda a equipe. So admin recebe linhas — sem admin, retorna vazio.';

create or replace function public.definir_permissao(
  p_user_id   uuid,
  p_recurso   text,
  p_acao      text,
  p_permitido boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_papel   public.app_role;
  v_padrao  boolean;
begin
  if not public.is_admin() then
    raise exception 'Apenas admin pode alterar permissao';
  end if;

  if not exists (select 1 from public.app_recursos where chave = p_recurso) then
    raise exception 'Recurso desconhecido: %', p_recurso;
  end if;

  select ur.role into v_papel from public.user_roles ur where ur.user_id = p_user_id;

  v_padrao := exists (
    select 1 from public.role_permissoes rp
    where rp.papel = v_papel and rp.recurso = p_recurso and rp.acao = p_acao
  );

  if p_permitido = v_padrao then
    -- Voltou ao padrao do papel: nao guarda excecao.
    delete from public.user_permissao_override
     where user_id = p_user_id and recurso = p_recurso and acao = p_acao;
  else
    insert into public.user_permissao_override (user_id, recurso, acao, permitido)
    values (p_user_id, p_recurso, p_acao, p_permitido)
    on conflict (user_id, recurso, acao)
    do update set permitido = excluded.permitido, definido_em = now();
  end if;
end;
$fn$;

comment on function public.definir_permissao(uuid, text, text, boolean) is
  'Grava um toggle de permissao. Se a escolha bate com o padrao do papel, remove o override.';

revoke execute on function public.permissoes_efetivas() from public, anon;
revoke execute on function public.definir_permissao(uuid, text, text, boolean) from public, anon;
grant  execute on function public.permissoes_efetivas() to authenticated;
grant  execute on function public.definir_permissao(uuid, text, text, boolean) to authenticated;
