# Indicador de último contato + resposta no card da Fila de Cobrança

## Problema

O card de cada aluno na aba "Fila" da tela de Cobrança (`src/components/crm/Cobranca.tsx`) não mostra
se aquele aluno já foi cobrado antes nem se ele respondeu. Essa informação só existe hoje na aba
"Histórico", separada da Fila. Na prática, quem vai mandar uma cobrança manual (botão "Ver mensagem")
decide a abordagem sem saber se já mandou mensagem ontem, ou se o aluno já respondeu -- o que muda o
tom certo (retomar uma conversa em andamento é diferente de abrir um primeiro contato).

O sistema já rastreia exatamente essa informação: `cobranca_logs.enviado_em` (quando foi enviado) e
`cobranca_logs.respondeu_em` (preenchido pela edge function `evo-resposta` quando chega qualquer
mensagem do WhatsApp daquele telefone depois do envio). Essa mesma info já alimenta o badge roxo
"Respondeu" que existe hoje no card do Histórico (`AlunoHistoricoCard`, por volta da linha 412 de
`Cobranca.tsx`). Falta só expor isso também no card da Fila.

## Desenho

### Fonte dos dados

Novo `useMemo` em `Cobranca.tsx`, ao lado dos outros memos derivados de `logs` (não de
`filteredLogs`, que é filtrado pela busca da aba Histórico -- a Fila não deve depender desse filtro).

```ts
interface UltimoContato {
  ultimoEnvio: string; // ISO, enviado_em do log mais recente com status 'enviado'
  respondeu: boolean;  // true se QUALQUER log desse aluno tiver respondeu_em preenchido
}

const ultimoContatoPorAluno = useMemo<Map<string, UltimoContato>>(() => {
  const porAluno = new Map<string, CobrancaLog[]>();
  for (const log of logs) {
    if (log.status !== 'enviado' || !log.enviado_em) continue;
    const chave = log.aluno_id ?? log.telefone;
    if (!porAluno.has(chave)) porAluno.set(chave, []);
    porAluno.get(chave)!.push(log);
  }
  const resultado = new Map<string, UltimoContato>();
  for (const [chave, envios] of porAluno) {
    const ordenados = [...envios].sort((a, b) => new Date(b.enviado_em!).getTime() - new Date(a.enviado_em!).getTime());
    resultado.set(chave, {
      ultimoEnvio: ordenados[0].enviado_em!,
      respondeu: envios.some(l => !!l.respondeu_em),
    });
  }
  return resultado;
}, [logs]);
```

Chave de lookup: `grupo.aluno_id` (mesma chave usada em `historicoPorAluno`, com fallback pro
telefone só se `aluno_id` vier nulo -- já é o padrão usado no resto do arquivo).

Só conta logs com `status === 'enviado'` -- uma tentativa que deu erro não é "contato feito" pro
aluno.

### Mudança visual no `AlunoFilaCard`

O card recebe um novo prop opcional `ultimoContato?: UltimoContato`. Layout: um badge extra ao lado
do badge de urgência existente ("68d em atraso" / "Vence em 3d"):

- **Sem contato anterior** (`ultimoContato` undefined): nada muda -- card igual ao de hoje.
- **Com contato anterior, sem resposta**: badge neutro (mesmo estilo `variant="outline"` usado em
  outros badges secundários do card) com texto relativo:
  - Hoje: `Cobrado hoje, HH:MM`
  - Ontem: `Cobrado ontem, HH:MM`
  - Mais antigo: `Cobrado em DD/MM, HH:MM`
- **Com contato anterior E resposta**: o badge acima, mais o badge roxo que já existe no Histórico,
  reaproveitado tal qual: `<Badge className="bg-violet-50 text-violet-700 border border-violet-200 text-xs gap-1"><MessageSquare size={10}/>Respondeu</Badge>`.

Helper de formatação relativa (`fmtContatoRelativo(iso: string): string`) fica junto das outras
funções utilitárias do topo do arquivo (perto de `fmtDate`), comparando a data (fuso São Paulo, mesmo
padrão usado em `hojeSaoPaulo()`/`dataSaoPaulo()` já existentes no arquivo) com hoje/ontem.

### Casos de borda

- Aluno com várias parcelas e vários envios anteriores (ex.: mensagem de 3 dias antes + depois outra
  de 16+ dias) -- mostra só o envio mais recente, mesma lógica de `historicoPorAluno.ultimoEnvio`.
- `respondeu` é `true` se qualquer envio anterior (não só o mais recente) teve resposta -- mesma
  semântica de `respondeuAlguma` no Histórico.
- Não muda `alunoGruposElegiveis` nem a lógica de elegibilidade da fila (que foi corrigida
  recentemente) -- é puramente informativo, não afeta quem aparece nem em que ordem.

## Fora de escopo

- Prazo prometido pela IA de cobrança (`cobranca_ia_conversas.data_prometida`) -- discutido e adiado;
  pode virar um badge adicional depois se fizer falta.
- Mudar o texto/tom da mensagem automaticamente com base em já ter respondido -- só exibe o indicador,
  a decisão de abordagem continua manual.
- Mudanças na aba Histórico ou no modal "Ver mensagem" -- só o card da Fila.

## Teste

- Verificar visualmente no navegador: aluno nunca cobrado (card sem badge novo), aluno cobrado ontem
  sem resposta (badge "Cobrado ontem, HH:MM"), aluno cobrado com resposta (os dois badges).
- `npx tsc --noEmit` limpo.
