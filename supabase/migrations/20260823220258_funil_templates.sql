-- Pedido do dono: poder escolher, ao criar um novo funil (Lançamento/NPA), qual
-- template de mensagens de aquecimento usar — hoje o texto de cada dia vem 100%
-- fixo no código-fonte (lancamento-templates.ts), sem forma de ter uma segunda
-- versão sem editar código.
--
-- `conteudo` guarda só as SOBRESCRITAS: um template vazio ({}) usa o texto padrão
-- embutido no código pra todo dia/enquete/oferta. Um template novo só precisa
-- preencher o que quer trocar — o resto continua caindo no texto já validado.
-- Isso evita duplicar ~800 linhas de copy pro banco só pra ter uma opção "Padrão".

create table public.funil_templates (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('lancamento', 'npa')),
  nome       text not null,
  ativo      boolean not null default true,
  conteudo   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.funil_templates is
  'Templates de mensagem de aquecimento por tipo de funil (lançamento/NPA). conteudo é só as sobrescritas — vazio = usa o texto padrão embutido no gerador.';

alter table public.funil_templates enable row level security;

revoke all on public.funil_templates from anon, public;

create policy "Authenticated can view active funil_templates"
  on public.funil_templates for select
  using (true);

create policy "Admin can manage funil_templates"
  on public.funil_templates for all
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));

grant select on public.funil_templates to authenticated;
grant insert, update, delete on public.funil_templates to authenticated;

insert into public.funil_templates (tipo, nome, conteudo) values
  ('lancamento', 'Padrão', '{}'::jsonb),
  ('npa', 'Padrão', '{}'::jsonb);
