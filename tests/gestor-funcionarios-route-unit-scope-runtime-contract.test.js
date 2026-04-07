import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const projectRoot = process.cwd();
const actualDbBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const dbBridgeMockModuleUrl = 'mock:gestor-funcionarios-route-unit-scope-db-bridge';
const DB_BRIDGE_EXPORTS = [
  'findFuncionarioByCpfAndUnidade',
  'findFuncionarioByIdPopulateRefs',
];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') {
      return { url: dbBridgeMockModuleUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === dbBridgeMockModuleUrl) {
      const lines = [
        `export * from '${actualDbBridgeModuleUrl}';`,
        `import * as actual from '${actualDbBridgeModuleUrl}';`,
        'const getMocks = () => globalThis.__GESTOR_FUNCIONARIOS_ROUTE_UNIT_SCOPE_DB_MOCKS__ || {};',
      ];

      for (const exportName of DB_BRIDGE_EXPORTS) {
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

function setDbMocks(overrides = {}) {
  globalThis.__GESTOR_FUNCIONARIOS_ROUTE_UNIT_SCOPE_DB_MOCKS__ = { ...overrides };
}

function clearDbMocks() {
  globalThis.__GESTOR_FUNCIONARIOS_ROUTE_UNIT_SCOPE_DB_MOCKS__ = {};
}

function buildValidCreateBody() {
  return {
    unidade_id: '507f191e810c19729de860ea',
    nome: 'Funcionario sem contexto',
    rg: 'RG-123456',
    cpf: '12345678901',
    data_nascimento: '1990-01-01',
    sexo: 'M',
    endereco: {
      cep: '01001000',
      logradouro: 'Rua Teste',
      numero: '100',
      bairro: 'Centro',
      cidade: 'Sao Paulo',
      uf: 'SP',
    },
    email: 'funcionario.sem.contexto@example.com',
    telefone: '(11) 99999-0000',
  };
}

async function requestFuncionarioRouterWithSession({ method, pathname, sessionUser, body, bridgeOverrides = {} } = {}) {
  setDbMocks(bridgeOverrides);
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = sessionUser ? { user: { ...sessionUser } } : {};
    next();
  });
  app.use('/gestor/api/funcionarios', (await import('../src/modules/gestor/app/routes/funcionarioApi.js')).default);

  const req = request(app)
    [method.toLowerCase()](pathname)
    .set('Accept', 'application/json');

  if (body !== undefined) {
    req.send(body);
  }

  return req;
}

test.afterEach(() => {
  clearDbMocks();
});

test('POST /gestor/api/funcionarios com diretor sem contexto canonico ativo retorna 400 na borda real', async () => {
  const response = await requestFuncionarioRouterWithSession({
    method: 'post',
    pathname: '/gestor/api/funcionarios/',
    sessionUser: {
      id: 'session-diretor-sem-contexto',
      email: 'diretor.funcionario.sem.contexto@example.com',
      role: 'diretor',
      nome: 'Diretor sem contexto',
    },
    body: buildValidCreateBody(),
    bridgeOverrides: {
      findFuncionarioByCpfAndUnidade: async () => {
        throw new Error('controller-should-not-run-without-canonical-context');
      },
    },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    success: false,
    error: 'UNIDADE_ID_REQUIRED',
  });
});

test('GET /gestor/api/funcionarios/:id com diretor sem contexto canonico ativo retorna 400 na borda real', async () => {
  const response = await requestFuncionarioRouterWithSession({
    method: 'get',
    pathname: '/gestor/api/funcionarios/507f1f77bcf86cd799439011',
    sessionUser: {
      id: 'session-diretor-sem-contexto',
      email: 'diretor.funcionario.sem.contexto@example.com',
      role: 'diretor',
      nome: 'Diretor sem contexto',
    },
    bridgeOverrides: {
      findFuncionarioByIdPopulateRefs: async () => {
        throw new Error('controller-should-not-run-without-canonical-context');
      },
    },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    success: false,
    error: 'UNIDADE_ID_REQUIRED',
  });
});
