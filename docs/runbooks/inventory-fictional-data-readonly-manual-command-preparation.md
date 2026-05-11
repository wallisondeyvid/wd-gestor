# Preparacao de Comando Manual Read-Only

Status: preparacao documental

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
Este documento nao aprova comando em package.json.
Este documento nao autoriza push.

## Objetivo da Preparacao de Comando Manual

- preparar conceitualmente um comando manual futuro;
- deixar claro que nenhum comando sera criado agora;
- deixar claro que package.json nao sera alterado agora;
- separar preparacao de comando de execucao real;
- manter Mongo, Atlas, query, relatorio real e push bloqueados.

## Pre-condicoes Futuras Obrigatorias

- microcorte de execucao revisado;
- decisao Go/No-Go revisada;
- gate final de decisao humana revisado;
- prompt de decisao humana revisado;
- resumo da prontidao revisado;
- fechamento da prontidao revisado;
- revisao final pre-execucao revisada;
- aviso de autorizacao revisado;
- matriz de aprovacao revisada;
- checkpoint de decisao revisado;
- checklist revisado;
- runbook revisado;
- script revisado;
- branch correta;
- worktree limpa;
- dados ficticios confirmados;
- ausencia de dados reais confirmada;
- candidatos a descarte nao tratados como autorizacao de limpeza;
- Atlas decidido explicitamente;
- report path decidido explicitamente.

## Forma Permitida do Comando Futuro

- comando manual;
- fora de package.json neste momento;
- com flags explicitas;
- com confirmacao humana explicita;
- com ambiente e database target explicitos;
- sem segredo bruto no terminal;
- sem URI completa exposta;
- sem execucao automatica por npm script.

## Escopo Proibido

- criar comando em package.json agora;
- executar comando agora;
- conectar Mongo agora;
- rodar query agora;
- gerar relatorio real agora;
- usar fs.writeFile agora;
- reset;
- limpeza;
- seed;
- migration;
- backfill;
- criar unidade;
- criar usuario;
- usar Portal;
- usar PostgreSQL;
- push.

## Saidas Possiveis da Preparacao Futura

- READY_TO_DRAFT_MANUAL_COMMAND
- RETURN_TO_EXECUTION_MICROCUT_REVIEW
- RETURN_TO_GO_NO_GO_REVIEW
- BLOCK_MANUAL_COMMAND_PREPARATION

## Decisao Final

- esta preparacao e documental;
- nao cria comando;
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
- execucao futura exige microcorte proprio.