-- Sprint 3c — Backfill das 29.171 linhas de origem.
--
-- Feito em conjunto, nao linha a linha: chamar `resolver_pessoa()` 29 mil vezes levaria
-- minutos e estouraria o tempo da conexao. A funcao continua sendo a porta de entrada
-- para o dia a dia (gatilho e codigo novo); aqui o mesmo resultado sai em lote.
--
-- Chave de identidade: telefone normalizado, que cobre 29.144 das 29.171 linhas.
-- E-mail NAO une pessoas diferentes aqui de proposito — nesse negocio e comum familia
-- compartilhar e-mail, e unir por e-mail juntaria mae e filha na mesma ficha.
--
-- Resultado medido: 12.121 pessoas, 22.496 identificadores, 29.144 vinculos. Desses,
-- 28.711 pertencem a pessoas que aparecem em duas ou mais tabelas.

create temp table _origens on commit drop as
  select 'leads' as tabela, id::text as origem_id, 'lead' as papel,
         nome, coalesce(whatsapp, telefone) as tel, email, null::text as cpf
    from public.leads
  union all select 'lancamento_leads',     id::text, 'lead',      nome, whatsapp, email, null from public.lancamento_leads
  union all select 'alunos',               id::text, 'aluno',     nome, whatsapp, email, cpf  from public.alunos
  union all select 'npa_evento_leads',     id::text, 'convidado', nome, whatsapp, email, null from public.npa_evento_leads
  union all select 'disparo_leads',        id::text, 'lead',      nome, phone,    email, null from public.disparo_leads
  union all select 'seu_numerologo_leads', id::text, 'lead',      nome, whatsapp, email, null from public.seu_numerologo_leads
  union all select 'franquia_leads',       id::text, 'lead',      nome, whatsapp, email, null from public.franquia_leads;

create temp table _norm on commit drop as
  select *, public.normalizar_telefone(tel) as tel_norm from _origens;

create index on _norm (tel_norm);

-- Uma pessoa por telefone. Para nome e e-mail vence o registro de aluno (cadastro mais
-- cuidadoso que o de lead) e, dentro disso, o texto mais completo.
create temp table _por_telefone on commit drop as
  select
    tel_norm,
    (array_agg(nullif(trim(nome), '')
       order by (tabela = 'alunos') desc, length(coalesce(nome, '')) desc nulls last))[1] as nome,
    (array_agg(lower(nullif(trim(email), ''))
       order by (tabela = 'alunos') desc, (email is not null) desc))[1] as email,
    (array_agg(nullif(regexp_replace(coalesce(cpf, ''), '\D', '', 'g'), '')
       order by (cpf is not null) desc))[1] as cpf
  from _norm
  where tel_norm is not null
  group by tel_norm;

insert into public.pessoas (nome, telefone, email, cpf)
select nome, tel_norm, email, cpf from _por_telefone;

-- Identificadores: telefone sempre; e-mail e CPF com DISTINCT ON para o caso de a mesma
-- chave aparecer em pessoas diferentes (fica com a primeira, as demais so nao ganham a chave).
insert into public.pessoa_identificadores (pessoa_id, tipo, valor)
select p.id, 'telefone', p.telefone from public.pessoas p where p.telefone is not null
on conflict (tipo, valor) do nothing;

insert into public.pessoa_identificadores (pessoa_id, tipo, valor)
select distinct on (p.email) p.id, 'email', p.email
  from public.pessoas p where p.email is not null
 order by p.email, p.criado_em
on conflict (tipo, valor) do nothing;

insert into public.pessoa_identificadores (pessoa_id, tipo, valor)
select distinct on (p.cpf) p.id, 'cpf', p.cpf
  from public.pessoas p where p.cpf is not null
 order by p.cpf, p.criado_em
on conflict (tipo, valor) do nothing;

-- Liga cada linha de origem a sua pessoa.
update public.leads l set pessoa_id = p.id
  from public.pessoas p
 where p.telefone = public.normalizar_telefone(coalesce(l.whatsapp, l.telefone))
   and l.pessoa_id is null;

update public.lancamento_leads l set pessoa_id = p.id
  from public.pessoas p where p.telefone = public.normalizar_telefone(l.whatsapp) and l.pessoa_id is null;

update public.alunos a set pessoa_id = p.id
  from public.pessoas p where p.telefone = public.normalizar_telefone(a.whatsapp) and a.pessoa_id is null;

update public.npa_evento_leads n set pessoa_id = p.id
  from public.pessoas p where p.telefone = public.normalizar_telefone(n.whatsapp) and n.pessoa_id is null;

update public.disparo_leads d set pessoa_id = p.id
  from public.pessoas p where p.telefone = public.normalizar_telefone(d.phone) and d.pessoa_id is null;

update public.seu_numerologo_leads s set pessoa_id = p.id
  from public.pessoas p where p.telefone = public.normalizar_telefone(s.whatsapp) and s.pessoa_id is null;

update public.franquia_leads f set pessoa_id = p.id
  from public.pessoas p where p.telefone = public.normalizar_telefone(f.whatsapp) and f.pessoa_id is null;

-- Vinculos: um por registro de origem que conseguiu pessoa.
insert into public.pessoa_vinculos (pessoa_id, papel, origem_tabela, origem_id)
select p.id, n.papel, n.tabela, n.origem_id
  from _norm n
  join public.pessoas p on p.telefone = n.tel_norm
 where n.tel_norm is not null
on conflict (origem_tabela, origem_id) do nothing;
