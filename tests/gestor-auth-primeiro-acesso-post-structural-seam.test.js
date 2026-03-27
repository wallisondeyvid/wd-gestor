import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CONTROLLER_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/controllers/authController.js');
const SERVICE_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/services/auth/primeiroAcessoExecution.service.js');

function importFresh(filePath, token) {
  return import(`${pathToFileURL(filePath).href}?case=${token}`);
}

function createRes() {
  return {
    statusCode: 200,
    location: null,
    redirect(statusOrLocation, maybeLocation) {
      if (typeof maybeLocation === 'undefined') {
        this.statusCode = 302;
        this.location = statusOrLocation;
        return this;
      }
      this.statusCode = statusOrLocation;
      this.location = maybeLocation;
      return this;
    },
  };
}

test('owner encaminha userId, senhaHash e maxTimeMS ao service fino e preserva o redirect feliz', async () => {
  mock.reset();

  const hashCalls = [];
  const serviceCalls = [];

  await mock.module('bcryptjs', {
    defaultExport: {
      hash: async (senha, rounds) => {
        hashCalls.push({ senha, rounds });
        return 'hash-gerado';
      },
    },
  });

  await mock.module('#modules/gestor/app/services/auth/primeiroAcessoExecution.service.js', {
    namedExports: {
      primeiroAcessoExecutionService: async (input) => {
        serviceCalls.push(input);
        return { kind: 'updated' };
      },
    },
  });

  const { primeiroAcessoPost } = await importFresh(CONTROLLER_FILE, 'owner-updated');

  const req = {
    baseUrl: '/gestor',
    session: { user: { id: '507f1f77bcf86cd799439011' } },
    body: { senha: 'NovaSenha@123', confirmar_senha: 'NovaSenha@123' },
    get: () => '',
  };
  const res = createRes();

  await primeiroAcessoPost(req, res);

  assert.deepEqual(hashCalls, [{ senha: 'NovaSenha@123', rounds: 10 }]);
  assert.deepEqual(serviceCalls, [{
    userId: '507f1f77bcf86cd799439011',
    senhaHash: 'hash-gerado',
    maxTimeMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 5000),
  }]);
  assert.equal(res.statusCode, 302);
  assert.equal(res.location, '/gestor/dashboard');
});

test('owner preserva o mapeamento not_found para redirect de login', async () => {
  mock.reset();

  await mock.module('bcryptjs', {
    defaultExport: { hash: async () => 'hash-gerado' },
  });

  await mock.module('#modules/gestor/app/services/auth/primeiroAcessoExecution.service.js', {
    namedExports: {
      primeiroAcessoExecutionService: async () => ({ kind: 'not_found' }),
    },
  });

  const { primeiroAcessoPost } = await importFresh(CONTROLLER_FILE, 'owner-not-found');

  const req = {
    baseUrl: '/gestor',
    session: { user: { id: '507f1f77bcf86cd799439012' } },
    body: { senha: 'NovaSenha@123', confirmar_senha: 'NovaSenha@123' },
    get: () => '',
  };
  const res = createRes();

  await primeiroAcessoPost(req, res);

  assert.equal(res.statusCode, 303);
  assert.equal(res.location, '/gestor/login');
});

test('owner preserva o mapeamento de save_failed para erro de servidor com redirect local', async () => {
  mock.reset();

  await mock.module('bcryptjs', {
    defaultExport: { hash: async () => 'hash-gerado' },
  });

  await mock.module('#modules/gestor/app/services/auth/primeiroAcessoExecution.service.js', {
    namedExports: {
      primeiroAcessoExecutionService: async () => ({ kind: 'save_failed', error: new Error('falha-save') }),
    },
  });

  const { primeiroAcessoPost } = await importFresh(CONTROLLER_FILE, 'owner-save-failed');

  const req = {
    baseUrl: '/gestor',
    session: { user: { id: '507f1f77bcf86cd799439013' } },
    body: { senha: 'NovaSenha@123', confirmar_senha: 'NovaSenha@123' },
    get: () => '',
  };
  const res = createRes();

  await primeiroAcessoPost(req, res);

  assert.equal(res.statusCode, 303);
  assert.equal(res.location, '/gestor/primeiroacesso?erro=servidor');
});

test('service consulta o repositorio global, aplica a mutacao e salva o documento', async () => {
  mock.reset();

  const repoCalls = [];
  const maxTimeCalls = [];
  const saveCalls = [];
  const fakeUser = {
    primeiro_acesso: true,
    senha_provisoria: true,
    senha: 'anterior',
    async save() {
      saveCalls.push({
        senha: this.senha,
        primeiro_acesso: this.primeiro_acesso,
        senha_provisoria: this.senha_provisoria,
      });
    },
  };

  await mock.module('#modules/gestor/app/repositories/AuthRepository.js', {
    namedExports: {
      findUserByIdRepo: ({ unitScope, id }) => {
        repoCalls.push({ unitScope, id });
        return {
          maxTimeMS(value) {
            maxTimeCalls.push(value);
            return Promise.resolve(fakeUser);
          },
        };
      },
    },
  });

  const { primeiroAcessoExecutionService } = await importFresh(SERVICE_FILE, 'service-updated');
  const result = await primeiroAcessoExecutionService({
    userId: '507f1f77bcf86cd799439021',
    senhaHash: 'hash-gerado',
    maxTimeMS: 4321,
  });

  assert.deepEqual(repoCalls, [{
    unitScope: { type: 'global', unidadeId: null },
    id: '507f1f77bcf86cd799439021',
  }]);
  assert.deepEqual(maxTimeCalls, [4321]);
  assert.deepEqual(saveCalls, [{
    senha: 'hash-gerado',
    primeiro_acesso: false,
    senha_provisoria: false,
  }]);
  assert.deepEqual(result, { kind: 'updated' });
});

test('service retorna already_completed sem salvar quando o usuario ja concluiu primeiro acesso', async () => {
  mock.reset();

  let saveCalled = false;

  await mock.module('#modules/gestor/app/repositories/AuthRepository.js', {
    namedExports: {
      findUserByIdRepo: () => Promise.resolve({
        primeiro_acesso: false,
        senha_provisoria: false,
        async save() {
          saveCalled = true;
        },
      }),
    },
  });

  const { primeiroAcessoExecutionService } = await importFresh(SERVICE_FILE, 'service-already-completed');
  const result = await primeiroAcessoExecutionService({
    userId: '507f1f77bcf86cd799439022',
    senhaHash: 'hash-gerado',
    maxTimeMS: 0,
  });

  assert.deepEqual(result, { kind: 'already_completed' });
  assert.equal(saveCalled, false);
});

test('service retorna save_failed quando o save do documento falha', async () => {
  mock.reset();

  await mock.module('#modules/gestor/app/repositories/AuthRepository.js', {
    namedExports: {
      findUserByIdRepo: () => Promise.resolve({
        primeiro_acesso: true,
        senha_provisoria: true,
        async save() {
          throw new Error('falha-save');
        },
      }),
    },
  });

  const { primeiroAcessoExecutionService } = await importFresh(SERVICE_FILE, 'service-save-failed');
  const result = await primeiroAcessoExecutionService({
    userId: '507f1f77bcf86cd799439023',
    senhaHash: 'hash-gerado',
    maxTimeMS: 0,
  });

  assert.equal(result.kind, 'save_failed');
  assert.equal(result.error?.message, 'falha-save');
});