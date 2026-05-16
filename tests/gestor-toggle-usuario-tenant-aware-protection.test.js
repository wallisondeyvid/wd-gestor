import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/userController.js');
const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/usuarios/toggleUsuarioExecution.service.js');

const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const SERVICE_SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');

// Guardrail semantico: write por id aqui segue operacao administrativa potencialmente ampla,
// nao precedente generico para write global fora do corredor explicitamente documentado.

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao foi possivel localizar a assinatura: ${signature}`);

  const bodyStart = source.indexOf('{', start);
  assert.ok(bodyStart >= 0, `Nao foi possivel localizar o corpo da funcao: ${signature}`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  assert.fail(`Nao foi possivel isolar a funcao: ${signature}`);
}

function buildFunction(source, signature, dependencies = {}) {
  const block = extractFunction(source, signature).replace('export ', '');
  const nameMatch = signature.match(/function\s+([A-Za-z0-9_]+)/);
  assert.ok(nameMatch, `Nao foi possivel inferir o nome da funcao: ${signature}`);

  const depNames = Object.keys(dependencies);
  const prelude = depNames.map((depName) => `const ${depName} = __deps.${depName};`).join('\n');
  const script = new vm.Script(`(function (__deps) {\n${prelude}\n${block}\nreturn ${nameMatch[1]};\n})`);
  return script.runInNewContext({})(dependencies);
}

function createReq(overrides = {}) {
  const headers = overrides.headers || {};
  return {
    params: overrides.params || {},
    user: overrides.user || null,
    xhr: overrides.xhr || false,
    get(name) {
      return headers[name] || headers[String(name || '').toLowerCase()] || undefined;
    },
  };
}

function createResCapture() {
  return {
    statusCode: 200,
    body: undefined,
    sentText: undefined,
    redirectedTo: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.sentText = payload;
      this.body = payload;
      return this;
    },
    redirect(location) {
      this.statusCode = 302;
      this.redirectedTo = location;
      return this;
    },
  };
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('toggle tenant-aware: cadeia owner -> lookup -> service -> saveUserDoc permanece explicita sem abrir big-bang', async () => {
  const ownerBlock = extractFunction(CONTROLLER_SOURCE, 'export async function toggleUsuario');
  const serviceBlock = extractFunction(SERVICE_SOURCE, 'export async function toggleUsuarioExecutionService');

  const lookupIndex = ownerBlock.indexOf('const user = await findUserById(req.params.id);');
  const seamIndex = ownerBlock.indexOf('await toggleUsuarioExecutionService({ user });');
  const xhrIndex = ownerBlock.indexOf('return res.json({ success:true, id: user._id, ativo: user.ativo });');
  const redirectIndex = ownerBlock.indexOf("res.redirect('/gestor/usuarios');");
  const mutateIndex = serviceBlock.indexOf('user.ativo = !user.ativo;');
  const saveIndex = serviceBlock.indexOf('await saveUserDoc(user);');

  assert.ok(lookupIndex >= 0, 'Owner precisa carregar o usuario alvo por id.');
  assert.ok(seamIndex >= 0, 'Owner precisa delegar ao service fino.');
  assert.ok(xhrIndex >= 0, 'Owner precisa preservar o contrato JSON XHR.');
  assert.ok(redirectIndex >= 0, 'Owner precisa preservar o redirect nao XHR.');
  assert.ok(mutateIndex >= 0, 'Service precisa alternar user.ativo.');
  assert.ok(saveIndex >= 0, 'Service precisa persistir via saveUserDoc(user).');
  assert.ok(lookupIndex < seamIndex, 'Lookup por id precisa ocorrer antes da delegacao.');
  assert.ok(mutateIndex < saveIndex, 'Mutacao do ativo precisa ocorrer antes do save.');
});

test('toggle tenant-aware: usuario inexistente nao delega ao service nem chama saveUserDoc', async () => {
  const serviceCalls = [];
  const toggleUsuario = buildFunction(CONTROLLER_SOURCE, 'export async function toggleUsuario', {
    findUserById: async () => null,
    toggleUsuarioExecutionService: async (input) => {
      serviceCalls.push(input);
      throw new Error('nao deveria delegar sem usuario');
    },
  });

  const req = createReq({
    params: { id: 'u-ausente' },
    user: { _id: 'admin-1', role: 'admin', isMaster: false },
  });
  const res = createResCapture();

  await toggleUsuario(req, res);

  assert.equal(serviceCalls.length, 0);
  assert.equal(res.statusCode, 404);
  assert.equal(res.sentText, 'Usuário não encontrado');
});

test('toggle tenant-aware: owner delega user carregado por id ao service e preserva o contrato XHR observado', async () => {
  const serviceCalls = [];
  const user = { _id: 'u-1', role: 'user', ativo: true };
  const toggleUsuario = buildFunction(CONTROLLER_SOURCE, 'export async function toggleUsuario', {
    findUserById: async (id) => {
      assert.equal(id, 'u-1');
      return user;
    },
    toggleUsuarioExecutionService: async (input) => {
      serviceCalls.push(input);
      input.user.ativo = false;
      return input.user;
    },
  });

  const req = createReq({
    params: { id: 'u-1' },
    user: { _id: 'admin-1', role: 'admin', isMaster: false },
    xhr: true,
  });
  const res = createResCapture();

  await toggleUsuario(req, res);

  assert.equal(serviceCalls.length, 1);
  assert.equal(serviceCalls[0].user, user);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(toPlainJson(res.body), {
    success: true,
    id: 'u-1',
    ativo: false,
  });
});

test('toggle tenant-aware: usuario ativo vira inativo antes de saveUserDoc e o proprio documento mutado e persistido', async () => {
  const bridgeCalls = [];
  const user = { _id: 'u-ativo', ativo: true };
  const toggleUsuarioExecutionService = buildFunction(
    SERVICE_SOURCE,
    'export async function toggleUsuarioExecutionService',
    {
      saveUserDoc: async (userDoc) => {
        bridgeCalls.push(toPlainJson(userDoc));
        return userDoc;
      },
    },
  );

  const result = await toggleUsuarioExecutionService({ user });

  assert.deepEqual(bridgeCalls, [{ _id: 'u-ativo', ativo: false }]);
  assert.equal(user.ativo, false);
  assert.equal(result, user);
});

test('toggle tenant-aware: usuario inativo vira ativo antes de saveUserDoc e o proprio documento mutado e persistido', async () => {
  const bridgeCalls = [];
  const user = { _id: 'u-inativo', ativo: false };
  const toggleUsuarioExecutionService = buildFunction(
    SERVICE_SOURCE,
    'export async function toggleUsuarioExecutionService',
    {
      saveUserDoc: async (userDoc) => {
        bridgeCalls.push(toPlainJson(userDoc));
        return userDoc;
      },
    },
  );

  const result = await toggleUsuarioExecutionService({ user });

  assert.deepEqual(bridgeCalls, [{ _id: 'u-inativo', ativo: true }]);
  assert.equal(user.ativo, true);
  assert.equal(result, user);
});

test('toggle tenant-aware: erro de saveUserDoc propaga o contrato atual do service sem esconder o write administrativo', async () => {
  const saveCalls = [];
  const user = { _id: 'u-erro', ativo: true };
  const expectedError = new Error('forced-toggle-save-failure');
  const toggleUsuarioExecutionService = buildFunction(
    SERVICE_SOURCE,
    'export async function toggleUsuarioExecutionService',
    {
      saveUserDoc: async (userDoc) => {
        saveCalls.push(toPlainJson(userDoc));
        throw expectedError;
      },
    },
  );

  await assert.rejects(
    () => toggleUsuarioExecutionService({ user }),
    (error) => error === expectedError,
  );

  assert.deepEqual(saveCalls, [{ _id: 'u-erro', ativo: false }]);
  assert.equal(user.ativo, false);
});