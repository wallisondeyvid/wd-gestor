# Runbook documental de protecao do usuario master real

## 1. Identificacao e proposito
- Este runbook protege o usuario master real wallisondeyvid13@gmail.com.
- Escopo apenas documental.
- Este runbook nao autoriza execucao operacional.
- Este runbook nao altera credenciais.
- Este runbook nao declara producao pronta.
- Push segue bloqueado ate o encerramento da 4a fase documental.

## 2. Estado atual e premissas
- wallisondeyvid13@gmail.com e usuario master real.
- O usuario master real e dado sensivel.
- Outros usuarios podem ser ficticios/controlados, mas o master real nao.
- Producao nao esta pronta.
- Mongo real esta bloqueado.
- Mongo em memoria manual esta bloqueado.
- Portal esta bloqueado.
- Dados reais estao bloqueados.
- master:set esta bloqueado.
- master:set:win esta bloqueado.
- seed/reset/cleanup/migration/backfill estao bloqueados.

## 3. Identidade protegida
- realMasterUserExists=true.
- realMasterUserEmail=wallisondeyvid13@gmail.com.
- masterCredentialSensitive=true.
- realMasterUserTouched=false.
- masterCredentialChanged=false.
- masterSetExecuted=false.
- currentOtherUsersTreatedAsFictional=true.
- futureUsersMayBeFictionalControlled=true.
- O usuario master real nunca entra no conjunto de usuarios ficticios.

## 4. Scripts proibidos por padrao
- master:set.
- master:set:win.
- start:mem:seed.
- Seeds que possam criar, alterar ou limpar usuario master.
- cleanupWrongEmail se puder tocar usuario real.
- reset.
- cleanup.
- migration.
- backfill.
- Qualquer script que toque credenciais, usuario real, vinculo global ou estado persistido real.

## 5. Riscos criticos

| Risco | Severidade | Motivo | Bloqueio atual | Pre-condicao futura |
| --- | --- | --- | --- | --- |
| Master real tratado como ficticio. | Critico | Pode levar a limpeza, recriacao ou mutacao indevida do usuario real. | Bloqueado documentalmente e proibido por regra explicita. | Microcorte proprio com confirmacao humana explicita e delimitacao nominal do alvo. |
| master:set executado sem autorizacao. | Critico | Pode alterar credenciais do usuario master real. | Script bloqueado nesta fase. | Autorizacao humana explicita e fase propria voltada a credenciais. |
| master:set:win executado sem autorizacao. | Critico | Pode alterar credenciais via superficie Windows equivalente. | Script bloqueado nesta fase. | Autorizacao humana explicita e fase propria voltada a credenciais. |
| Seed alterando usuario master. | Critico | Pode criar, sobrescrever ou normalizar indevidamente o usuario real. | Seeds bloqueados nesta fase. | Microcorte proprio com isolamento de dados e regra de exclusao explicita do master real. |
| cleanupWrongEmail tocando usuario real. | Critico | Pode remover ou corrigir indevidamente o email do master real. | cleanupWrongEmail bloqueado se puder tocar usuario real. | Confirmacao humana explicita e filtro verificavel que exclua o master real. |
| migration/backfill tocando usuario real. | Critico | Pode mutar estado persistido real fora de escopo seguro. | Migrations e backfills bloqueados nesta fase. | Plano proprio, evidencias de alvo e exclusao nominal do master real. |
| Exposicao de senha/token/URI/segredo. | Critico | Vaza credenciais ou acesso sensivel. | Exposicao proibida no ledger e no runbook. | Nenhuma; segredos devem continuar mascarados em qualquer fase. |
| Producao declarada pronta antes de fase propria. | Critico | Libera interpretacao operacional indevida fora da trilha documental. | Producao segue explicitamente nao pronta. | Fase propria de prontidao com criterios separados e autorizacao humana. |
| Fallback de sessao usado para justificar alteracao de master. | Alto | Mistura compatibilidade de sessao com autorizacao real de mutacao. | Fallback nao autoriza alteracao do master real. | Contexto explicito, microcorte proprio e justificativa humana. |
| Confusao entre usuarios ficticios e master real. | Alto | Faz scripts e processos de teste atingirem um usuario real sensivel. | Separacao documental explicita entre conjuntos. | Inventario nominal do alvo e exclusao do master real em qualquer rotina futura. |

## 6. Regras de manuseio
- Nao tocar usuario master real sem autorizacao humana explicita.
- Nao alterar credenciais.
- Nao expor senhas, tokens, URIs ou segredos.
- Nao usar fallback de sessao para justificar alteracao do master.
- Qualquer acao futura exige microcorte proprio.
- Qualquer acao futura exige escopo proprio.
- Qualquer acao futura exige confirmacao humana explicita.
- Qualquer acao futura deve comecar com validacao Git.
- Qualquer acao futura deve declarar ambiente, banco e risco antes de executar.
- Qualquer acao futura deve manter producao nao pronta ate fase propria.

## 7. Separacao entre usuarios ficticios e master real
- currentOtherUsersTreatedAsFictional=true.
- futureUsersMayBeFictionalControlled=true.
- Usuarios ficticios/controlados podem ser criados em fases proprias.
- O usuario master real wallisondeyvid13@gmail.com nunca deve ser tratado como ficticio.
- Scripts que limpam, recriam, resetam ou semeiam usuarios nao podem afetar o master real.
- Qualquer ambiguidade entre usuario ficticio e usuario master real deve parar o microcorte.

## 8. Dados, banco e ambiente
- Mongo real bloqueado.
- Mongo em memoria manual bloqueado.
- Dados reais bloqueados.
- Query real bloqueada.
- Backup real bloqueado.
- Restore real bloqueado.
- Rollback real bloqueado.
- Producao nao pronta.
- PostgreSQL fora do roadmap.
- MongoDB permanece como arquitetura atual.

## 9. Criterios de parada imediata
- Qualquer tentativa de master:set.
- Qualquer tentativa de master:set:win.
- Qualquer tentativa de seed que toque master.
- Qualquer tentativa de cleanupWrongEmail sobre usuario real.
- Qualquer tentativa de migration/backfill que toque usuario real.
- Qualquer exposicao de segredo.
- Qualquer duvida sobre ambiente.
- Qualquer tentativa de Mongo real.
- Qualquer tentativa de Mongo em memoria manual.
- Qualquer tentativa de declarar producao pronta.
- Qualquer tentativa de tratar master real como ficticio.
- Qualquer tentativa de Portal.
- Qualquer duvida sobre escopo.

## 10. Criterios de sucesso documental
- Runbook estruturado.
- Scripts sensiveis listados.
- Riscos classificados.
- Master real protegido.
- Credenciais preservadas.
- Producao segue nao pronta.
- Nenhuma execucao feita.
- Push segue bloqueado ate Fase 4.

## 11. Proximos passos
- Registrar materializacao do runbook no ledger.
- Revisar runbook em microcorte proprio.
- Decidir fechamento da Fase 3.
- Manter push bloqueado ate encerramento da Fase 4.
