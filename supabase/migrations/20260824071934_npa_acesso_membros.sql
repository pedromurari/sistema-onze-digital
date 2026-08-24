-- Parte 2 do spec docs/superpowers/specs/2026-08-24-funil-npa-e-area-membros-design.md:
-- guarda o link de acesso que a Área de Membros devolve quando a edge function
-- npa-liberar-acesso-membros libera material/mentoria pra um lead, pra mostrar
-- o botão "Copiar acesso" no card sem precisar chamar a API de novo.

alter table public.npa_evento_leads
  add column if not exists acesso_membros_url text,
  add column if not exists acesso_membros_liberado_em timestamptz;

comment on column public.npa_evento_leads.acesso_membros_url is
  'Magic link de login na Área de Membros IDM, gerado por npa-liberar-acesso-membros ao marcar comprou_material/matriculado.';
comment on column public.npa_evento_leads.acesso_membros_liberado_em is
  'Quando o acesso foi liberado com sucesso — null enquanto a liberação está pendente/falhou.';
