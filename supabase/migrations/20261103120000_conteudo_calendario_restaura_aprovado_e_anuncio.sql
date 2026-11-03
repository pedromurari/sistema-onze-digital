-- O status 'aprovado' e o formato 'anuncio' tinham sido removidos da constraint
-- de check em algum momento, mas a tela (CalendarioConteudoView.tsx) continuava
-- oferecendo "Aprovado" no seletor de status -- o usuário escolhia, o banco
-- recusava o update, e a tela parecia "travada". Restaura os dois valores.

alter table conteudo_calendario drop constraint conteudo_calendario_status_check;
alter table conteudo_calendario add constraint conteudo_calendario_status_check
  check (status = any (array['ideia','roteiro','gravando','editando','aprovado','agendado','publicado']));

alter table conteudo_calendario drop constraint conteudo_calendario_formato_check;
alter table conteudo_calendario add constraint conteudo_calendario_formato_check
  check (formato = any (array['reels','feed','stories','carrossel','video','short','anuncio']));
