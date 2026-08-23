-- A captura de lead da landing page, num lugar só.
--
-- ── O QUE ISTO SUBSTITUI ────────────────────────────────────────────────────
-- Hoje cada lançamento exige uma tabela `sheet_leads_NN` criada por migration, a chave
-- anônima embutida na página e um deploy apontando para a tabela certa. Três coisas para
-- acertar por turma, nenhuma delas avisa quando dá errado — e deu: a página da Turma #44
-- grava nos dois lugares e o `sheet_leads_44` responde 401 em toda captura desde 22/08.
--
-- As `sheet_leads_NN` sao copia integral: conferido na #43, 648 de 648 telefones ja
-- estavam em `lancamento_leads`, zero exclusivos, e nada no sistema as le.
--
-- Aqui a captura vira uma chamada só. Lançamento novo não precisa de tabela nem de deploy.
--
-- ── POR QUE NO BANCO E NÃO NA EDGE FUNCTION ─────────────────────────────────
-- A deduplicação precisa comparar telefone NORMALIZADO. Feita de fora, seria uma chamada
-- de `normalizar_telefone` por lead já existente — 650 chamadas por captura numa turma
-- cheia. Aqui é uma consulta. E, sendo uma função só, resolver + deduplicar + gravar
-- acontece de forma atômica: dois cliques simultâneos não viram dois leads.

create or replace function public.capturar_lead(
  p_nome     text,
  p_whatsapp text,
  p_turma    text default null,
  p_email    text default null,
  p_cidade   text default null,
  p_simular  boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $fn$
declare
  v_nome      text;
  v_tel       text;
  v_turma     text;
  v_lanc      record;
  v_existente uuid;
  v_novo      uuid;
begin
  -- ── Validação ─────────────────────────────────────────────────────────────
  v_nome := nullif(btrim(coalesce(p_nome, '')), '');
  if v_nome is null then
    return jsonb_build_object('ok', false, 'erro', 'nome e obrigatorio');
  end if;
  v_nome := left(v_nome, 120);

  v_tel := public.normalizar_telefone(p_whatsapp);
  if v_tel is null then
    return jsonb_build_object('ok', false, 'erro', 'whatsapp nao parece um numero valido');
  end if;

  -- ── Para qual lançamento vai ──────────────────────────────────────────────
  -- Aceita "44", "#44", "turma 44" ou "Turma #44": a página é escrita por quem monta a
  -- campanha, e uma captura inteira não pode se perder por causa de um "#".
  v_turma := nullif(btrim(coalesce(p_turma, '')), '');
  if v_turma is not null then
    if v_turma ~ '(\d{1,4})\s*$' then
      v_turma := 'Turma #' || (regexp_match(v_turma, '(\d{1,4})\s*$'))[1];
    end if;

    select l.id, l.nome into v_lanc
      from public.lancamentos l
     where l.nome = v_turma and l.ativo
     limit 1;

    if not found then
      return jsonb_build_object('ok', false, 'erro',
        format('lancamento "%s" nao existe ou esta inativo', v_turma));
    end if;
  else
    -- Sem turma informada: o corrente é o de live mais próxima que ainda não passou; se
    -- todas passaram, o mais recente. Assim uma página genérica segue funcionando quando
    -- a turma vira, sem ninguém editar o HTML.
    select l.id, l.nome into v_lanc
      from public.lancamentos l
     where l.ativo and l.data_live >= current_date
     order by l.data_live asc
     limit 1;

    if not found then
      select l.id, l.nome into v_lanc
        from public.lancamentos l
       where l.ativo
       order by l.data_live desc nulls last
       limit 1;
    end if;

    if not found then
      return jsonb_build_object('ok', false, 'erro', 'nenhum lancamento ativo para receber');
    end if;
  end if;

  -- ── Já existe? ────────────────────────────────────────────────────────────
  -- Clicar duas vezes, ou voltar pelo anuncio, nao pode virar dois leads — e sobretudo
  -- nao pode disparar a mensagem de boas-vindas de novo para quem ja recebeu.
  select ll.id into v_existente
    from public.lancamento_leads ll
   where ll.lancamento_id = v_lanc.id
     and public.normalizar_telefone(ll.whatsapp) = v_tel
   limit 1;

  if p_simular then
    return jsonb_build_object(
      'ok', true, 'simulacao', true,
      'lancamento', v_lanc.nome,
      'telefone_normalizado', v_tel,
      'ja_cadastrado', v_existente is not null,
      'observacao', 'nada foi gravado');
  end if;

  if v_existente is not null then
    update public.lancamento_leads
       set nome   = v_nome,
           email  = coalesce(nullif(btrim(p_email),  ''), email),
           cidade = coalesce(nullif(btrim(p_cidade), ''), cidade)
     where id = v_existente;

    return jsonb_build_object('ok', true, 'id', v_existente,
                              'lancamento', v_lanc.nome, 'repetido', true);
  end if;

  insert into public.lancamento_leads (lancamento_id, nome, whatsapp, email, cidade, data_entrada)
  values (v_lanc.id, v_nome, p_whatsapp,
          nullif(btrim(p_email), ''), nullif(btrim(p_cidade), ''), now())
  returning id into v_novo;

  return jsonb_build_object('ok', true, 'id', v_novo,
                            'lancamento', v_lanc.nome, 'repetido', false);
end;
$fn$;

comment on function public.capturar_lead(text, text, text, text, text, boolean) is
  'Captura de lead da landing page: resolve o lancamento, deduplica por telefone normalizado e grava — numa chamada atomica. Substitui a tabela sheet_leads_NN por lancamento, que era copia integral e ninguem lia. Chamada apenas pela edge function captura-lead, com service_role.';

-- Só o servidor chama. A página fala com a edge function, que valida e usa service_role —
-- assim a tabela nao precisa de nenhum grant para `anon`.
revoke execute on function public.capturar_lead(text, text, text, text, text, boolean)
  from public, anon, authenticated;
