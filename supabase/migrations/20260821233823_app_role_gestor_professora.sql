-- Sprint 1.2a — Papeis que faltavam no banco.
-- O enum so tinha admin/vendedor/parceiro, mas UserRole do frontend ja declarava
-- `professora` — era impossivel gravar esse papel. `gestor` e novo: hoje quem precisa
-- ver o time inteiro so tem a opcao de virar admin, e admin ignora toda restricao.
-- Valor de enum precisa transacao separada de onde e usado (ver 20260821160500).

alter type public.app_role add value if not exists 'gestor';
alter type public.app_role add value if not exists 'professora';
