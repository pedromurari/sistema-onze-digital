-- Sprint 1.2a — Papeis que faltavam no banco.
--
-- O enum `app_role` so tinha admin/vendedor/parceiro, mas o tipo `UserRole` do
-- frontend (src/contexts/AuthContext.tsx) ja declarava `professora` — ou seja, era
-- impossivel gravar esse papel: `user_roles.role` rejeitaria o valor.
--
-- `gestor` e novo e resolve o problema pratico de hoje: quem precisa enxergar o time
-- inteiro so tem a opcao de virar admin, e admin ignora qualquer restricao.
--
-- Valor de enum precisa ser criado numa transacao separada de onde e usado — por isso
-- esta migration so adiciona, e a 20260821160500 usa.

alter type public.app_role add value if not exists 'gestor';
alter type public.app_role add value if not exists 'professora';
