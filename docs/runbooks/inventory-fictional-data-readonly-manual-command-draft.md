# Rascunho de Comando Manual Read-Only

Status: rascunho documental

Este documento nao autoriza execucao real neste microcorte.
Este documento nao substitui o runbook principal.
Este documento nao substitui o checklist de revisao.
Este documento nao substitui o checkpoint de decisao.
Este documento nao substitui a matriz de aprovacao.
Este documento nao substitui o aviso de autorizacao.
Este documento nao substitui a revisao final pre-execucao.
Este documento nao substitui o fechamento da prontidao.
Este documento nao substitui o resumo da prontidao.
Este documento nao substitui o prompt de decisao humana.
Este documento nao substitui o gate final de decisao humana.
Este documento nao substitui a decisao Go/No-Go.
Este documento nao substitui o microcorte de execucao.
Este documento nao substitui a preparacao de comando manual.
Este documento nao aprova comando em package.json.
Este documento nao autoriza push.
Este documento nao cria comando real por si so.

## Objetivo do Rascunho

- documentar conceitualmente como seria um comando manual futuro;
- deixar claro que nenhum comando real sera criado agora;
- deixar claro que package.json nao sera alterado;
- deixar claro que o comando nao sera executado;
- separar rascunho de comando de execucao real;
- manter Mongo, Atlas, query, relatorio real, fs.writeFile e push bloqueados.
- reforcar que o exemplo nao e copiavel nem executavel.

## Forma Conceitual do Comando Futuro

- comando manual futuro;
- fora de package.json;
- com flags explicitas;
- com confirmacao humana explicita;
- com ambiente explicito;
- com database target explicito;
- sem segredo bruto;
- sem URI completa exposta;
- sem npm script automatico;
- sem push automatico;
- sem reset, limpeza, seed, migration, backfill ou cleanup acoplado.

## Flags Conceituais Futuras

- WD_OPS_READONLY_CONFIRM=true
- WD_OPS_ENVIRONMENT_CONFIRM=true
- WD_OPS_DATABASE_CONFIRM=true
- WD_OPS_DATABASE_TARGET=<target-explicito>
- WD_OPS_ATLAS_TARGET=true somente se Atlas for alvo
- WD_OPS_ATLAS_EXPLICIT_APPROVAL=true somente se Atlas for alvo
- demais flags ainda dependem de microcorte proprio

## Exemplo Conceitual Nao Executavel

Exemplo nao executavel. Nao copiar, nao colar e nao executar.

```text
<node-bin> <script-path> \
  --environment <env-explicito> \
  --database-target <target-explicito> \
  --readonly-confirm true \
  --human-confirmation <confirmacao-humana> \
  --atlas-target <true-se-aplicavel> \
  --atlas-explicit-approval <true-se-aplicavel>
```

Regras deste exemplo:

- nao contem URI real;
- nao contem segredo real;
- nao contem comando npm;
- nao contem comando pronto para copiar e executar;
- usa apenas placeholders conceituais.
- variaveis e flags sao apenas ilustrativas.

## Bloqueios Obrigatorios

- nao criar comando agora;
- nao alterar package.json;
- nao executar comando agora;
- nao conectar Mongo agora;
- nao rodar query agora;
- nao gerar relatorio real agora;
- nao usar fs.writeFile agora;
- nao expor segredo bruto;
- nao expor URI completa;
- nao acoplar cleanup;
- nao acoplar reset;
- nao acoplar seed;
- nao acoplar migration;
- nao acoplar backfill;
- nao criar unidade;
- nao criar usuario;
- nao usar Portal;
- nao usar PostgreSQL;
- nao fazer push.
- nao tratar candidatos a descarte como autorizacao de limpeza.

## Saidas Possiveis

- READY_TO_REVIEW_MANUAL_COMMAND_DRAFT
- RETURN_TO_MANUAL_COMMAND_PREPARATION_REVIEW
- RETURN_TO_EXECUTION_MICROCUT_REVIEW
- BLOCK_MANUAL_COMMAND_DRAFT

## Decisao Final

- este rascunho e documental;
- nao cria comando real;
- nao libera execucao;
- nao aprova package.json;
- nao altera runbook;
- nao altera checklist;
- nao altera checkpoint;
- nao altera matriz;
- nao altera aviso;
- nao altera revisao final;
- nao altera fechamento;
- nao altera resumo;
- nao altera prompt;
- nao altera gate final;
- nao altera Go/No-Go;
- nao altera microcorte;
- nao altera preparacao;
- execucao futura exige microcorte proprio.