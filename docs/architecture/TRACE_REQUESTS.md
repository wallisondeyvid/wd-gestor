# TRACE_REQUESTS

Middleware de rastreio mínimo no bootstrap do servidor.

## O que adiciona
- Header `X-Request-Id` em toda resposta.
- Header `X-WD-Path` com o primeiro segmento da URL (ex.: `gestor`, `portal-morador`, `api`).
- `requestId` em `req` e `res.locals` para correlação.

## Logging
- Ativa logs por variável de ambiente: `WD_TRACE_REQUESTS=1`.
- Formato: `[trace] <requestId> <method> <url> <status> <durationMs>ms wdPath=<wdPath>`.

## Compatibilidade
- Não altera regras de negócio nem fluxo das rotas.
