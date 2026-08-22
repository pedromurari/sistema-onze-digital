-- Pipeline de Reels IDM (geracao/edicao automatizada de video). Nunca publica
-- sozinho -- so entrega o video pronto em ready_for_review pra revisao manual.

create table video_scripts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  full_narration_text text not null,
  blocks jsonb not null, -- [{ order, text, cut_type, image_prompt, movement_type, emphasis }]
  criado_por uuid references auth.users(id),
  created_at timestamptz default now()
);

create table video_jobs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('ai_generated', 'own_footage')),
  script_id uuid references video_scripts(id),
  raw_video_url text,
  manual_emphasis_points jsonb,
  status text not null default 'queued' check (status in (
    'queued', 'generating_audio', 'transcribing', 'generating_scenes', 'rendering', 'ready_for_review', 'failed'
  )),
  error_message text,
  final_video_url text,
  criado_por uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table video_assets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references video_jobs(id) on delete cascade,
  asset_type text not null check (asset_type in ('narration_audio', 'scene_image', 'transcript_json')),
  block_order int,
  storage_url text not null,
  created_at timestamptz default now()
);

alter table video_scripts enable row level security;
alter table video_jobs enable row level security;
alter table video_assets enable row level security;

create policy "Authenticated users can view video_scripts" on video_scripts for select to authenticated using (true);
create policy "Authenticated users can create video_scripts" on video_scripts for insert to authenticated with check (true);

create policy "Authenticated users can view video_jobs" on video_jobs for select to authenticated using (true);
create policy "Authenticated users can create video_jobs" on video_jobs for insert to authenticated with check (true);
create policy "Authenticated users can update video_jobs" on video_jobs for update to authenticated using (true);

create policy "Authenticated users can view video_assets" on video_assets for select to authenticated using (true);
