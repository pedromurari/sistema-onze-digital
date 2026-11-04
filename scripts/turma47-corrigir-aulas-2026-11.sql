-- Correção pontual da Turma #47. Mensagens já enviadas ficam intactas.
begin;

update public.lancamentos
set data_live = date '2026-11-03'
where id = '3aae6849-f680-4b78-b60c-6b3dc7a0da50'
  and nome = 'Turma #47';

update public.funnel_configs
set variaveis = variaveis || jsonb_build_object(
  'data_aula_1', '03/11', 'data_aula_2', '04/11', 'data_aula_3', '05/11',
  'data_aula_iso_1', '2026-11-03', 'data_aula_iso_2', '2026-11-04', 'data_aula_iso_3', '2026-11-05',
  'link_aula_1', 'https://youtube.com/live/GlwwOCnYb2g?feature=share',
  'link_aula_2', 'https://youtube.com/live/9XI7J0bEg-o?feature=share',
  'link_aula_3', 'https://youtube.com/live/JeSYlKYx9P4?feature=share'
)
where funnel_name = 'Turma #47';

update public.eventos_calendario
set data_inicio = case id
  when '7772d4a2-f5f9-4a67-84da-98b1ff0f0c6d' then timestamptz '2026-11-03 23:00:00+00'
  when '4e664d23-aff9-4f2a-98bb-a33bc1618a44' then timestamptz '2026-11-04 23:00:00+00'
  when 'ff82cf7f-79ac-4eb7-83ac-ac69cb06f8fe' then timestamptz '2026-11-05 23:00:00+00'
end
where id in (
  '7772d4a2-f5f9-4a67-84da-98b1ff0f0c6d',
  '4e664d23-aff9-4f2a-98bb-a33bc1618a44',
  'ff82cf7f-79ac-4eb7-83ac-ac69cb06f8fe'
);

update public.funnel_messages
set message_text = replace(replace(replace(message_text,
  'https://youtube.com/live/T6LfqzG8eso', 'https://youtube.com/live/GlwwOCnYb2g?feature=share'),
  'https://youtube.com/live/sOp_aHwcjPg', 'https://youtube.com/live/9XI7J0bEg-o?feature=share'),
  'https://youtube.com/live/dOOnSHWIpAk', 'https://youtube.com/live/JeSYlKYx9P4?feature=share')
where funnel_name = 'Turma #47'
  and status in ('scheduled', 'draft')
  and (message_text like '%T6LfqzG8eso%'
    or message_text like '%sOp_aHwcjPg%'
    or message_text like '%dOOnSHWIpAk%');

commit;
