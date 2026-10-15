-- Pedido da Ellen (vendedora), via Pedro, 15/10/2026: simplificar o funil do
-- Time Comercial pra 6 etapas + Perdido separado. Afeta todos os canais
-- exceto SDD (que tem funil proprio): Direto, Webinario, Workshop,
-- Retorno/Base, Organico -- etapas sao por canal inteiro no codigo
-- (TimeComercial.tsx), nao por campanha, entao nao da pra isolar so a
-- campanha "Padrao - Formacao em Psicanalise" sem reescrever a arquitetura.
--
-- Remapeamento (preserva o lead na etapa de sentido equivalente, nao reseta
-- ninguem pra "novo"): aquecimento+qualificado -> interessado,
-- proposta_enviada -> proposta, negociacao+aquecimento_conteudo -> followup,
-- matricula -> fechado. 'novo', 'primeiro_contato', 'followup' e 'retorno'
-- mantêm a mesma chave (só o rótulo na tela mudou). SDD fica intocado.
update public.leads
set status = case status
  when 'aquecimento' then 'interessado'
  when 'proposta_enviada' then 'proposta'
  when 'negociacao' then 'followup'
  when 'matricula' then 'fechado'
  else status
end
where canal <> 'SDD'
  and status in ('aquecimento', 'proposta_enviada', 'negociacao', 'matricula');
