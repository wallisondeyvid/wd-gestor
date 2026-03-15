# Checkpoint de Autenticação – GET /gestor/api/bancos

## Caminho real do endpoint
- **GET /gestor/api/bancos**

## Teste criado
Arquivo: tests/bancoApi.contract.test.js

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createServer } from '../src/server/createServer.js';

const BANCOS_ENDPOINT = '/gestor/api/bancos';

test('GET /gestor/api/bancos exige autenticação', async () => {
  const { app, close } = await createServer();
  try {
    const res = await request(app).get(BANCOS_ENDPOINT);
    assert.equal(res.status, 401);
    assert.equal(res.type, 'application/json');
    assert.deepEqual(res.body, {
      ok: false,
      error: 'Não autenticado',
      code: 'UNAUTHORIZED',
    });
  } finally {
    await close();
  }
});
```

## Contrato observado sem sessão
- **Status:** 401
- **Content-Type:** application/json
- **Body:**
  - ok: false
  - error: "Não autenticado"
  - code: "UNAUTHORIZED"

## Conclusão
- O endpoint está **PROTEGIDO** por autenticação no wiring real.
- Não houve patch de produção.
- Classificação final: **LACUNA_DE_COBERTURA_FECHADA**
