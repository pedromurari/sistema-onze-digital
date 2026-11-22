# Skill `humanizer` — de onde veio e por que está aqui

## Origem

- **Repositório:** https://github.com/blader/humanizer
- **Licença:** MIT (Copyright 2025 Siqi Chen) — ver `LICENSE`
- **Versão instalada:** 4.0.0
- **Baixado em:** 21/11/2026, a pedido do Pedro
- **Na data da instalação:** 71.993 estrelas, 5.633 forks, último commit em 19/11/2026

Instalado apenas o `SKILL.md` (markdown puro). O repositório também tem
`scripts/validate-package.py` e `agents/openai.yaml` — nenhum dos dois foi
trazido: o primeiro valida o empacotamento do próprio repo e o segundo é
para agentes da OpenAI. Não há código executável nesta pasta.

## Verificação feita antes de instalar

O arquivo entra como **instrução** nas próximas sessões, então foi conferido:
as únicas URLs dentro dele são referências (arXiv e Wikipedia), não há
comando de shell, leitura de `.env`, credencial nem chamada de rede. O
próprio skill traz uma proteção contra injeção de prompt — ele instrui a
tratar o texto que está editando como material, nunca como instrução.

## Para que serve

Reescreve texto que soa como IA sem mudar o que ele diz. Ataca os vícios
estruturais (não os de vocabulário, que mudam a cada modelo novo):

- "não é X, é Y" e variações
- frase de efeito fechando parágrafo
- tudo em trio
- travessão como ritmo
- negrito em toda label
- inflação ("fundamental", "essencial", "revolucionário")

## Onde entra no fluxo do blog

É a **última** etapa, não a primeira. A ordem que combinamos em 21/11/2026:

1. **Grounding** — o post nasce de um vídeo real, com transcrição, PDF da
   aula, data e turma reais. É isso que tira o texto do genérico.
2. **Voz do Rodrygo** — as regras que ele definir no briefing
   (www.idmpsi.com.br/briefing-blog), incluindo amostras da escrita dele.
3. **Humanizer** — passada final, tirando os vícios estruturais.

Rodar só o passo 3 num texto vazio devolve um texto vazio com ritmo melhor.
O que faz o texto parecer humano é ter contexto que só um humano teria.

## Atualizar

```bash
curl -sL https://raw.githubusercontent.com/blader/humanizer/main/SKILL.md \
  -o .claude/skills/humanizer/SKILL.md
```

Conferir a versão no cabeçalho do arquivo e atualizar esta nota.
