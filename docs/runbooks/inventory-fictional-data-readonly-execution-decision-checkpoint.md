# Checkpoint de Decisao de Execucao do Inventario Read-Only

Status: checkpoint documental

Este documento nao autoriza execucao real.
Este documento nao substitui o runbook principal.
Este documento nao substitui o checklist de revisao.
Este documento nao aprova comando em package.json.

## Referencias Documentais

- docs/runbooks/inventory-fictional-data-readonly.md
- docs/runbooks/inventory-fictional-data-readonly-review-checklist.md
- scripts/ops/inventory-fictional-data-readonly.js
- Estes arquivos sao apenas referencias neste microcorte e nao serao alterados aqui.

## Objetivo do Checkpoint

- Decidir futuramente se o inventario read-only sera executado, adiado, bloqueado ou devolvido para revisao.
- Impedir que documentacao seja confundida com autorizacao.
- Exigir decisao humana explicita.
- Manter gate fechado por padrao.
- Separar decisao de execucao de conexao, query, relatorio, limpeza e descarte.

## Entradas Obrigatorias para Decisao Futura

- Runbook revisado.
- Checklist revisado.
- Script revisado.
- Gate revisado.
- Branch correta.
- Worktree limpa.
- Confirmacao de dados ficticios.
- Confirmacao de ausencia de dados reais.
- Confirmacao de ambiente.
- Database target definido.
- Decisao explicita sobre Atlas.
- Decisao explicita sobre report path.
- Decisao explicita sobre nao alterar package.json.

## Saidas Possiveis do Checkpoint

- APPROVE_READONLY_INVENTORY_IN_FUTURE_MICROCUT
- DEFER_READONLY_INVENTORY
- BLOCK_READONLY_INVENTORY
- RETURN_TO_RUNBOOK_REVIEW
- RETURN_TO_SCRIPT_REVIEW

## Condicoes para Aprovacao Futura

- Todas as flags obrigatorias definidas.
- Gate validado.
- Runbook e checklist revisados.
- Script sem escrita.
- package.json sem comando novo, salvo microcorte proprio.
- Nenhum dado real.
- Nenhum Atlas sem aprovacao explicita.
- Nenhuma conexao, query e relatorio liberados juntos.
- Decisao humana explicita.

## Condicoes para Bloqueio

- Qualquer duvida sobre dados reais.
- package.json divergente.
- Comando nao revisado.
- Tentativa de reset, limpeza, seed, migration ou backfill.
- Tentativa de criar unidade ou usuario.
- Tentativa de conectar em Atlas sem aprovacao.
- Tentativa de usar Portal ou PostgreSQL.
- Tentativa de executar conexao, query e relatorio no mesmo microcorte.
- Worktree suja.
- Branch divergente.
- Report path nao aprovado.
- Qualquer tentativa de limpar candidatos a descarte.

## Criterios de Separacao

- Criar checkpoint nao aprova execucao.
- Revisar checkpoint nao aprova execucao.
- Criar checkpoint nao executa inventario.
- Aprovacao futura exigira microcorte proprio.
- Execucao futura exigira outro microcorte proprio.
- Geracao real de relatorio exigira autorizacao propria.
- Limpeza ou descarte sempre exigira fase ou microcorte separado.

## Decisao Final

- Este checkpoint e documental.
- Nao libera execucao.
- Nao aprova comando.
- Nao altera runbook.
- Nao altera checklist.
- Execucao futura exige microcorte proprio.
