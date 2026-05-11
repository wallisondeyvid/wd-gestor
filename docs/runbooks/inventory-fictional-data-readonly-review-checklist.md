# Checklist de Revisao do Runbook do Inventario Read-Only

Status: checklist documental

Este documento nao autoriza execucao real.
Este documento nao substitui o runbook principal.
Este documento nao aprova comando em package.json.

## Referencia ao Runbook Revisado

- docs/runbooks/inventory-fictional-data-readonly.md
- O runbook principal nao sera alterado neste microcorte.
- Este checklist revisa criterios e bloqueios; nao executa operacao.

## Checklist de Status e Escopo

- [ ] O runbook permanece como rascunho documental.
- [ ] O runbook nao aprova comando em package.json.
- [ ] O runbook nao autoriza execucao real.
- [ ] O escopo permanece limitado a dados ficticios.
- [ ] Dados reais permanecem proibidos.
- [ ] Criacao de unidade ou usuario permanece proibida.
- [ ] Candidatos a descarte nao autorizam limpeza.
- [ ] Inventario read-only permanece separado de reset ou limpeza.

## Checklist de Pre-condicoes

- [ ] Worktree limpa.
- [ ] Branch correta.
- [ ] Backup ou snapshot previsto para ambiente persistente.
- [ ] Confirmacao de dados ficticios.
- [ ] Confirmacao de ausencia de dados reais.
- [ ] Autorizacao humana explicita.
- [ ] Flags obrigatorias previstas.
- [ ] Gate aprovado em microcorte proprio.
- [ ] Script revisado.
- [ ] Report path aprovado.
- [ ] package.json sem comando aprovado, salvo microcorte futuro.

## Checklist de Flags Futuras

- [ ] WD_OPS_READONLY_CONFIRM=true
- [ ] WD_OPS_ENVIRONMENT_CONFIRM=true
- [ ] WD_OPS_DATABASE_CONFIRM=true
- [ ] WD_OPS_DATABASE_TARGET definido
- [ ] WD_OPS_ATLAS_TARGET=true somente se Atlas for alvo
- [ ] WD_OPS_ATLAS_EXPLICIT_APPROVAL=true somente se Atlas for alvo

## Checklist do Gate de Execucao

- [ ] Fechado por padrao.
- [ ] executionApproved=false ate microcorte proprio.
- [ ] validateExecutionGate.ok=false intencional na fase declarativa.
- [ ] Conexao, query e relatorio nao podem ser liberados juntos.
- [ ] Qualquer risco de escrita bloqueia.
- [ ] Atlas sem aprovacao explicita bloqueia.
- [ ] Gate aprovado no futuro nao autoriza limpeza, reset, seed, migration ou backfill.

## Checklist de Itens Proibidos

- [ ] reset
- [ ] limpeza
- [ ] seed
- [ ] migration
- [ ] backfill
- [ ] Portal
- [ ] PostgreSQL
- [ ] criacao de unidade
- [ ] criacao de usuario
- [ ] alteracao de package.json
- [ ] delete, update, save, drop ou bulkWrite
- [ ] aggregate com $out ou $merge
- [ ] qualquer comando que escreva no banco
- [ ] qualquer comando que use dados reais
- [ ] qualquer cleanup corretivo sem microcorte proprio

## Checklist da Saida Esperada Futura

- [ ] Relatorio local futuro.
- [ ] Contagens.
- [ ] Amostras mascaradas.
- [ ] Orfaos.
- [ ] Duplicidades.
- [ ] Candidatos a descarte.
- [ ] Pendencias humanas.
- [ ] Declaracao de ausencia de alteracao no banco.
- [ ] Declaracao de gate aprovado antes da execucao.
- [ ] Declaracao de que candidatos a descarte nao autorizam limpeza.
- [ ] Declaracao de que a execucao foi read-only.

## Checklist de Pos-checagem Futura

- [ ] Status git.
- [ ] Confirmacao de ausencia de escrita.
- [ ] Confirmacao de relatorio gerado somente quando autorizado.
- [ ] Registro do resultado no ledger.
- [ ] Confirmacao de que nao houve reset, seed, migration ou backfill.
- [ ] Confirmacao de que nao houve alteracao em package.json.

## Checklist de Criterios de Parada

- [ ] Ambiente divergente.
- [ ] Dados reais detectados.
- [ ] Flag ausente.
- [ ] Atlas sem aprovacao.
- [ ] Operacao de escrita detectada.
- [ ] Path de relatorio nao aprovado.
- [ ] Worktree suja.
- [ ] package.json divergente.
- [ ] Comando nao revisado.
- [ ] Tentativa de liberar conexao, query e relatorio no mesmo microcorte.

## Checklist de Rollback ou Reversao

- [ ] Rollback de banco nao deveria ser necessario por ser read-only.
- [ ] Se escrita for detectada, parar.
- [ ] Registrar incidente.
- [ ] Restaurar snapshot ou backup se aplicavel.
- [ ] Nao corrigir automaticamente.
- [ ] Nao tentar cleanup corretivo sem microcorte proprio.
- [ ] Nao tentar esconder ou normalizar escrita acidental.

## Decisao Final do Checklist

- [ ] Checklist e documental.
- [ ] Nao libera execucao.
- [ ] Nao aprova comando.
- [ ] Nao altera o runbook principal.
- [ ] Execucao futura exige microcorte proprio.
