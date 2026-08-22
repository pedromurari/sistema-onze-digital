-- Order bump "+1 Ingresso por só mais R$10 - PARA SEU CONVIDADO" (NPA/Vega):
-- quando comprado junto do ingresso principal, precisamos coletar nome +
-- whatsapp do segundo participante pelo próprio WhatsApp do comprador.

alter table npa_evento_leads
  add column if not exists ingressos_comprados        integer not null default 1,
  add column if not exists aguardando_dados_convidado  boolean not null default false,
  add column if not exists convidado_nome              text,
  add column if not exists convidado_whatsapp           text;
