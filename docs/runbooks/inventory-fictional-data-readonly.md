# Runbook: Inventario Read-Only dos Dados Ficticios do WD Gestor

Status: rascunho documental

Este documento nao autoriza execucao real.
Este documento nao aprova comando em package.json.

## Escopo

- Inventariar dados ficticios do WD Gestor.
- Produzir relatorio local futuro.
- Nao alterar banco.
- Nao limpar dados.
- Nao criar unidade ou usuario.
- Nao usar dados reais.
- Separar inventario read-only de reset ou limpeza.

## Pre-condicoes

- Worktree limpa.
- Branch correta.
- Backup ou snapshot se o ambiente for persistente.
- Confirmacao de dados ficticios.
- Ausencia de dados reais.
- Autorizacao humana explicita.
- Flags obrigatorias.
- Gate aprovado em microcorte proprio.
- Script revisado.
- Report path aprovado.
- package.json sem comando aprovado, salvo microcorte futuro.

## Flags Futuras

- WD_OPS_READONLY_CONFIRM=true
- WD_OPS_ENVIRONMENT_CONFIRM=true
- WD_OPS_DATABASE_CONFIRM=true
- WD_OPS_DATABASE_TARGET definido
- WD_OPS_ATLAS_TARGET=true somente se Atlas for alvo
- WD_OPS_ATLAS_EXPLICIT_APPROVAL=true somente se Atlas for alvo

## Gate de Execucao

- Fechado por padrao.
- executionApproved=false ate microcorte proprio.
- Conexao, query e relatorio nao podem ser liberados juntos.
- Qualquer risco de escrita bloqueia.
- Atlas sem aprovacao explicita bloqueia.
- validateExecutionGate.ok=false e intencional na fase declarativa.

## Itens Proibidos

- reset
- limpeza
- seed
- migration
- backfill
- Portal
- PostgreSQL
- criacao de unidade
- criacao de usuario
- alteracao de package.json
- delete, update, save, drop ou bulkWrite
- aggregate com $out ou $merge
- qualquer comando que escreva no banco
- qualquer comando que use dados reais

## Comando Futuro

Placeholder apenas.

Nenhum comando executavel real fica aprovado neste rascunho.

package.json nao possui comando aprovado para esta execucao.

Execucao futura exige microcorte proprio.

## Saida Esperada Futura

- Relatorio local.
- Contagens.
- Amostras mascaradas.
- Orfaos.
- Duplicidades.
- Candidatos a descarte.
- Pendencias humanas.
- Declaracao de que nenhuma alteracao foi feita.
- Declaracao de que o gate foi aprovado antes da execucao.
- Declaracao de que candidatos a descarte nao sao autorizacao de limpeza.

## Pos-checagem Futura

- Status git.
- Confirmacao de ausencia de escrita.
- Confirmacao de relatorio gerado somente quando autorizado.
- Registro do resultado no ledger.
- Confirmacao de que nao houve reset, seed, migration ou backfill.

## Criterios de Parada

- Ambiente divergente.
- Dados reais detectados.
- Flag ausente.
- Atlas sem aprovacao.
- Operacao de escrita detectada.
- Path de relatorio nao aprovado.
- Worktree suja.
- package.json divergente.
- comando nao revisado.

## Rollback ou Reversao

Como o fluxo futuro e read-only, rollback de banco nao deveria ser necessario.

Se qualquer escrita for detectada:

- parar imediatamente;
- registrar incidente;
- restaurar snapshot ou backup, se aplicavel;
- nao corrigir automaticamente.

Nao tentar cleanup corretivo sem microcorte proprio.

## Decisao Final

- Este runbook e rascunho.
- Nao libera execucao.
- Execucao futura exige microcorte proprio.
