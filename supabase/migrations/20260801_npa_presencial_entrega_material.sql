-- Página /npa-presencial (entrega de e-book + telas pós-evento NPA).
-- Aplicada diretamente via MCP em 2026-08-01; arquivo adicionado aqui pro
-- histórico de migrations do projeto ficar completo.

alter table npa_eventos
  add column if not exists slug              text unique,
  add column if not exists ebook_url         text,
  add column if not exists telas_url         text,
  add column if not exists telas_liberado    boolean not null default false,
  add column if not exists telas_liberado_em timestamptz;

alter table npa_evento_leads
  add column if not exists material_entregue_em timestamptz;
