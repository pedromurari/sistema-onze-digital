# -*- coding: utf-8 -*-
"""Traz para supabase/migrations/ o SQL de migrations que existem no banco e nao no repo.

POR QUE ISTO EXISTE
-------------------
O repositorio e a fonte da verdade do schema — mas migration aplicada pelo painel do
Supabase ou por MCP entra no banco sem virar arquivo. Em agosto/2026 essa divergencia
chegou a 211 arquivos contra 301 registros, e o repo deixou de reproduzir o sistema.

O Supabase guarda o SQL de cada migration em
`supabase_migrations.schema_migrations.statements`. Este script le de la e escreve os
arquivos que faltam — reconstruindo o repo a partir do banco em vez de reescrever de
memoria.

COMO USAR
---------
    npm run db:sync-migrations

Ele baixa o historico, compara com supabase/migrations/ e escreve so o que falta.
Nunca sobrescreve arquivo existente: se o conteudo divergir, avisa e deixa a decisao
com voce.
"""
import io
import os
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, 'supabase', 'migrations')
TEMP = os.path.join(RAIZ, '.tmp-migrations-sync')
DUMP = os.path.join(TEMP, 'historico.sql')

BARRA = chr(92)
ASPAS = '"'


def baixar_historico():
    os.makedirs(TEMP, exist_ok=True)
    print('Baixando o historico de migrations do banco...')
    r = subprocess.run(
        ['npx', 'supabase', 'db', 'dump', '--linked',
         '--data-only', '--schema', 'supabase_migrations', '-f', DUMP],
        cwd=RAIZ, capture_output=True, text=True, shell=(os.name == 'nt'),
        # O CLI escreve UTF-8; sem isto o Windows tenta cp1252 e estoura na leitura.
        encoding='utf-8', errors='replace',
    )
    if r.returncode != 0:
        saida = (r.stderr or '') + (r.stdout or '')
        # `supabase db dump` roda o pg_dump dentro de um container — sem Docker no ar ele
        # falha com uma mensagem sobre npipe/socket que nao diz o que fazer.
        if 'docker' in saida.lower():
            print('Docker precisa estar rodando: o `supabase db dump` executa o pg_dump'
                  ' num container.', file=sys.stderr)
            print('Abra o Docker Desktop e rode de novo.', file=sys.stderr)
        else:
            print('Falhou ao baixar o historico:', file=sys.stderr)
            print(saida, file=sys.stderr)
        sys.exit(1)


def campos_por_linha(s):
    """Fatia o VALUES do INSERT em linhas de campos, respeitando string literal."""
    linhas, atual, campo = [], [], []
    i, n = 0, len(s)
    dentro = False
    while i < n:
        c = s[i]
        if c == "'":
            campo.append(c)
            i += 1
            while i < n:
                if s[i] == "'":
                    if i + 1 < n and s[i + 1] == "'":
                        campo.append("''")
                        i += 2
                        continue
                    campo.append("'")
                    i += 1
                    break
                campo.append(s[i])
                i += 1
            continue
        if c == '(' and not dentro:
            dentro = True
            campo, atual = [], []
            i += 1
            continue
        if c == ')' and dentro:
            atual.append(''.join(campo).strip())
            linhas.append(atual)
            dentro = False
            campo = []
            i += 1
            if s[i:i + 2].strip().startswith(';'):
                break
            continue
        if c == ',' and dentro:
            atual.append(''.join(campo).strip())
            campo = []
            i += 1
            continue
        if dentro:
            campo.append(c)
        i += 1
    return linhas


def texto_de(literal):
    if literal == 'NULL':
        return None
    if not (literal.startswith("'") and literal.endswith("'")):
        return None
    return literal[1:-1].replace("''", "'")


def elementos_do_array(literal):
    """Array literal do Postgres ({\"a\",\"b\"}) -> lista de statements."""
    s = texto_de(literal)
    if s is None:
        return []
    s = s.strip()
    if not (s.startswith('{') and s.endswith('}')):
        return []
    s = s[1:-1]
    saida, i, n = [], 0, len(s)
    while i < n:
        if s[i] == ',':
            i += 1
            continue
        if s[i] == ASPAS:
            i += 1
            buf = []
            while i < n:
                if s[i] == BARRA:
                    buf.append(s[i + 1])
                    i += 2
                    continue
                if s[i] == ASPAS:
                    i += 1
                    break
                buf.append(s[i])
                i += 1
            saida.append(''.join(buf))
        else:
            j = s.index(',', i) if ',' in s[i:] else n
            saida.append(s[i:j])
            i = j
    return saida


def main():
    baixar_historico()
    texto = io.open(DUMP, encoding='utf-8').read()

    marca = 'INSERT INTO "supabase_migrations"."schema_migrations"'
    if marca not in texto:
        print('O dump nao trouxe schema_migrations — nada a fazer.')
        return
    corpo = texto[texto.index('VALUES', texto.index(marca)) + len('VALUES'):]

    ja_no_repo = {}
    for nome in os.listdir(DESTINO):
        if nome.endswith('.sql'):
            ja_no_repo[nome.split('_')[0]] = nome

    escritos, divergentes, iguais = [], [], 0
    for campos in campos_por_linha(corpo):
        if len(campos) < 3:
            continue
        versao = texto_de(campos[0])
        stmts = elementos_do_array(campos[1])
        nome = texto_de(campos[2]) or 'sem_nome'
        if not versao or not stmts:
            continue

        sql = '\n'.join(stmts).rstrip() + '\n'
        arquivo = '%s_%s.sql' % (versao, nome)
        caminho = os.path.join(DESTINO, arquivo)

        if versao in ja_no_repo:
            atual = io.open(os.path.join(DESTINO, ja_no_repo[versao]), encoding='utf-8').read()
            # Compara ignorando espaco: o dump normaliza quebras de linha.
            if ''.join(atual.split()) == ''.join(sql.split()):
                iguais += 1
            else:
                divergentes.append((ja_no_repo[versao], len(atual), len(sql)))
            continue

        io.open(caminho, 'w', encoding='utf-8', newline='\n').write(sql)
        escritos.append(arquivo)

    print('\nJa batiam        : %d' % iguais)
    print('Trazidos do banco: %d' % len(escritos))
    for a in escritos:
        print('  + %s' % a)

    if divergentes:
        print('\nDIVERGENTES (nao toquei — decida qual vale):')
        for arquivo, tam_repo, tam_banco in divergentes:
            print('  ! %s — repo %d chars, banco %d chars' % (arquivo, tam_repo, tam_banco))

    print('\nConferir com:  npx supabase migration list --linked')


if __name__ == '__main__':
    main()
