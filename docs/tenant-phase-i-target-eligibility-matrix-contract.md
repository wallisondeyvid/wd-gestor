# Contrato da Matriz de Elegibilidade do Alvo Controlado Nao Produtivo - Fase I

## 1. Finalidade

- definir criterios objetivos para aceitar ou recusar um alvo candidato;
- padronizar a avaliacao antes de qualquer selecao;
- nao selecionar alvo concreto neste microcorte;
- nao autorizar execucao real;
- nao criar superficie operacional.

## 2. Principio central

- um alvo so e admissivel se todas as condicoes obrigatorias forem satisfeitas simultaneamente;
- qualquer falha em criterio obrigatorio deve abortar a selecao;
- ambiguidade equivale a recusa;
- ausencia de evidencia equivale a recusa.

## 3. Campos obrigatorios do candidato

- `targetId`;
- `unidadeId`;
- `dbName`;
- `databaseKey`;
- `environment`;
- `targetKind` com valor admissivel em:
- `syntheticUnit`;
- `controlledMirror`;
- `dataClass`;
- `trafficClass`;
- `userClass`;
- `portalExposure`;
- `dedicatedDatabase`;
- `plannedAllowlist`;
- `rollbackPlan`;
- `evidencePlan`;
- `baselinePlan`;
- `ownerContextPlan`.

## 4. Criterios obrigatorios de aceite

- `environment` nao produtivo;
- `targetKind` igual a `syntheticUnit` ou `controlledMirror`;
- `dataClass=discardable`;
- `trafficClass=none`;
- `userClass=none`;
- `portalExposure=none`;
- `dedicatedDatabase=true`;
- `unidadeId` nao vazio;
- `dbName` nao vazio;
- `databaseKey` nao vazio;
- `unidadeId`, `dbName` e `databaseKey` coerentes;
- `plannedAllowlist` contem exatamente uma unidade;
- `plannedAllowlist` contem o mesmo `unidadeId` do candidato;
- `rollbackPlan` definido antes;
- `evidencePlan` definido antes;
- `baselinePlan` definido antes;
- `ownerContextPlan` definido antes;
- `ownerContextPlan` deve prever `source=manual`, `approved=true`, `actor` nao vazio e `reason` nao vazio.

## 5. Criterios obrigatorios de recusa

- `environment` produtivo;
- `targetKind` indefinido;
- `targetKind` diferente de `syntheticUnit` ou `controlledMirror`;
- `dataClass` diferente de `discardable`;
- `trafficClass` diferente de `none`;
- `userClass` diferente de `none`;
- `portalExposure` diferente de `none`;
- `dedicatedDatabase=false`;
- `unidadeId`, `dbName` ou `databaseKey` ausentes;
- incoerencia entre `unidadeId`, `dbName` e `databaseKey`;
- allowlist ausente;
- allowlist vazia;
- allowlist multipla;
- allowlist sem o `unidadeId` do candidato;
- `rollbackPlan` ausente;
- `evidencePlan` ausente;
- `baselinePlan` ausente;
- `ownerContextPlan` ausente;
- `actor` vazio;
- `reason` vazio;
- qualquer dependencia de caller real;
- qualquer dependencia de rota;
- qualquer dependencia de CLI;
- qualquer dependencia de script;
- qualquer dependencia de job;
- qualquer dependencia de bootstrap;
- qualquer dependencia de request path;
- qualquer dependencia de Portal;
- qualquer dado real;
- qualquer usuario real;
- qualquer trafego real.

## 6. Matriz de elegibilidade

| Campo | Valor aceito | Evidencia exigida | Regra de recusa |
| --- | --- | --- | --- |
| `targetId` | identificador nao vazio e deterministico | identificacao do candidato registrada | vazio, ambiguo ou ausente |
| `unidadeId` | nao vazio | identificacao da unidade candidata | vazio ou ausente |
| `dbName` | nao vazio e coerente com `unidadeId` | nome do DB registrado no plano | vazio, ausente ou incoerente |
| `databaseKey` | nao vazio e coerente com `unidadeId` | chave do DB registrada no plano | vazio, ausente ou incoerente |
| `environment` | nao produtivo | justificativa de ambiente nao produtivo | qualquer valor produtivo ou ambiguo |
| `targetKind` | `syntheticUnit` ou `controlledMirror` | classificacao explicita do candidato | indefinido ou valor diferente |
| `dataClass` | `discardable` | justificativa de dados descartaveis | qualquer valor diferente |
| `trafficClass` | `none` | confirmacao de ausencia de trafego real | qualquer valor diferente |
| `userClass` | `none` | confirmacao de ausencia de usuario real | qualquer valor diferente |
| `portalExposure` | `none` | confirmacao de ausencia de Portal | qualquer valor diferente |
| `dedicatedDatabase` | `true` | confirmacao de DB dedicado | `false`, ausente ou ambiguo |
| `plannedAllowlist` | exatamente uma unidade igual ao `unidadeId` | plano de allowlist unitaria | ausente, vazia, multipla ou sem o `unidadeId` |
| `rollbackPlan` | definido antes da selecao | plano de rollback registrado | ausente ou incompleto |
| `evidencePlan` | definido antes da selecao | pacote minimo de evidencias registrado | ausente ou incompleto |
| `baselinePlan` | definido antes da selecao | baseline curta e baseline final planejadas | ausente ou incompleto |
| `ownerContextPlan` | `source=manual`, `approved=true`, `actor` nao vazio, `reason` nao vazio | contexto manual explicito previsto | ausente, incompleto ou ambiguo |

## 7. Resultado da avaliacao

- `eligible=true` somente se todos os criterios obrigatorios passarem;
- `eligible=false` para qualquer falha;
- `blockedReasons` deve listar cada falha;
- `warnings` nao podem substituir criterios obrigatorios;
- nao existe aceite parcial.

## 8. Relacao com fases anteriores

- Fase G: o harness existente prova o corredor tecnico em teste;
- Fase H: o envelope operacional define a moldura;
- Fase I: a matriz de elegibilidade decide se um alvo pode ser sequer considerado;
- nenhuma dessas fases autoriza execucao real automaticamente.

## 9. Proximos passos apos este contrato

- rodada read-only para verificar se existe candidato admissivel;
- se existir, documentar selecao sem execucao;
- se nao existir, pausar ou encerrar a Fase I sem execucao;
- qualquer execucao real exigira nova fase ou bloco explicito.

## 10. Baseline obrigatoria

- `npm run verify:imports`;
- `node --test .\tests\architecture\unitDatabaseRegistryManualOwner.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryManualEntrypoint.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryNonProductionPilot.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryControlledPilot.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryWriterResolveConnection.contract.test.js`;
- `npm test` antes de publicacao global.