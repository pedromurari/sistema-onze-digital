-- Sprint 3d — Registro novo ja nasce ligado a uma pessoa.
--
-- Sem isto o backfill seria uma foto: resolveria o passado e a base voltaria a duplicar
-- a partir do primeiro lead de amanha. Os gatilhos usam a mesma `resolver_pessoa()` do
-- codigo de aplicacao, entao nao ha duas regras de identidade convivendo.
--
-- Um gatilho generico, parametrizado pela coluna de telefone e pelo papel, em vez de sete
-- funcoes quase iguais — que e exatamente o padrao que esta refatoracao existe pra evitar.

create or replace function public.trg_pessoa_vincular()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_linha jsonb := to_jsonb(new);
  v_pessoa uuid;
begin
  if new.pessoa_id is not null then
    return new;
  end if;

  v_pessoa := public.resolver_pessoa(
    v_linha ->> 'nome',
    v_linha ->> tg_argv[0],     -- coluna do telefone varia por tabela (whatsapp, phone, ...)
    v_linha ->> 'email',
    v_linha ->> 'cpf'           -- NULL nas tabelas que nao tem a coluna
  );

  new.pessoa_id := v_pessoa;
  return new;
end;
$fn$;

comment on function public.trg_pessoa_vincular() is
  'BEFORE INSERT: preenche pessoa_id. Argumento 1 = nome da coluna de telefone da tabela.';

create or replace function public.trg_pessoa_registrar_vinculo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.pessoa_id is null then
    return new;
  end if;

  insert into public.pessoa_vinculos (pessoa_id, papel, origem_tabela, origem_id)
  values (new.pessoa_id, tg_argv[0], tg_table_name, new.id::text)
  on conflict (origem_tabela, origem_id) do nothing;

  return new;
end;
$fn$;

comment on function public.trg_pessoa_registrar_vinculo() is
  'AFTER INSERT: registra o vinculo (precisa do id, que so existe depois de gravar). Argumento 1 = papel.';

-- leads
create trigger pessoa_vincular before insert on public.leads
  for each row execute function public.trg_pessoa_vincular('whatsapp');
create trigger pessoa_registrar_vinculo after insert on public.leads
  for each row execute function public.trg_pessoa_registrar_vinculo('lead');

-- lancamento_leads
create trigger pessoa_vincular before insert on public.lancamento_leads
  for each row execute function public.trg_pessoa_vincular('whatsapp');
create trigger pessoa_registrar_vinculo after insert on public.lancamento_leads
  for each row execute function public.trg_pessoa_registrar_vinculo('lead');

-- alunos
create trigger pessoa_vincular before insert on public.alunos
  for each row execute function public.trg_pessoa_vincular('whatsapp');
create trigger pessoa_registrar_vinculo after insert on public.alunos
  for each row execute function public.trg_pessoa_registrar_vinculo('aluno');

-- npa_evento_leads
create trigger pessoa_vincular before insert on public.npa_evento_leads
  for each row execute function public.trg_pessoa_vincular('whatsapp');
create trigger pessoa_registrar_vinculo after insert on public.npa_evento_leads
  for each row execute function public.trg_pessoa_registrar_vinculo('convidado');

-- disparo_leads (coluna de telefone e `phone`)
create trigger pessoa_vincular before insert on public.disparo_leads
  for each row execute function public.trg_pessoa_vincular('phone');
create trigger pessoa_registrar_vinculo after insert on public.disparo_leads
  for each row execute function public.trg_pessoa_registrar_vinculo('lead');

-- seu_numerologo_leads
create trigger pessoa_vincular before insert on public.seu_numerologo_leads
  for each row execute function public.trg_pessoa_vincular('whatsapp');
create trigger pessoa_registrar_vinculo after insert on public.seu_numerologo_leads
  for each row execute function public.trg_pessoa_registrar_vinculo('lead');

-- franquia_leads
create trigger pessoa_vincular before insert on public.franquia_leads
  for each row execute function public.trg_pessoa_vincular('whatsapp');
create trigger pessoa_registrar_vinculo after insert on public.franquia_leads
  for each row execute function public.trg_pessoa_registrar_vinculo('lead');
