import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/userController.js')).href;
const apiDbModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/db/api.db.js')).href;
const actualServiceModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/usuarios/listLockedUsers.service.js')).href;
const serviceMockModuleUrl = 'mock:gestor-usuarios-bloqueados-structural-seam-service';
const SERVICE_EXPORTS = [
  'listLockedUsersService',
];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/usuarios/listLockedUsers.service.js') {
      return { url: serviceMockModuleUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === serviceMockModuleUrl) {
      const lines = [
        `export * from '${actualServiceModuleUrl}';`,
        `import * as actual from '${actualServiceModuleUrl}';`,
        "const getMocks = () => globalThis.__GESTOR_USUARIOS_BLOQUEADOS_STRUCTURAL_SERVICE_MOCKS__ || {};",
      ];

      for (const exportName of SERVICE_EXPORTS) {
        lines.push(`export async function ${exportName}(...args) { const fn = getMocks()['${exportName}']; if (typeof fn === 'function') return await fn(...args); return await actual['${exportName}'](...args); }`);
      }

      return {
        format: 'module',
        shortCircuit: true,
        source: lines.join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setServiceMocks(overrides = {}) {
  globalThis.__GESTOR_USUARIOS_BLOQUEADOS_STRUCTURAL_SERVICE_MOCKS__ = { ...overrides };
}

function clearServiceMocks() {
  globalThis.__GESTOR_USUARIOS_BLOQUEADOS_STRUCTURAL_SERVICE_MOCKS__ = {};
}

function createResponseCapture() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
    send(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
  };
}

test.afterEach(() => {
  clearServiceMocks();
});

test('listLockedUsers usa o service fino como caminho principal da listagem de bloqueados', async () => {
  const serviceCalls = [];

  setServiceMocks({
    listLockedUsersService: async (agora) => {
      serviceCalls.push(agora);
      return [{ _id: 'u1', email: 'admin@example.com', role: 'admin', lock_until: '2026-03-26T12:00:00.000Z', failed_login_attempts: 4 }];
    },
  });

  const { listLockedUsers } = await import(`${controllerModuleUrl}?case=${encodeURIComponent(uniqueSuffix())}`);
  const req = { user: { role: 'admin', isMaster: false } };
  const res = createResponseCapture();

  await listLockedUsers(req, res);

  assert.equal(serviceCalls.length, 1);
  assert.equal(serviceCalls[0] instanceof Date, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    total: 1,
    data: [{ _id: 'u1', email: 'admin@example.com', role: 'admin', lock_until: '2026-03-26T12:00:00.000Z', failed_login_attempts: 4 }],
  });
});

test('findUsersLockedAfterSelectLean em api.db.js delega por compatibilidade ao service fino', async () => {
  const serviceCalls = [];
  const fakeNow = new Date('2026-03-26T13:00:00.000Z');

  setServiceMocks({
    listLockedUsersService: async (agora) => {
      serviceCalls.push(agora);
      return [{ _id: 'u2' }];
    },
  });

  const { findUsersLockedAfterSelectLean } = await import(`${apiDbModuleUrl}?case=${encodeURIComponent(uniqueSuffix())}`);
  const result = await findUsersLockedAfterSelectLean(fakeNow);

  assert.deepEqual(serviceCalls, [fakeNow]);
  assert.deepEqual(result, [{ _id: 'u2' }]);
});