import os, re

# Tabelas/views com mais de 1000 linhas hoje. O PostgREST corta a resposta em 1000,
# entao qualquer leitura sem paginacao devolve dado truncado em silencio.
GRANDES = {
    'lead_respostas': 24554, 'lancamento_leads': 13032, 'whatsapp_mensagens': 12952,
    'leads': 11775, 'leads_historico_fase': 11615, 'notifications': 6754,
    'boas_vindas_logs': 4593, 'disparo_leads': 3720, 'pagamentos': 2462,
    'funnel_poll_respostas': 1769, 'sheet_leads_33': 1611, 'sheet_leads_36': 1253,
    'sheet_leads_38': 1196, 'lancamento_kanban': 13032, 'leads_unificados': 13669,
}

arquivos = []
for raiz, _, nomes in os.walk('src'):
    for n in nomes:
        if n.endswith(('.ts', '.tsx')) and n != 'types.ts':
            arquivos.append(os.path.join(raiz, n))

achados = []
for caminho in arquivos:
    try:
        txt = open(caminho, encoding='utf-8', errors='replace').read()
    except OSError:
        continue
    for tabela in GRANDES:
        for m in re.finditer(r"""\.from\(\s*['"]%s['"]""" % re.escape(tabela), txt):
            # Olha o encadeamento ate o proximo ';' — e onde .range()/.limit() apareceriam.
            trecho = txt[m.start():m.start() + 700]
            fim = trecho.find(';')
            if fim > 0:
                trecho = trecho[:fim]
            if '.range(' in trecho or 'fetchAll' in txt[max(0, m.start()-400):m.start()]:
                continue                      # pagina corretamente (direto ou via fetchAll)
            if re.search(r'\.(insert|update|upsert|delete)\(', trecho):
                continue                      # escrita, nao leitura
            lim = re.search(r'\.limit\(\s*(\d+)\s*\)', trecho)
            if lim and int(lim.group(1)) <= 1000:
                continue                      # limite explicito e consciente, abaixo do teto
            # conta agregada nao sofre truncamento
            if "count:" in trecho or "head: true" in trecho:
                continue
            linha = txt[:m.start()].count('\n') + 1
            achados.append((caminho.replace('\\', '/'), linha, tabela, GRANDES[tabela],
                            lim.group(1) if lim else 'sem limite'))

achados.sort(key=lambda a: -a[3])
print(f'{len(achados)} leituras potencialmente truncadas em 1000 linhas:\n')
for caminho, linha, tabela, total, lim in achados:
    print(f'  {tabela:24} ({total:>6} linhas)  {caminho}:{linha}   [{lim}]')
