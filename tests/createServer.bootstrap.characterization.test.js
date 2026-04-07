import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const RESULT_PREFIX = '__RESULT__';

function runScenario(name, code) {
  const child = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', code],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
      encoding: 'utf8',
      timeout: 120000,
    },
  );

  if (child.error) {
    throw child.error;
  }

  const stdout = String(child.stdout || '');
  const stderr = String(child.stderr || '');

  if (child.status !== 0) {
    throw new Error(
      [
        `[${name}] processo filho falhou com status ${child.status}`,
        '--- stdout ---',
        stdout,
        '--- stderr ---',
        stderr,
      ].join('\n'),
    );
  }

  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const resultLine = [...lines].reverse().find((line) => line.startsWith(RESULT_PREFIX));

  assert.ok(resultLine, `[${name}] não encontrou linha de resultado com prefixo ${RESULT_PREFIX}`);

  try {
    return JSON.parse(resultLine.slice(RESULT_PREFIX.length));
  } catch (err) {
    throw new Error(
      [
        `[${name}] falha ao parsear JSON do cenário`,
        `linha: ${resultLine}`,
        `erro: ${err instanceof Error ? err.message : String(err)}`,
      ].join('\n'),
    );
  }
}

test('createServer: repetição no mesmo processo não deveria duplicar mount do Escalas', () => {
  const result = runScenario(
    'duplicate-escalas-mounts',
    `
      process.env.ENABLE_ESCALAS = '1';

      const { createServer } = await import('./src/server/createServer.js');

      function countMountedAppForPath(app, pathName) {
        const stack = (app && app._router && Array.isArray(app._router.stack))
          ? app._router.stack
          : [];
        return stack.filter((layer) => {
          const rx = layer && layer.regexp;
          const name = String((layer && layer.name) || '');
          return name === 'mounted_app' && rx instanceof RegExp && rx.test(pathName);
        }).length;
      }

      const first = await createServer({ skipDb: true, deferErrorHandlers: true });
      const firstEscalasMounts = countMountedAppForPath(first.app, '/escalas');
      await first.close({ stopMemoryServer: true });

      const second = await createServer({ skipDb: true, deferErrorHandlers: true });
      const secondEscalasMounts = countMountedAppForPath(second.app, '/escalas');
      await second.close({ stopMemoryServer: true });

      console.log('${RESULT_PREFIX}' + JSON.stringify({ firstEscalasMounts, secondEscalasMounts }));
    `,
  );

  assert.equal(result.firstEscalasMounts, 1, 'primeira inicialização deve montar Escalas uma vez');
  assert.equal(
    result.secondEscalasMounts,
    1,
    'segunda inicialização não deve acumular mount extra de Escalas',
  );
});

test('createServer: alternância ENABLE_ESCALAS 1->0 não deveria herdar mount anterior', () => {
  const result = runScenario(
    'toggle-escalas-flag',
    `
      process.env.ENABLE_ESCALAS = '1';

      const { createServer } = await import('./src/server/createServer.js');

      function countMountedAppForPath(app, pathName) {
        const stack = (app && app._router && Array.isArray(app._router.stack))
          ? app._router.stack
          : [];
        return stack.filter((layer) => {
          const rx = layer && layer.regexp;
          const name = String((layer && layer.name) || '');
          return name === 'mounted_app' && rx instanceof RegExp && rx.test(pathName);
        }).length;
      }

      const first = await createServer({ skipDb: true, deferErrorHandlers: true });
      const firstEscalasMounts = countMountedAppForPath(first.app, '/escalas');
      await first.close({ stopMemoryServer: true });

      process.env.ENABLE_ESCALAS = '0';
      const second = await createServer({ skipDb: true, deferErrorHandlers: true });
      const secondEscalasMounts = countMountedAppForPath(second.app, '/escalas');
      await second.close({ stopMemoryServer: true });

      console.log('${RESULT_PREFIX}' + JSON.stringify({ firstEscalasMounts, secondEscalasMounts }));
    `,
  );

  assert.equal(result.firstEscalasMounts, 1, 'setup inicial deve montar Escalas uma vez');
  assert.equal(result.secondEscalasMounts, 0, 'com ENABLE_ESCALAS=0 não deve herdar mount de Escalas');
});

test('createServer: sub-app singleton não deveria ficar preso ao parent da última inicialização', () => {
  const result = runScenario(
    'portal-parent-contamination',
    `
      process.env.ENABLE_ESCALAS = '0';

      const { createServer } = await import('./src/server/createServer.js');
      const portalModule = await import('./src/modules/portal-morador/index.js');

      const first = await createServer({ skipDb: true, deferErrorHandlers: true });
      const second = await createServer({ skipDb: true, deferErrorHandlers: true });

      const portalApp = portalModule.buildModule({});

      const portalParentIsFirst = !!portalApp && portalApp.parent === first.app;
      const portalParentIsSecond = !!portalApp && portalApp.parent === second.app;

      await first.close({ stopMemoryServer: true });
      await second.close({ stopMemoryServer: true });

      console.log('${RESULT_PREFIX}' + JSON.stringify({ portalParentIsFirst, portalParentIsSecond }));
    `,
  );

  assert.equal(
    result.portalParentIsFirst,
    false,
    'sub-app novo não deveria manter referência ao parent do primeiro servidor',
  );
  assert.equal(
    result.portalParentIsSecond,
    false,
    'sub-app novo não deveria manter referência ao parent do segundo servidor',
  );
});

test('createServer: sub-app de condominios nao deve ficar preso ao parent da ultima inicializacao', () => {
  const result = runScenario(
    'condominios-parent-isolation',
    `
      process.env.ENABLE_ESCALAS = '0';

      const { createServer } = await import('./src/server/createServer.js');
      const condominiosModule = await import('./src/modules/condominios/index.js');

      const first = await createServer({ skipDb: true, deferErrorHandlers: true });
      const second = await createServer({ skipDb: true, deferErrorHandlers: true });

      const condominiosApp = condominiosModule.buildModule({});
      const parentIsFirst = !!condominiosApp && condominiosApp.parent === first.app;
      const parentIsSecond = !!condominiosApp && condominiosApp.parent === second.app;

      await first.close({ stopMemoryServer: true });
      await second.close({ stopMemoryServer: true });

      console.log('${RESULT_PREFIX}' + JSON.stringify({ parentIsFirst, parentIsSecond }));
    `,
  );

  assert.equal(
    result.parentIsFirst,
    false,
    'sub-app isolado de condominios nao deve manter parent do primeiro bootstrap',
  );
  assert.equal(
    result.parentIsSecond,
    false,
    'sub-app isolado de condominios nao deve manter parent do segundo bootstrap',
  );
});

test('condominios: getEffectiveSkipDb nao considera parent.locals.skipDb no request path', () => {
  const result = runScenario(
    'condominios-getEffectiveSkipDb-parent-read',
    `
      process.env.ENABLE_ESCALAS = '0';

      const express = (await import('express')).default;
      const { createServer } = await import('./src/server/createServer.js');
      const request = (await import('supertest')).default;

      const originalUse = express.application.use;
      let capturedCondominiosApp = null;

      express.application.use = function patchedUse(...args) {
        try {
          if (args[0] === '/condominios' && args[1] && args[1].locals) {
            capturedCondominiosApp = args[1];
          }
        } catch {
          // noop
        }
        return originalUse.apply(this, args);
      };

      let built = null;
      try {
        built = await createServer({ skipDb: false, deferErrorHandlers: true });
      } finally {
        express.application.use = originalUse;
      }
      const condApp = capturedCondominiosApp;

      if (!condApp || !built.app || !built.app.locals) {
        throw new Error('nao foi possivel capturar app de condominios durante a montagem');
      }

      condApp.locals.skipDb = false;
      built.app.locals.skipDb = true;

      const res = await request(built.app)
        .get('/condominios/api/blocos')
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      await built.close({ stopMemoryServer: true });

      console.log('${RESULT_PREFIX}' + JSON.stringify({
        status: res.status,
        effective: String(res.headers['x-condominios-effective-skipdb'] || ''),
        subApp: String(res.headers['x-condominios-subapp-skipdb'] || ''),
        parentHeader: String(res.headers['x-condominios-parent-skipdb'] || ''),
        hasParentMeta: Object.prototype.hasOwnProperty.call(res.body?.meta || {}, 'parentSkipDb'),
      }));
    `,
  );

    assert.equal(result.status, 503, 'o cenario continua em indisponibilidade de DB, sem herdar parent no effective');
  assert.notEqual(
    result.effective,
    'true',
    'novo contrato: parent.locals.skipDb nao deve mais influenciar effectiveSkipDb',
  );
  if (result.effective !== '') {
    assert.equal(result.effective, 'false', 'quando presente, effectiveSkipDb deve refletir apenas skipDb local');
  }
  assert.equal(result.parentHeader, '', 'novo contrato: X-Condominios-Parent-SkipDb nao deve mais ser exposto');
  assert.equal(result.hasParentMeta, false, 'novo contrato: meta.parentSkipDb nao deve mais ser exposto');
});

test('condominios: parent.locals.__skipDbForced nao força offline no request path', () => {
  const result = runScenario(
    'condominios-parent-forced-offline',
    `
      process.env.ENABLE_ESCALAS = '0';

      const express = (await import('express')).default;
      const mongoose = (await import('mongoose')).default;
      const { createServer } = await import('./src/server/createServer.js');
      const request = (await import('supertest')).default;
      const CondComunicado = (await import('#models/cond_comunicado.js')).default;

      const originalUse = express.application.use;
      let capturedCondominiosApp = null;

      express.application.use = function patchedUse(...args) {
        try {
          if (args[0] === '/condominios' && args[1] && args[1].locals) {
            capturedCondominiosApp = args[1];
          }
        } catch {
          // noop
        }
        return originalUse.apply(this, args);
      };

      let built = null;
      try {
        built = await createServer({ skipDb: false, deferErrorHandlers: true });
      } finally {
        express.application.use = originalUse;
      }

      const condApp = capturedCondominiosApp;
      if (!condApp || !built.app || !built.app.locals) {
        throw new Error('nao foi possivel capturar app de condominios durante a montagem');
      }

      built.app.get('/__tests__/seed-condominios-session', (req, res) => {
        req.session.user = {
          id: '000000000000000000000001',
          nome: 'Admin Teste',
          role: 'admin',
          unidade_id: '000000000000000000000010',
        };

        req.session.save((err) => {
          if (err) return res.status(500).json({ ok: false, error: 'SESSION_SEED_FAILED' });
          return res.status(204).end();
        });
      });

      const originalReadyStateDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
      Object.defineProperty(mongoose.connection, 'readyState', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: 1,
      });

      const originalCountDocuments = CondComunicado.countDocuments;
      const originalFind = CondComunicado.find;
      CondComunicado.countDocuments = async () => 0;
      CondComunicado.find = () => ({
        sort() { return this; },
        skip() { return this; },
        limit() { return this; },
        lean: async () => [],
      });

      const agent = request.agent(built.app);
      const seed = await agent
        .get('/__tests__/seed-condominios-session')
        .set('Connection', 'close');

      if (seed.status !== 204) {
        throw new Error('falha ao seedar sessao de teste');
      }

      condApp.locals.skipDb = false;
      delete condApp.locals.__skipDbForced;
      built.app.locals.skipDb = false;
      delete built.app.locals.__skipDbForced;

      let baseRes;
      let forcedRes;
      try {
        baseRes = await agent
          .get('/condominios/api/comunicados')
          .set('Accept', 'application/json')
          .set('Connection', 'close');

        built.app.locals.__skipDbForced = true;

        forcedRes = await agent
          .get('/condominios/api/comunicados')
          .set('Accept', 'application/json')
          .set('Connection', 'close');
      } finally {
        CondComunicado.countDocuments = originalCountDocuments;
        CondComunicado.find = originalFind;
        if (originalReadyStateDescriptor) {
          Object.defineProperty(mongoose.connection, 'readyState', originalReadyStateDescriptor);
        } else {
          delete mongoose.connection.readyState;
        }
        await built.close({ stopMemoryServer: true });
      }

      console.log('${RESULT_PREFIX}' + JSON.stringify({
        baseStatus: baseRes.status,
        forcedStatus: forcedRes.status,
        baseOk: baseRes.body?.ok,
        forcedError: forcedRes.body?.error,
        forcedEffective: String(forcedRes.headers['x-condominios-effective-skipdb'] || ''),
        forcedSubApp: String(forcedRes.headers['x-condominios-subapp-skipdb'] || ''),
      }));
    `,
  );

  assert.equal(result.baseStatus, 200, 'sem __skipDbForced no parent, a rota caracterizada deve seguir fluxo normal');
  assert.equal(result.baseOk, true, 'sem __skipDbForced no parent, a rota caracterizada deve responder ok=true');
  assert.equal(result.forcedStatus, 200, 'com __skipDbForced apenas no parent, a rota deve seguir fluxo normal');
  assert.equal(result.forcedError, undefined, 'com __skipDbForced apenas no parent, nao deve haver payload offline');
  assert.notEqual(result.forcedEffective, 'true', 'o parent forced nao deve contaminar effectiveSkipDb');
  assert.notEqual(result.forcedSubApp, 'true', 'o parent forced nao deve contaminar skipDb local');
});

test('condominios: parent.locals.__skipDbForced nao impede limpar req.app.locals.skipDb apos reconnect', () => {
  const result = runScenario(
    'condominios-parent-forced-preserve-local-skipdb',
    `
      process.env.ENABLE_ESCALAS = '0';
      process.env.MONGO_URI = 'mongodb://forced-reconnect.test:27017/wdgestor';

      const express = (await import('express')).default;
      const mongoose = (await import('mongoose')).default;
      const request = (await import('supertest')).default;
      const CondComunicado = (await import('#models/cond_comunicado.js')).default;
      const condApp = (await import('./src/modules/condominios/app/condominios-app.js')).default;

      const parentApp = express();
      parentApp.use((req, _res, next) => {
        req.session = {
          user: {
            id: '000000000000000000000001',
            nome: 'Admin Teste',
            role: 'admin',
            unidade_id: '000000000000000000000010',
          },
        };
        next();
      });
      parentApp.use('/condominios', condApp);

      const originalReadyStateDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
      Object.defineProperty(mongoose.connection, 'readyState', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: 0,
      });

      const originalConnect = mongoose.connect;
      const originalCountDocuments = CondComunicado.countDocuments;
      const originalFind = CondComunicado.find;

      CondComunicado.countDocuments = async () => 0;
      CondComunicado.find = () => ({
        sort() { return this; },
        skip() { return this; },
        limit() { return this; },
        lean: async () => [],
      });

      let connectPhase = 'baseline';
      mongoose.connect = async () => {
        if (connectPhase === 'forced') {
          parentApp.locals.__skipDbForced = true;
        }
        mongoose.connection.readyState = 1;
        return mongoose;
      };

      let baselineRes;
      let forcedRes;
      let baselineSubAppSkipDbAfter = null;
      let forcedSubAppSkipDbAfter = null;
      let baselineParentSkipDbAfter = null;
      let forcedParentSkipDbAfter = null;
      let parentForcedAfter = null;

      try {
        condApp.locals.skipDb = true;
        parentApp.locals.skipDb = true;
        delete condApp.locals.__skipDbForced;
        delete parentApp.locals.__skipDbForced;
        mongoose.connection.readyState = 0;

        baselineRes = await request(parentApp)
          .get('/condominios/api/comunicados')
          .set('Accept', 'application/json')
          .set('Connection', 'close');
        baselineSubAppSkipDbAfter = !!condApp.locals.skipDb;
        baselineParentSkipDbAfter = !!parentApp.locals.skipDb;

        connectPhase = 'forced';
        condApp.locals.skipDb = true;
        parentApp.locals.skipDb = true;
        delete condApp.locals.__skipDbForced;
        delete parentApp.locals.__skipDbForced;
        mongoose.connection.readyState = 0;

        forcedRes = await request(parentApp)
          .get('/condominios/api/comunicados')
          .set('Accept', 'application/json')
          .set('Connection', 'close');
        forcedSubAppSkipDbAfter = !!condApp.locals.skipDb;
        forcedParentSkipDbAfter = !!parentApp.locals.skipDb;
        parentForcedAfter = !!parentApp.locals.__skipDbForced;
      } finally {
        mongoose.connect = originalConnect;
        CondComunicado.countDocuments = originalCountDocuments;
        CondComunicado.find = originalFind;
        if (originalReadyStateDescriptor) {
          Object.defineProperty(mongoose.connection, 'readyState', originalReadyStateDescriptor);
        } else {
          delete mongoose.connection.readyState;
        }
      }

      console.log('${RESULT_PREFIX}' + JSON.stringify({
        baselineStatus: baselineRes.status,
        baselineOk: baselineRes.body?.ok,
        baselineSubAppSkipDbAfter,
        baselineParentSkipDbAfter,
        forcedStatus: forcedRes.status,
        forcedOk: forcedRes.body?.ok,
        forcedSubAppSkipDbAfter,
        forcedParentSkipDbAfter,
        parentForcedAfter,
      }));
    `,
  );

  assert.equal(result.baselineStatus, 200, 'sem forced no parent durante reconnect, a rota deve seguir fluxo normal');
  assert.equal(result.baselineOk, true, 'sem forced no parent durante reconnect, a rota deve responder ok=true');
  assert.equal(result.baselineSubAppSkipDbAfter, false, 'sem forced no parent durante reconnect, o skipDb local do sub-app deve ser limpo');
  assert.equal(result.forcedStatus, 200, 'com forced ativado no parent durante reconnect, a rota caracterizada ainda conclui o fluxo normal');
  assert.equal(result.forcedOk, true, 'com forced ativado no parent durante reconnect, a resposta ainda deve permanecer ok=true');
  assert.equal(result.parentForcedAfter, true, 'harness deve confirmar que o parent forced foi ativado durante reconnect');
  assert.equal(result.forcedSubAppSkipDbAfter, result.baselineSubAppSkipDbAfter, 'com forced apenas no parent durante reconnect, o estado final de skipDb do sub-app deve permanecer igual ao baseline');
  assert.equal(result.forcedParentSkipDbAfter, result.baselineParentSkipDbAfter, 'com forced apenas no parent durante reconnect, o estado final de skipDb do parent nao deve mudar em relacao ao baseline');
});

test('createServer: alias /portal_morador monta o mesmo sub-app do portal', () => {
  const result = runScenario(
    'portal-underscore-alias',
    `
      process.env.ENABLE_ESCALAS = '0';

      const { createServer } = await import('./src/server/createServer.js');

      function countMountedAppForPath(app, pathName) {
        const stack = (app && app._router && Array.isArray(app._router.stack))
          ? app._router.stack
          : [];
        return stack.filter((layer) => {
          const rx = layer && layer.regexp;
          const name = String((layer && layer.name) || '');
          return name === 'mounted_app' && rx instanceof RegExp && rx.test(pathName);
        }).length;
      }

      const built = await createServer({ skipDb: true, deferErrorHandlers: true });
      const canonicalPortalMounts = countMountedAppForPath(built.app, '/portal-morador');
      const underscoreAliasMounts = countMountedAppForPath(built.app, '/portal_morador');
      await built.close({ stopMemoryServer: true });

      console.log('${RESULT_PREFIX}' + JSON.stringify({ canonicalPortalMounts, underscoreAliasMounts }));
    `,
  );

  assert.ok(result.canonicalPortalMounts >= 1, 'mount canônico /portal-morador deve existir');
  assert.equal(
    result.underscoreAliasMounts,
    1,
    'alias /portal_morador deve montar uma vez o sub-app do portal',
  );
});
