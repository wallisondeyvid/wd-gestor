# Matriz de Aprovacao de Execucao Read-Only

Status: matriz documental

Este documento nao autoriza execucao real.
Este documento nao substitui o runbook principal.
Este documento nao substitui o checklist de revisao.
Este documento nao substitui o checkpoint de decisao.
Este documento nao aprova comando em package.json.
Este documento nao e autorizacao humana de execucao.

## Referencias Documentais

- docs/runbooks/inventory-fictional-data-readonly.md
- docs/runbooks/inventory-fictional-data-readonly-review-checklist.md
- docs/runbooks/inventory-fictional-data-readonly-execution-decision-checkpoint.md
- scripts/ops/inventory-fictional-data-readonly.js
- Estes arquivos sao apenas referencias neste microcorte e nao serao alterados aqui.

## Objetivo da Matriz

- Organizar criterios de aprovacao, adiamento, bloqueio e retorno para revisao.
- Impedir que checkpoint revisado seja confundido com autorizacao.
- Separar decisao humana de execucao tecnica.
- Manter execucao bloqueada por padrao.

## Estados Possiveis

- APPROVED_FOR_FUTURE_MICROCUT
- DEFERRED
- BLOCKED
- RETURN_TO_RUNBOOK_REVIEW
- RETURN_TO_SCRIPT_REVIEW
- RETURN_TO_GATE_REVIEW

## Criterios para APPROVED_FOR_FUTURE_MICROCUT

- Runbook revisado.
- Checklist revisado.
- Checkpoint revisado.
- Script revisado.
- Gate revisado.
- Worktree limpa.
- Branch correta.
- Dados ficticios confirmados.
- Ausencia de dados reais confirmada.
- Flags futuras definidas.
- Database target aprovado.
- Atlas decidido explicitamente.
- Report path aprovado.
- package.json sem comando novo, salvo microcorte proprio.
- Decisao humana explicita.
- Aprovacao futura nao executa inventario automaticamente.
- Aprovacao futura apenas permite planejar microcorte proprio de execucao.
- Execucao futura ainda exige gate validado no proprio microcorte.
- Nenhum descarte ou limpeza e autorizado por este estado.

## Criterios para DEFERRED

- Decisao humana nao tomada.
- Ambiente ainda nao escolhido.
- Report path pendente.
- Atlas pendente.
- Necessidade de nova revisao documental.
- Preferencia por nao executar ainda.
- Preferir DEFERRED quando houver incerteza.
- DEFERRED nao e falha.
- DEFERRED preserva todos os bloqueios.

## Criterios para BLOCKED

- Qualquer risco de dados reais.
- Worktree suja.
- Branch divergente.
- Tentativa de escrita.
- Tentativa de reset, limpeza, seed, migration ou backfill.
- Tentativa de usar Portal ou PostgreSQL.
- Tentativa de conectar em Atlas sem aprovacao.
- Tentativa de alterar package.json.
- Tentativa de liberar conexao, query e relatorio no mesmo microcorte.
- Tentativa de limpar candidatos a descarte.
- Qualquer tentativa de esconder escrita acidental.

## Criterios para RETURN_TO_RUNBOOK_REVIEW

- Runbook ambiguo.
- Runbook parecendo autorizar execucao.
- Runbook sem bloqueios suficientes.
- Runbook sem criterios de parada.
- Runbook sem pos-checagem.
- RETURN_TO_RUNBOOK_REVIEW quando a documentacao operacional estiver ambigua.

## Criterios para RETURN_TO_SCRIPT_REVIEW

- Script com ambiguidade de execucao.
- Script expondo preview indevido.
- Script sugerindo conexao ativa.
- Script com helper que pareca executar query.
- Script com risco de escrita.
- RETURN_TO_SCRIPT_REVIEW quando o script parecer executavel ou ambiguo.

## Criterios para RETURN_TO_GATE_REVIEW

- Gate nao fechado por padrao.
- executionApproved ambiguo.
- validateExecutionGate.ok com semantica ambigua.
- Gate permitindo conexao, query e relatorio juntos.
- Gate nao bloqueando risco de escrita.
- RETURN_TO_GATE_REVIEW quando o gate nao estiver claramente fechado por padrao.
- Retorno para revisao nao e autorizacao de execucao.

## Decisao Final

- Esta matriz e documental.
- Nao libera execucao.
- Nao aprova comando.
- Nao altera runbook.
- Nao altera checklist.
- Nao altera checkpoint.
- Execucao futura exige microcorte proprio.
