# UserDB Canary Runbook

## Objetivo
Validar rollout canario de userdb (db por unidade) sem alterar rotas/controllers.

## Env Minimo
Use uma unidade piloto valida na allowlist.

```bash
WD_MULTI_DB=1
WD_MULTI_DB_ALLOWLIST=000000000000000000000010
WD_USERDB_HANDSHAKE=1
WDG_MULTI_TENANT=1
```

Opcional:

```bash
WD_CANARY_UNIDADE_ID=000000000000000000000010
WD_CANARY_ROUTE_ID=000000000000000000000001
```

## Execucao
Rode o smoke:

```bash
npm run smoke:userdb-canary
```

## Criterio de Sucesso
- Nao retornar `400` com `UNIDADE_ID_REQUIRED` quando `unidadeId` valido foi enviado.
- Nao retornar `401` no endpoint do Gestor (sessao seeded via `request.agent`).

Respostas `500/503` em modo `skipDb` podem acontecer e sao registradas como sinal de infraestrutura, nao de quebra do gate.

## Interpretacao dos Logs
- `userdb handshake falhou`:
  - handshake executou, encontrou erro, mas fluxo segue nao-bloqueante.
- `userdb handshake erro nao-bloqueante`:
  - excecao no handshake capturada sem quebrar request.
- `userdb handshake resumo`:
  - agregacao de sucesso/falha por unidade, emitida com throttling para evitar spam.

## Rollout Canary
1. Habilite `WD_MULTI_DB=1`.
2. Defina `WD_MULTI_DB_ALLOWLIST` apenas com a unidade piloto.
3. Mantenha `WD_USERDB_HANDSHAKE=1` para shadow observavel.
4. Rode o smoke e monitore os logs de resumo.
5. Expanda allowlist gradualmente conforme estabilidade.
