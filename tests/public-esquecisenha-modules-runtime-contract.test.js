import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

test('public esquecisenha por módulo: GETs públicos retornam 200 com badge e links corretos', async () => {
  const { app } = await createServer({ skipDb: true, skipAuth: true });

  const checks = [
    {
      path: '/gestor/esquecisenha',
      badge: 'Módulo Gestor',
      loginHref: 'href="/gestor/login"',
      retryHref: 'href="/gestor/esquecisenha"',
    },
    {
      path: '/condominios/esquecisenha',
      badge: 'Módulo Gestão de Condomínio',
      loginHref: 'href="/condominios/login"',
      retryHref: 'href="/condominios/esquecisenha"',
    },
    {
      path: '/escalas/esquecisenha',
      badge: 'Módulo Escalas',
      loginHref: 'href="/escalas/login"',
      retryHref: 'href="/escalas/esquecisenha"',
    },
  ];

  for (const check of checks) {
    const response = await request(app).get(check.path);
    assert.equal(response.status, 200, `${check.path} deve responder 200`);
    assert.match(response.text, new RegExp(check.badge.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(response.text, new RegExp(check.loginHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(response.text, new RegExp(check.retryHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(response.text, /Recurso não encontrado|ReferenceError|debugLink|name="email"|token|hash/i);
    assert.match(response.text, /name="cpf"/);
  }
});