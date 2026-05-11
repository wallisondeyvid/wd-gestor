# Checklist de Revisao do Rascunho de Comando Manual Read-Only

Status: checklist documental

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
Este documento nao substitui o rascunho de comando manual.
Este documento nao aprova comando em package.json.
Este documento nao autoriza push.

## Objetivo do Checklist

- revisar o rascunho antes de qualquer comando real;
- confirmar que o rascunho nao cria comando;
- confirmar que o rascunho nao altera package.json;
- confirmar que o exemplo e nao copiavel e nao executavel;
- confirmar que nao ha URI real, segredo real ou comando npm;
- confirmar que nao ha execucao real, query real, Mongo real ou relatorio real;
- manter push proibido.

## Checklist de Status e Limites

- [ ] Status permanece rascunho documental.
- [ ] Nao autoriza execucao real.
- [ ] Nao substitui runbook.
- [ ] Nao substitui checklist.
- [ ] Nao substitui checkpoint.
- [ ] Nao substitui matriz.
- [ ] Nao substitui aviso.
- [ ] Nao substitui revisao final.
- [ ] Nao substitui fechamento.
- [ ] Nao substitui resumo.
- [ ] Nao substitui prompt.
- [ ] Nao substitui gate final.
- [ ] Nao substitui Go/No-Go.
- [ ] Nao substitui microcorte.
- [ ] Nao substitui preparacao de comando.
- [ ] Nao aprova package.json.
- [ ] Nao autoriza push.
- [ ] Nao cria comando real por si so.

## Checklist do Exemplo Conceitual

- [ ] Esta marcado como nao executavel.
- [ ] Contem "nao copiar, nao colar e nao executar".
- [ ] Usa apenas placeholders.
- [ ] Nao contem URI real.
- [ ] Nao contem segredo real.
- [ ] Nao contem comando npm.
- [ ] Nao contem comando pronto para copiar e executar.
- [ ] Variaveis e flags sao apenas ilustrativas.

## Checklist das Flags Futuras

- [ ] WD_OPS_READONLY_CONFIRM=true
- [ ] WD_OPS_ENVIRONMENT_CONFIRM=true
- [ ] WD_OPS_DATABASE_CONFIRM=true
- [ ] WD_OPS_DATABASE_TARGET=<target-explicito>
- [ ] WD_OPS_ATLAS_TARGET=true somente se Atlas for alvo
- [ ] WD_OPS_ATLAS_EXPLICIT_APPROVAL=true somente se Atlas for alvo
- [ ] Demais flags ainda dependem de microcorte proprio.

## Checklist de Bloqueios Obrigatorios

- [ ] Nao criar comando agora.
- [ ] Nao alterar package.json.
- [ ] Nao executar comando agora.
- [ ] Nao conectar Mongo agora.
- [ ] Nao rodar query agora.
- [ ] Nao gerar relatorio real agora.
- [ ] Nao usar fs.writeFile agora.
- [ ] Nao expor segredo bruto.
- [ ] Nao expor URI completa.
- [ ] Nao acoplar cleanup.
- [ ] Nao acoplar reset.
- [ ] Nao acoplar seed.
- [ ] Nao acoplar migration.
- [ ] Nao acoplar backfill.
- [ ] Nao criar unidade.
- [ ] Nao criar usuario.
- [ ] Nao usar Portal.
- [ ] Nao usar PostgreSQL.
- [ ] Nao fazer push.
- [ ] Nao tratar candidatos a descarte como autorizacao de limpeza.

## Saidas Possiveis

- READY_TO_REVIEW_MANUAL_COMMAND_REVIEW_CHECKLIST
- RETURN_TO_MANUAL_COMMAND_DRAFT_REVIEW
- RETURN_TO_MANUAL_COMMAND_PREPARATION_REVIEW
- BLOCK_MANUAL_COMMAND_CHECKLIST

## Decisao Final

- este checklist e documental;
- nao cria comando real;
- nao libera execucao;
- nao aprova package.json;
- nao altera runbook;
- nao altera checklist original;
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
- nao altera rascunho;
- execucao futura exige microcorte proprio.