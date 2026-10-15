-- Item 4 do ROADMAP: base privada para rascunhos de provas e trabalhos.
-- Nao publica formularios, nao recebe alunos e nao aciona IA nesta etapa.
begin;

insert into public.app_recursos (chave, modulo, rotulo, ordem)
values ('pedagogico_avaliacoes', 'Pedagogico', 'Provas e Trabalhos', 18)
on conflict (chave) do nothing;

insert into public.role_permissoes (papel, recurso, acao) values
  ('admin', 'pedagogico_avaliacoes', 'ver'),
  ('admin', 'pedagogico_avaliacoes', 'editar'),
  ('admin', 'pedagogico_avaliacoes', 'excluir'),
  ('gestor', 'pedagogico_avaliacoes', 'ver'),
  ('gestor', 'pedagogico_avaliacoes', 'editar'),
  ('professora', 'pedagogico_avaliacoes', 'ver'),
  ('professora', 'pedagogico_avaliacoes', 'editar')
on conflict do nothing;

create table public.ped_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(btrim(titulo)) between 3 and 160),
  tipo text not null check (tipo in ('prova', 'trabalho')),
  turma_id uuid references public.turmas(id),
  modulo text check (modulo is null or length(btrim(modulo)) between 1 and 160),
  instrucoes text,
  prazo_em timestamptz,
  -- A publicacao depende do conteudo pedagogico e de um portal autenticado.
  status text not null default 'rascunho' check (status = 'rascunho'),
  criado_por uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ped_avaliacoes_turma_idx on public.ped_avaliacoes (turma_id, created_at desc);
create trigger ped_avaliacoes_set_updated_at before update on public.ped_avaliacoes
  for each row execute function public.set_updated_at();

create table public.ped_questoes (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid not null references public.ped_avaliacoes(id) on delete cascade,
  ordem integer not null check (ordem > 0),
  tipo text not null check (tipo in ('discursiva', 'objetiva', 'envio_trabalho')),
  enunciado text not null check (length(btrim(enunciado)) between 3 and 10000),
  resposta_esperada text,
  criterios_correcao text,
  pontos numeric(8,2) not null default 1 check (pontos > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (avaliacao_id, ordem),
  unique (id, avaliacao_id)
);
create index ped_questoes_avaliacao_idx on public.ped_questoes (avaliacao_id, ordem);
create trigger ped_questoes_set_updated_at before update on public.ped_questoes
  for each row execute function public.set_updated_at();

-- Preparadas para o portal do aluno. Sem policy para anon nem para papel de
-- aluno nesta fase: somente staff autorizado pode ler/gravar estes registros.
create table public.ped_entregas (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid not null references public.ped_avaliacoes(id),
  aluno_id uuid not null references public.alunos(id),
  tentativa integer not null default 1 check (tentativa > 0),
  status text not null default 'recebida'
    check (status in ('recebida', 'avaliada_ia', 'revisada', 'liberada')),
  enviado_em timestamptz not null default now(),
  nota_ia numeric(8,2) check (nota_ia is null or nota_ia >= 0),
  parecer_ia text,
  nota_final numeric(8,2) check (nota_final is null or nota_final >= 0),
  revisado_por uuid references auth.users(id),
  revisado_em timestamptz,
  liberado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (avaliacao_id, aluno_id, tentativa),
  unique (id, avaliacao_id)
);
create index ped_entregas_aluno_idx on public.ped_entregas (aluno_id, enviado_em desc);
create trigger ped_entregas_set_updated_at before update on public.ped_entregas
  for each row execute function public.set_updated_at();

create table public.ped_respostas (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid not null,
  entrega_id uuid not null,
  questao_id uuid not null,
  resposta_texto text,
  -- Caminho privado no Storage, nao URL publica. Upload fica para outra fase.
  arquivo_path text,
  nota_ia numeric(8,2) check (nota_ia is null or nota_ia >= 0),
  feedback_ia text,
  created_at timestamptz not null default now(),
  unique (entrega_id, questao_id),
  foreign key (entrega_id, avaliacao_id) references public.ped_entregas(id, avaliacao_id) on delete cascade,
  foreign key (questao_id, avaliacao_id) references public.ped_questoes(id, avaliacao_id)
);
create index ped_respostas_entrega_idx on public.ped_respostas (entrega_id);

alter table public.ped_avaliacoes enable row level security;
alter table public.ped_questoes enable row level security;
alter table public.ped_entregas enable row level security;
alter table public.ped_respostas enable row level security;

revoke all on public.ped_avaliacoes, public.ped_questoes, public.ped_entregas, public.ped_respostas from public, anon;
grant select, insert, update, delete on public.ped_avaliacoes, public.ped_questoes, public.ped_entregas, public.ped_respostas to authenticated;

create policy ped_avaliacoes_ver on public.ped_avaliacoes for select to authenticated
  using ((select public.tem_permissao('pedagogico_avaliacoes', 'ver')));
create policy ped_avaliacoes_inserir on public.ped_avaliacoes for insert to authenticated
  with check ((select public.tem_permissao('pedagogico_avaliacoes', 'editar')) and criado_por = auth.uid());
create policy ped_avaliacoes_atualizar on public.ped_avaliacoes for update to authenticated
  using ((select public.tem_permissao('pedagogico_avaliacoes', 'editar')))
  with check ((select public.tem_permissao('pedagogico_avaliacoes', 'editar')));
create policy ped_avaliacoes_excluir on public.ped_avaliacoes for delete to authenticated
  using ((select public.tem_permissao('pedagogico_avaliacoes', 'excluir')));

create policy ped_questoes_ver on public.ped_questoes for select to authenticated
  using ((select public.tem_permissao('pedagogico_avaliacoes', 'ver')));
create policy ped_questoes_inserir on public.ped_questoes for insert to authenticated
  with check ((select public.tem_permissao('pedagogico_avaliacoes', 'editar')));
create policy ped_questoes_atualizar on public.ped_questoes for update to authenticated
  using ((select public.tem_permissao('pedagogico_avaliacoes', 'editar')))
  with check ((select public.tem_permissao('pedagogico_avaliacoes', 'editar')));
create policy ped_questoes_excluir on public.ped_questoes for delete to authenticated
  using ((select public.tem_permissao('pedagogico_avaliacoes', 'excluir')));

create policy ped_entregas_ver on public.ped_entregas for select to authenticated
  using ((select public.tem_permissao('pedagogico_avaliacoes', 'ver')));
create policy ped_entregas_inserir on public.ped_entregas for insert to authenticated
  with check ((select public.tem_permissao('pedagogico_avaliacoes', 'editar')));
create policy ped_entregas_atualizar on public.ped_entregas for update to authenticated
  using ((select public.tem_permissao('pedagogico_avaliacoes', 'editar')))
  with check ((select public.tem_permissao('pedagogico_avaliacoes', 'editar')));
create policy ped_entregas_excluir on public.ped_entregas for delete to authenticated
  using ((select public.tem_permissao('pedagogico_avaliacoes', 'excluir')));

create policy ped_respostas_ver on public.ped_respostas for select to authenticated
  using ((select public.tem_permissao('pedagogico_avaliacoes', 'ver')));
create policy ped_respostas_inserir on public.ped_respostas for insert to authenticated
  with check ((select public.tem_permissao('pedagogico_avaliacoes', 'editar')));
create policy ped_respostas_atualizar on public.ped_respostas for update to authenticated
  using ((select public.tem_permissao('pedagogico_avaliacoes', 'editar')))
  with check ((select public.tem_permissao('pedagogico_avaliacoes', 'editar')));
create policy ped_respostas_excluir on public.ped_respostas for delete to authenticated
  using ((select public.tem_permissao('pedagogico_avaliacoes', 'excluir')));

commit;
