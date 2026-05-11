# Prompt de Decisao Humana Read-Only

Status: prompt documental

Este documento nao autoriza execucao real neste microcorte.
Este documento nao substitui o runbook principal.
Este documento nao substitui o checklist de revisao.
Este documento nao substitui o checkpoint de decisao.
Este documento nao substitui a matriz de aprovacao.
Este documento nao substitui o aviso de autorizacao.
Este documento nao substitui a revisao final pre-execucao.
Este documento nao substitui o fechamento da prontidao.
Este documento nao substitui o resumo da prontidao.
Este documento nao aprova comando em package.json.
Este documento nao e autorizacao humana final.
Este documento nao autoriza push.

## Objetivo

- transformar a cadeia documental em uma pergunta humana clara;
- separar decisao humana de execucao real;
- impedir que documentacao seja confundida com autorizacao;
- deixar claro que aprovar decisao futura nao executa nada por si so;
- preparar um microcorte futuro de decisao, nao de execucao.
- separar decisao futura de execucao futura.

## Pergunta Humana Futura Proposta

- "Voce autoriza abrir um microcorte futuro e separado para preparar a execucao read-only do inventario dos dados ficticios, sem reset, sem limpeza, sem seed, sem migration, sem backfill, sem criacao de unidade, sem criacao de usuario, sem dados reais, sem package.json automatico e sem push?"

## Respostas Humanas Possiveis

- APPROVE_FUTURE_READONLY_EXECUTION_MICROCUT
- DEFER_READONLY_EXECUTION
- RETURN_TO_DOCUMENT_REVIEW
- BLOCK_READONLY_EXECUTION

## Efeitos de Cada Resposta

- APPROVE_FUTURE_READONLY_EXECUTION_MICROCUT:
	- nao executa inventario imediatamente;
	- apenas permite desenhar um microcorte futuro de execucao;
	- ainda exige validacoes de branch, worktree, ambiente, dados ficticios, ausencia de dados reais e gate.
- DEFER_READONLY_EXECUTION:
	- mantem tudo documentado;
	- nao altera script;
	- nao executa nada.
- RETURN_TO_DOCUMENT_REVIEW:
	- volta para revisar documentos;
	- nao executa nada.
- BLOCK_READONLY_EXECUTION:
	- bloqueia a frente de execucao;
	- mantem apenas os artefatos documentais.

## Condicoes que a Pergunta Nao Autoriza

- nao autoriza execucao imediata;
- nao autoriza Mongo real;
- nao autoriza Atlas sem aprovacao explicita;
- nao autoriza query real;
- nao autoriza relatorio real;
- nao autoriza package.json;
- nao autoriza limpeza;
- nao autoriza reset;
- nao autoriza seed;
- nao autoriza migration;
- nao autoriza backfill;
- nao autoriza criacao de unidade;
- nao autoriza criacao de usuario;
- nao autoriza push.
- nao autoriza tratar candidatos a descarte como autorizacao de limpeza.

## Decisao Final

- este prompt e documental;
- nao libera execucao;
- nao aprova comando;
- nao altera runbook;
- nao altera checklist;
- nao altera checkpoint;
- nao altera matriz;
- nao altera aviso;
- nao altera revisao final;
- nao altera fechamento;
- nao altera resumo;
- execucao futura exige microcorte proprio.
