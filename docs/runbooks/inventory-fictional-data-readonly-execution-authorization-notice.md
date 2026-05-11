# Aviso de Autorizacao de Execucao Read-Only

Status: aviso documental

Este documento nao autoriza execucao real neste microcorte.
Este documento nao substitui o runbook principal.
Este documento nao substitui o checklist de revisao.
Este documento nao substitui o checkpoint de decisao.
Este documento nao substitui a matriz de aprovacao.
Este documento nao aprova comando em package.json.
Este documento nao e autorizacao operacional por si so.

## Referencias Documentais

- docs/runbooks/inventory-fictional-data-readonly.md
- docs/runbooks/inventory-fictional-data-readonly-review-checklist.md
- docs/runbooks/inventory-fictional-data-readonly-execution-decision-checkpoint.md
- docs/runbooks/inventory-fictional-data-readonly-execution-approval-matrix.md
- scripts/ops/inventory-fictional-data-readonly.js
- Estes arquivos sao apenas referencias neste microcorte e nao serao alterados aqui.

## Objetivo do Aviso

- Impedir confusao entre aprovacao documental e autorizacao operacional.
- Deixar claro que nenhuma documentacao anterior executa inventario.
- Exigir autorizacao humana explicita em microcorte futuro.
- Reforcar que execucao, conexao, query e relatorio real continuam bloqueados.

## Conteudo Obrigatorio Futuro do Aviso

- Ambiente identificado.
- Branch correta confirmada.
- Worktree limpa confirmada.
- Dados ficticios confirmados.
- Ausencia de dados reais confirmada.
- Confirmacao de gate validado.
- Confirmacao de matriz consultada.
- Confirmacao de runbook, checklist e checkpoint revisados.
- Confirmacao de package.json sem comando novo, salvo microcorte proprio.
- Confirmacao de que candidatos a descarte nao autorizam limpeza.

## Frase Obrigatoria Futura

- "Autorizo apenas a execucao read-only do inventario, sem escrita, sem limpeza, sem reset, sem seed, sem migration, sem backfill, sem criacao de unidade, sem criacao de usuario e sem uso de dados reais."

## Bloqueios Permanentes

- Nao autoriza escrita.
- Nao autoriza reset.
- Nao autoriza limpeza.
- Nao autoriza seed.
- Nao autoriza migration.
- Nao autoriza backfill.
- Nao autoriza criacao de unidade.
- Nao autoriza criacao de usuario.
- Nao autoriza uso de dados reais.
- Nao autoriza Atlas sem aprovacao explicita.
- Nao autoriza Portal.
- Nao autoriza PostgreSQL.
- Nao autoriza alteracao de package.json.
- Nao autoriza conexao, query e relatorio juntos.
- Nao autoriza limpeza de candidatos a descarte.

## Criterios para Considerar o Aviso Insuficiente

- Frase incompleta.
- Ambiente nao identificado.
- Duvida sobre dados reais.
- Duvida sobre Atlas.
- package.json divergente.
- Worktree suja.
- Branch divergente.
- Tentativa de incluir limpeza ou descarte.
- Tentativa de executar mais de uma camada no mesmo microcorte.
- Tentativa de relativizar escrita acidental.

## Decisao Final

- Este aviso e documental.
- Nao libera execucao.
- Nao aprova comando.
- Nao altera runbook.
- Nao altera checklist.
- Nao altera checkpoint.
- Nao altera matriz.
- Execucao futura exige microcorte proprio.
