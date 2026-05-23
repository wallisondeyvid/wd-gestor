# Matriz de autorizacao operacional controlada

## 1. Identificacao e proposito
- Esta matriz organiza acoes operacionais futuras possiveis no WD Gestor.
- O escopo e apenas documental.
- Esta matriz nao autoriza execucao por si so.
- Nenhuma acao operacional pode rodar automaticamente.
- Toda acao operacional futura exige microcorte proprio e autorizacao humana explicita.
- Producao nao esta pronta.
- O usuario master real wallisondeyvid13@gmail.com permanece protegido.

## 2. Estado atual
- MongoDB permanece como arquitetura atual.
- PostgreSQL esta fora do roadmap.
- O bloco das quatro fases documentais foi publicado em 658cb5a.
- O bloco controlledOperationalAuthorizationMatrix esta aberto.
- Esta matriz serve como ponte entre documentacao e execucao futura.
- Nenhuma execucao operacional esta autorizada neste documento.

## 3. Regras gerais
- Se houver duvida de escopo, parar.
- Se houver risco de tocar dados reais, parar.
- Se houver risco de tocar o usuario master real, parar.
- Se houver risco de expor senha, token, URI ou segredo, parar.
- Se houver tentativa de declarar producao pronta, parar.
- Se houver tentativa de executar comando sem autorizacao explicita, parar.
- Se houver tentativa de usar Mongo real sem fase propria, parar.
- Se houver tentativa de usar Portal sem fase propria, parar.

## 4. Matriz de autorizacao

| Acao futura | Risco | Pre-condicao minima | Quem autoriza | Pode rodar agora? | Observacao/bloqueio |
|---|---|---|---|---|---|
| boot local controlado | medio | revisar runbook de boot, env e alvo de banco | usuario | nao | exige microcorte proprio |
| iniciar servidor | alto | definir ambiente, alvo Mongo e rollback | usuario | nao | bloqueado |
| Mongo em memoria isolado | medio | escopo isolado e sem seed sensivel | usuario | nao | exige microcorte proprio |
| Mongo real local | critico | backup, rollback, alvo confirmado e autorizacao explicita | usuario | nao | bloqueado |
| Mongo Atlas | critico | backup, rollback, URI validada sem exposicao e autorizacao explicita | usuario | nao | bloqueado |
| npm test | medio | confirmar escopo e ambiente | usuario | nao | bloqueado por padrao |
| npm scripts genericos | variavel | classificar script antes | usuario | nao | bloqueado por padrao |
| guardrails | medio | listar guardrail e efeito esperado | usuario | nao | bloqueado por padrao |
| master:set | critico | fase propria, autorizacao explicita, plano rollback | usuario | nao | bloqueado |
| master:set:win | critico | fase propria, autorizacao explicita, plano rollback | usuario | nao | bloqueado |
| seed/reset/cleanup/migration/backfill | critico | fase propria, backup e rollback | usuario | nao | bloqueado |
| Portal | alto | fase propria e escopo definido | usuario | nao | bloqueado |
| query real | critico | alvo, backup, escopo e autorizacao explicita | usuario | nao | bloqueado |
| uso de dados reais | critico | fase propria, autorizacao explicita e protecao do master | usuario | nao | bloqueado |
| declarar producao pronta | critico | fase propria de prontidao real | usuario | nao | bloqueado |
| push futuro | medio | working tree limpa, log revisado e autorizacao humana | usuario | nao | so humano |
| backup/restore | alto | plano detalhado e alvo confirmado | usuario | nao | bloqueado |
| rollback | alto | plano validado e alvo confirmado | usuario | nao | bloqueado |

## 5. Categorias cobertas
- Boot e servidor.
- Mongo e banco de dados.
- Scripts npm e testes.
- Guardrails e validacoes.
- Usuario master real.
- Seeds, reset, cleanup, migration e backfill.
- Portal.
- Dados reais.
- Producao.
- Git, push, backup e rollback.

## 6. Estado do usuario master real
- realMasterUserExists=true.
- realMasterUserEmail=wallisondeyvid13@gmail.com.
- masterCredentialSensitive=true.
- realMasterUserTouched=false.
- masterCredentialChanged=false.
- masterSetExecuted=false.
- O usuario master real nao pode ser tratado como ficticio.

## 7. Criterios de parada imediata
- Qualquer comando operacional sem microcorte proprio.
- Qualquer tentativa de Mongo real.
- Qualquer tentativa de Mongo em memoria manual sem escopo isolado.
- Qualquer tentativa de master:set ou master:set:win.
- Qualquer tentativa de seed/reset/cleanup/migration/backfill.
- Qualquer tentativa de Portal.
- Qualquer tentativa de query real.
- Qualquer tentativa de uso de dados reais.
- Qualquer tentativa de declarar producao pronta.
- Qualquer tentativa de expor senha, token, URI ou segredo.
- Qualquer tentativa de tratar o usuario master real como ficticio.

## 8. Criterios de sucesso documental
- Matriz materializada.
- Acoes futuras listadas.
- Riscos classificados.
- Pre-condicoes minimas registradas.
- Responsavel por autorizacao registrado.
- Nenhuma acao marcada como executavel agora.
- Usuario master real protegido.
- Producao nao pronta.
- Nenhuma execucao feita.

## 9. Proximos passos
- Revisar esta matriz em microcorte proprio.
- Decidir fechamento do bloco da matriz em microcorte proprio.
- Fechar o bloco da matriz em microcorte proprio.
- Somente depois discutir se alguma validacao operacional futura sera autorizada.
