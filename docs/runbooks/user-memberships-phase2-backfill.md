# Runbook - Fase 2 Backfill de user_memberships

## Objetivo
Executar com seguranca a migration [scripts/migrations/2026-03-11_backfill-user-memberships-fase2.js](scripts/migrations/2026-03-11_backfill-user-memberships-fase2.js) em homologacao e producao, sem alterar runtime, login, APIs ou Portal do Morador.

## Escopo e garantias
- A migration so escreve em `users.global_role` e em `user_memberships`.
- O runtime atual continua lendo apenas o legado.
- Nao ha ativacao de leitura de `user_memberships` nesta fase.
- Nao ha merge por CPF.
- Nao ha merge por nome.
- Conflitos e inconsistencias entram no relatorio; nao ha correcao silenciosa.

## 1. Pre-condicoes

### Branch e commit corretos
Confirmar que a execucao sera feita na branch de homologacao/producao aprovada para rollout.

```bash
git rev-parse --abbrev-ref HEAD
git rev-parse --short HEAD
```

### Working tree limpo
Nao executar com alteracoes locais nao commitadas.

```bash
git status --short
```

Criterio:
- GO: saida vazia.
- NO-GO: qualquer arquivo alterado sem justificativa operacional formal.

### Backup ou snapshot do banco
Antes de qualquer execucao real, registrar um identificador de recuperacao.

Minimo aceitavel:
- snapshot do cluster gerenciado com timestamp UTC.
- ou backup logico aprovado pelo time de infra.

Registrar no changelog operacional:
- snapshot_id ou backup_id.
- horario UTC de inicio da janela.

### Confirmacao de MONGODB_URI ou MONGO_URI
Validar que a migration vai apontar para a base correta.

```bash
node -e "const uri=process.env.MONGODB_URI||process.env.MONGO_URI||''; if(!uri){console.error('MONGODB_URI/MONGO_URI ausente'); process.exit(1)} console.log(uri.replace(/\/\/([^@]+)@/,'//***@'))"
```

Criterio:
- GO: URI presente e ambiente correto confirmado.
- NO-GO: URI ausente, ambigua ou apontando para ambiente errado.

### Confirmacao de que a Fase 1 ja foi aplicada
Confirmar que a colecao existe e que os indices compostos alvo estao presentes.

Conectar no banco correto:

```javascript
db.getCollectionInfos({ name: 'user_memberships' })
db.user_memberships.getIndexes().map(index => index.name)
```

Esperado:
- colecao `user_memberships` existente.
- indices alvo presentes:
- `uk_user_membership_user_unidade`
- `idx_user_membership_user_status`
- `idx_user_membership_unidade_status_papel`
- `uk_user_membership_unidade_funcionario`

Observacao:
- a migration da Fase 2 re-garante a estrutura da Fase 1 de forma idempotente.
- ainda assim, operacionalmente, trate ausencia da Fase 1 como NO-GO e valide antes de prosseguir.

### Confirmacao de que o runtime atual nao le user_memberships
Confirmar pela documentacao e por busca rapida em codigo.

Documentos de referencia:
- [docs/gestor-auth-context-phase1-compat.md](docs/gestor-auth-context-phase1-compat.md)
- [docs/gestor-auth-context-phase2-compat.md](docs/gestor-auth-context-phase2-compat.md)

Busca rapida no runtime:

```bash
rg -n -i "userMembership|user_membership|user_memberships|global_role" src/ routes/
```

Criterio:
- GO: nenhum consumo de runtime fora de model, scripts ou testes.
- NO-GO: qualquer leitura nova em middlewares, login, controllers de runtime ou APIs.

## 2. Execucao em homologacao - dry-run

### Comando exato
Opcional, smoke inicial com amostra pequena:

```bash
npm run migrate:user-memberships-phase2 -- --dry-run --limit=50 --sample-limit=10
```

Obrigatorio, dry-run completo:

```bash
npm run migrate:user-memberships-phase2 -- --dry-run --sample-limit=50
```

### Como interpretar o resumo
No `Resumo JSON`, observar:
- `usersRead`: total de users processados.
- `membershipsCreated`: total projetado de insercoes novas em `user_memberships`.
- `membershipsUpdated`: total projetado de updates seguros em memberships ja existentes.
- `membershipsAlreadyExisting`: total de memberships ja alinhados com o legado.
- `usersWithAnomaly`: total de users com qualquer anomalia registrada.
- `usersWithoutUnitContextual`: total de users com papel contextual aproveitavel, mas sem `unidade_id` utilizavel.
- `usersWithoutRoleContextual`: total de users que nao geram membership contextual nesta fase, tipicamente `master` e `admin`.
- `globalRolesSet`: total projetado de backfill em `users.global_role`.
- `globalRolesAlreadyAligned`: users globais ja conformes.
- `anomaliesByCode`: contagem por codigo.
- `anomalySamples`: amostra operacional para triagem.

### Como interpretar anomalias
Classes de anomalia mais importantes:

Bloqueantes:
- `GLOBAL_ROLE_CONFLICT`
- `UNEXPECTED_GLOBAL_ROLE_FOR_CONTEXTUAL_USER`
- `MEMBERSHIP_ROLE_CONFLICT`
- `MEMBERSHIP_FUNCIONARIO_CONFLICT`
- `MEMBERSHIP_FUNCIONARIO_OCCUPIED`
- `LEGACY_FUNCIONARIO_DUPLICATED_ACROSS_USERS`
- `FUNCIONARIO_LINKED_TO_OTHER_USER`
- `GLOBAL_ROLE_WRITE_SKIPPED`
- `MEMBERSHIP_CREATE_FAILED`
- `MEMBERSHIP_UPDATE_SKIPPED`

Nao bloqueantes por si so, mas exigem rastreio:
- `CONTEXTUAL_ROLE_WITHOUT_UNIDADE_ID`
- `CONTEXTUAL_ROLE_UNIDADE_ID_INVALID`
- `CONTEXTUAL_ROLE_UNIDADE_NOT_FOUND`
- `FUNCIONARIO_ID_INVALID`
- `FUNCIONARIO_NOT_FOUND`
- `FUNCIONARIO_WITHOUT_UNIDADE_ID`
- `FUNCIONARIO_UNIDADE_MISMATCH`
- `UNSUPPORTED_ROLE`

### Criterios de decisao
GO:
- nenhum codigo bloqueante.
- `usersWithAnomaly = 0` ou somente anomalias nao bloqueantes ja entendidas e aceitas pelo owner funcional.
- dry-run repetido duas vezes no mesmo snapshot com contadores estaveis.

GO COM RESSALVAS:
- zero anomalias bloqueantes.
- existem anomalias nao bloqueantes, todas triadas e registradas em ticket.
- a equipe aceita seguir sabendo que alguns users vao permanecer sem membership contextual nesta fase.

NO-GO:
- qualquer anomalia bloqueante.
- contadores inconsistentes entre dois dry-runs no mesmo snapshot.
- ausencia de snapshot/backup.
- Fase 1 ausente ou runtime ja consumindo `user_memberships`.

## 3. Execucao real em homologacao

### Registrar janela UTC
Antes de rodar, capturar o inicio da janela.

```bash
node -e "console.log(new Date().toISOString())"
```

Guardar como `WINDOW_START_UTC`.

Antes da execucao real, guardar tambem:
- o `Resumo JSON` do dry-run imediatamente anterior a esta execucao.
- a lista pre-capturada de `user_id` afetados, se o plano ainda considerar rollback manual de `users.global_role`.

Sem essa lista pre-capturada, tratar restore de snapshot ou backup como a unica reversao segura para `users.global_role`.

### Comando exato sem dry-run

```bash
npm run migrate:user-memberships-phase2 -- --sample-limit=50
```

Ao final, capturar `WINDOW_END_UTC`.

```bash
node -e "console.log(new Date().toISOString())"
```

### Validacoes pos-execucao
1. Rerodar imediatamente o dry-run completo.

```bash
npm run migrate:user-memberships-phase2 -- --dry-run --sample-limit=50
```

Esperado apos execucao bem-sucedida:
- `membershipsCreated` igual a `0` ou residual apenas para novos dados concorrentes.
- `membershipsUpdated` igual a `0` ou residual apenas para novos dados concorrentes.
- `globalRolesSet` igual a `0`.

2. Conferir a colecao e os indices:

```javascript
db.getCollectionInfos({ name: 'user_memberships' })
db.user_memberships.getIndexes().map(index => index.name)
```

3. Conferir volumes basicos:

```javascript
db.user_memberships.countDocuments()
db.user_memberships.countDocuments({ origem: 'legacy-auth-context-phase2' })
```

Interpretacao:
- a primeira query mede o total atual da colecao.
- a segunda query mede documentos tocados pela fase 2, incluindo criados e memberships preexistentes atualizados com `origem`.

### Queries mongosh de verificacao

Quantidade total de `user_memberships`:

```javascript
db.user_memberships.countDocuments()
```

Users com `global_role`:

```javascript
db.users.countDocuments({ global_role: { $in: ['master', 'admin'] } })
db.users.aggregate([
  { $match: { global_role: { $in: ['master', 'admin'] } } },
  { $group: { _id: '$global_role', total: { $sum: 1 } } },
  { $sort: { _id: 1 } }
])
```

Mismatch 1, users com `global_role` presente e `role` fora de `master/admin`:

```javascript
db.users.countDocuments({
  global_role: { $in: ['master', 'admin'] },
  role: { $nin: ['master', 'admin'] }
})

db.users.find(
  {
    global_role: { $in: ['master', 'admin'] },
    role: { $nin: ['master', 'admin'] }
  },
  { _id: 1, email: 1, role: 1, global_role: 1 }
).limit(50)
```

Mismatch 2, users com `role` `master/admin` sem `global_role` correspondente:

```javascript
db.users.countDocuments({
  role: { $in: ['master', 'admin'] },
  $expr: { $ne: ['$global_role', '$role'] }
})

db.users.find(
  {
    role: { $in: ['master', 'admin'] },
    $expr: { $ne: ['$global_role', '$role'] }
  },
  { _id: 1, email: 1, role: 1, global_role: 1 }
).limit(50)
```

Memberships por `papel_contextual`:

```javascript
db.user_memberships.aggregate([
  { $group: { _id: '$papel_contextual', total: { $sum: 1 } } },
  { $sort: { _id: 1 } }
])
```

Memberships com `funcionario_id`:

```javascript
db.user_memberships.countDocuments({ funcionario_id: { $type: 'objectId' } })
```

Ausencia de duplicidade por `user_id + unidade_id`:

```javascript
db.user_memberships.aggregate([
  {
    $group: {
      _id: { user_id: '$user_id', unidade_id: '$unidade_id' },
      total: { $sum: 1 },
      ids: { $push: '$_id' }
    }
  },
  { $match: { total: { $gt: 1 } } },
  { $limit: 20 }
])
```

Opcional, ausencia de duplicidade por `unidade_id + funcionario_id`:

```javascript
db.user_memberships.aggregate([
  {
    $match: { funcionario_id: { $type: 'objectId' } }
  },
  {
    $group: {
      _id: { unidade_id: '$unidade_id', funcionario_id: '$funcionario_id' },
      total: { $sum: 1 },
      ids: { $push: '$_id' }
    }
  },
  { $match: { total: { $gt: 1 } } },
  { $limit: 20 }
])
```

## 4. Execucao em producao

### Checklist curto
- branch e commit aprovados.
- working tree limpo.
- snapshot ou backup confirmado.
- Fase 1 validada.
- dry-run homologado aprovado.
- janela de menor trafego definida.
- owner funcional e owner tecnico cientes da janela.
- `WINDOW_START_UTC` anotado antes da execucao.

### Janela operacional
Preferir:
- baixa taxa de alteracao manual de users e funcionarios.
- ausencia de deploy concorrente.
- ausencia de manutencao paralela no banco.

### Comando exato

```bash
npm run migrate:user-memberships-phase2 -- --sample-limit=50
```

### Validacoes pos-execucao
- repetir o dry-run completo.
- capturar e arquivar o `Resumo JSON` da execucao real.
- executar as queries mongosh da secao de homologacao.
- validar ausencia de duplicidade por `user_id + unidade_id`.
- validar se `global_role` foi preenchido apenas para `master` e `admin`.

### Criterios de rollback operacional
Executar rollback operacional imediato se ocorrer qualquer um destes casos:
- contadores muito acima do esperado frente ao dry-run homologado.
- anomalias bloqueantes nao vistas em homologacao.
- duplicidade por `user_id + unidade_id` apos a execucao.
- suspeita de write concorrente indevido sobre `users.global_role` ou `user_memberships` durante a janela.

Se houver duvida sobre concorrencia ou sobre memberships preexistentes atualizados, preferir restauracao do snapshot do banco em vez de rollback manual parcial.

## 5. Rollback operacional

### O que e reversivel
- memberships criados pela fase 2 dentro da janela de execucao.
- `global_role` preenchido pela fase 2 somente quando existir lista pre-capturada dos `user_id` realmente afetados pela execucao real.
- `origem` adicionada a memberships preexistentes, desde que se aceite que isso nao reverte eventual `status` alterado.

### O que nao e plenamente reversivel sem snapshot
- `status` alterado em membership preexistente, porque o valor anterior nao e persistido pela migration.
- qualquer documento alterado novamente por outra operacao depois da janela do backfill.
- rollback tardio sem delimitacao clara de `WINDOW_START_UTC` e `WINDOW_END_UTC`.
- qualquer rollback manual de `users.global_role` sem lista pre-capturada de `user_id` afetados.

### Queries de rollback operacional
Substituir `WINDOW_START_UTC` e `WINDOW_END_UTC` pelos timestamps reais da janela.

Preview de memberships criados pela fase 2 na janela:

```javascript
db.user_memberships.countDocuments({
  origem: 'legacy-auth-context-phase2',
  createdAt: {
    $gte: ISODate('WINDOW_START_UTC'),
    $lte: ISODate('WINDOW_END_UTC')
  }
})
```

Remover apenas memberships criados na janela:

```javascript
db.user_memberships.deleteMany({
  origem: 'legacy-auth-context-phase2',
  createdAt: {
    $gte: ISODate('WINDOW_START_UTC'),
    $lte: ISODate('WINDOW_END_UTC')
  }
})
```

Rollback manual de `users.global_role`:

Somente executar se existir lista pre-capturada de `user_id` afetados pela execucao real. `updatedAt` isoladamente nao identifica com seguranca quais `users` receberam `global_role` por causa da fase 2.

Preview com lista pre-capturada de `user_id`:

```javascript
db.users.find(
  {
    _id: { $in: [ObjectId('USER_ID_1'), ObjectId('USER_ID_2')] },
    role: { $in: ['master', 'admin'] },
    global_role: { $in: ['master', 'admin'] }
  },
  { _id: 1, email: 1, role: 1, global_role: 1 }
)
```

Unset de `global_role` com lista pre-capturada de `user_id`:

```javascript
db.users.updateMany(
  {
    _id: { $in: [ObjectId('USER_ID_1'), ObjectId('USER_ID_2')] },
    role: { $in: ['master', 'admin'] },
    global_role: { $in: ['master', 'admin'] }
  },
  { $unset: { global_role: '' } }
)
```

Sem essa evidencia previa, o rollback correto para `users.global_role` e restore de snapshot ou backup.

Preview de memberships preexistentes apenas marcados com `origem` na janela:

```javascript
db.user_memberships.countDocuments({
  origem: 'legacy-auth-context-phase2',
  createdAt: { $lt: ISODate('WINDOW_START_UTC') },
  updatedAt: {
    $gte: ISODate('WINDOW_START_UTC'),
    $lte: ISODate('WINDOW_END_UTC')
  }
})
```

Unset de `origem` em memberships preexistentes tocados na janela:

```javascript
db.user_memberships.updateMany(
  {
    origem: 'legacy-auth-context-phase2',
    createdAt: { $lt: ISODate('WINDOW_START_UTC') },
    updatedAt: {
      $gte: ISODate('WINDOW_START_UTC'),
      $lte: ISODate('WINDOW_END_UTC')
    }
  },
  { $unset: { origem: '' } }
)
```

Observacao critica:
- as queries acima removem apenas o que for delimitavel pela janela e pela `origem`.
- elas nao restauram com precisao o `status` previo de memberships preexistentes.
- elas nao tornam `updatedAt` um criterio suficiente para rollback de `users.global_role`.
- para reversao exata do estado anterior, usar o snapshot do banco.

## 6. Riscos residuais
- memberships conflitantes ja existentes podem bloquear create ou update seguro.
- users com `unidade_id` ausente ou invalido continuarao sem membership contextual.
- `funcionario_id` inconsistente pode gerar skip e anomalia.
- users `master` e `admin` continuam sem membership contextual por desenho desta fase.
- o runtime ainda nao consome a colecao nova; portanto a fase 2 prepara dados, mas nao muda comportamento de login nem autorizacao.

## 7. Criterios de encerramento

Considerar a fase 2 concluida quando:
- homologacao em dry-run teve decisao GO ou GO COM RESSALVAS formalizada.
- homologacao real executou com validacao pos-run satisfatoria.
- producao executou na janela aprovada.
- queries pos-run confirmaram ausencia de duplicidade por `user_id + unidade_id`.
- resumo JSON da execucao foi arquivado.
- snapshot ou backup de pre-execucao foi registrado.
- qualquer anomalia remanescente foi registrada em ticket de follow-up.

Evidencias a guardar no PR, changelog ou ticket operacional:
- branch e commit executados.
- `WINDOW_START_UTC` e `WINDOW_END_UTC`.
- snapshot_id ou backup_id.
- comando executado.
- `Resumo JSON` do dry-run imediatamente anterior a execucao real.
- `Resumo JSON` da migration.
- lista pre-capturada de `user_id` afetados, se o plano mantiver rollback manual de `users.global_role`.
- resultado das queries pos-run.
- decisao final: GO, GO COM RESSALVAS ou NO-GO.
