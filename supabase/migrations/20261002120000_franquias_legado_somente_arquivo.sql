-- Os leads de venda de franquia foram copiados para o projeto IDM PSI Franquia.
-- O CRM interno não oferece mais esta tela. Manter as linhas legadas como
-- arquivo, sem leitura ou alteração direta por usuários deste CRM.
-- INSERT é preservado temporariamente até identificar a captura externa.
begin;
revoke select, update, delete on table public.franquia_leads
  from anon, authenticated;
revoke select, update, delete on table public.franquia_campanha
  from anon, authenticated;
commit;
