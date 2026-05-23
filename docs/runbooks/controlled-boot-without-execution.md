# Runbook documental de boot controlado sem execucao

## 1. Proposito
- Este runbook orienta uma futura decisao de boot controlado.
- Este runbook nao autoriza execucao.
- Producao nao esta pronta.

## 2. Estado atual
- MongoDB permanece arquitetura atual.
- PostgreSQL esta fora do roadmap.
- A fase atual e documental.
- A execucao operacional nao esta autorizada.
- O push da Fase 1 so ocorre no encerramento e publicacao final da fase.

## 3. Pre-condicoes obrigatorias para qualquer futuro boot
- branch correta.
- HEAD esperado.
- working tree limpa.
- escopo definido.
- autorizacao humana explicita.
- nenhum segredo, token ou URI exposto.
- usuario master real protegido.
- producao ainda nao pronta ate fase propria.

## 4. Comandos proibidos por padrao
- npm run start
- npm run dev
- npm run start:gestor
- npm run start:mem
- npm run start:mem:seed
- npm run start:atlas
- npm run master:set
- npm run master:set:win
- seeds
- migrations
- backfills
- guardrails e testes manuais fora de microcorte proprio

## 5. Comandos futuros candidatos
- Nenhum comando e autorizado agora.
- Qualquer comando futuro exigira microcorte proprio.
- Qualquer comando futuro exigira plano de parada.
- Qualquer comando futuro exigira logs esperados.
- Qualquer comando futuro exigira autorizacao humana explicita.

## 6. Variaveis sensiveis e bloqueios
- MONGO_URI
- MONGODB_URI
- MONGO_MEMORY
- GESTOR_SEEDS
- SEEDS
- MASTER_EMAIL
- MASTER_PASSWORD
- SESSION_SECRET
- SESSION_STORE
- variaveis de timeout e pool Mongo
- qualquer segredo, token ou URI

## 7. Mongo real
- Bloqueado por padrao.
- Risco critico.
- Nao usar Atlas.
- Nao usar MONGO_URI e MONGODB_URI.
- Nao usar MongoStore real.
- Nao executar connectMongo real.

## 8. Mongo em memoria
- Bloqueado para execucao manual.
- Risco alto.
- start:mem e test:mem nao autorizados.
- start:mem:seed e critico por combinar memoria e seed.

## 9. Seeds, master:set e usuario master real
- GESTOR_SEEDS e SEEDS bloqueados.
- runGestorSeeds bloqueado.
- ensureMasterUser bloqueado.
- cleanupWrongEmail bloqueado.
- master:set bloqueado.
- wallisondeyvid13@gmail.com e usuario real, sensivel e intocavel.

## 10. Portal e dados reais
- Portal bloqueado.
- Dados reais bloqueados.
- Backup, restore e rollback real bloqueados.
- Nenhuma query real.
- Nenhuma mutacao real.

## 11. Logs esperados em futura execucao autorizada
- Logs devem ser definidos antes de qualquer execucao.
- Logs nao devem expor segredo.
- Logs devem indicar se houve tentativa de Mongo.
- Logs devem indicar se servidor foi ou nao iniciado.
- Logs devem indicar ponto de parada.

## 12. Criterios de parada imediata
- Qualquer tentativa de Mongo real.
- Qualquer tentativa de Mongo em memoria sem autorizacao.
- Qualquer tentativa de master:set.
- Qualquer seed.
- Qualquer uso de Portal.
- Qualquer segredo exposto.
- Qualquer working tree suja.
- Qualquer duvida sobre escopo.

## 13. Criterios de sucesso documental
- Runbook criado.
- Riscos listados.
- Comandos proibidos listados.
- Pre-condicoes listadas.
- Usuario master real protegido.
- Producao continua nao pronta.
- Nenhuma execucao feita.

## 14. Proximos passos
- Registrar resultado do runbook no ledger.
- Revisar o runbook em microcorte proprio.
- Decidir encerramento da Fase 1.
- Fazer push somente no final da Fase 1.