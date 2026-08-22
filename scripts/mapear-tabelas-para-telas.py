import os, re, collections

TABELAS = """aluno_bonus_eventos aluno_observacoes alunos aquecimento_chips aquecimento_config
aquecimento_grupos aquecimento_jobs aquecimento_mensagens aquecimento_roteiro_mensagens
aquecimento_roteiros_dm boas_vindas_agendados bonus_tipos bonus_turmas conteudo_clientes
conteudo_posts disparo_campanhas disparo_leads equipe_11ds_recorrentes funnel_configs
funnel_messages funnel_poll_respostas grupo_add_jobs kanban_colunas lancamento_campanhas
lancamento_leads lead_aquecimento_campanhas lead_aquecimento_config lead_aquecimento_fases
lead_aquecimento_leads lead_aquecimento_vendedores lead_cartas_usadas leads_cartas_negociacao
leads_diretos_config leads_ia_config leads_ia_conhecimento leads_ia_conhecimento_sugestoes
leads_ia_conversas leads_ia_mensagens leads_ia_oferta_ativa leads_produtos_valores
leads_quadro_cards leads_quadros npa_evento_leads parceiros_links quick_sends responsaveis
seu_numerologo_leads time_comercial_campanhas turma_responsaveis turmas whatsapp_mensagens
whatsapp_opt_out""".split()

# Le todos os arquivos do frontend uma vez so.
arquivos = {}
for raiz, _, nomes in os.walk('src'):
    for n in nomes:
        if n.endswith(('.ts', '.tsx')) and n != 'types.ts':
            caminho = os.path.join(raiz, n)
            try:
                arquivos[caminho] = open(caminho, encoding='utf-8', errors='replace').read()
            except OSError:
                pass

for t in TABELAS:
    padrao = re.compile(r"""['"]%s['"]""" % re.escape(t))
    usos = sorted({os.path.basename(c).replace('.tsx', '').replace('.ts', '')
                   for c, txt in arquivos.items() if padrao.search(txt)})
    print(f"{t:32} {', '.join(usos) if usos else '— SEM USO NO FRONTEND'}")
