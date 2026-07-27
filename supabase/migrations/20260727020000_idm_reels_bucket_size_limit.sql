-- Bucket idm-reels nao tinha file_size_limit proprio (ficava no default global
-- do projeto, ~50MB) -- um video final do Modo A (preset ultrafast por causa
-- do timeout apertado do render por cena) passou disso e o upload falhou com
-- 413 Payload too large. Sobe o limite proprio do bucket pra 200MB.
update storage.buckets set file_size_limit = 209715200 where id = 'idm-reels';
