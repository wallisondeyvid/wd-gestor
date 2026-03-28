import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const GESTOR_APP_PATH = path.join(process.cwd(), 'src/modules/gestor/app/gestor-app.js');
const GESTOR_APP_SOURCE = fs.readFileSync(GESTOR_APP_PATH, 'utf8');

function extractAppUseCallback(source, anchor) {
  const start = source.indexOf(anchor);
  assert.ok(start >= 0, `Nao encontrou middleware: ${anchor}`);

  const asyncStart = source.indexOf('async (req, res, next) => {', start);
  assert.ok(asyncStart >= 0, `Nao encontrou callback async para: ${anchor}`);

  const braceStart = source.indexOf('{', asyncStart);
  assert.ok(braceStart >= 0, `Nao encontrou bloco do callback para: ${anchor}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(asyncStart, index + 1);
      }
    }
  }

  throw new Error(`Nao conseguiu extrair callback do middleware: ${anchor}`);
}

function buildFunction(functionSource, context = {}) {
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createCharacterizedPopulateUserMiddleware(context = {}) {
  const original = extractAppUseCallback(
    GESTOR_APP_SOURCE,
    '// Middleware global: popula/atualiza req.user a partir da sessão SEMPRE que houver sessão válida'
  );

  const replaced = original.replace(
    /const sessionAuthContext = req\.session && req\.session\.gestorAuthContext;[\s\S]*?const contextualFuncionarioId = hasProjectedAuthContext\s*\? \(sessionUser\.funcionario_id \|\| sessionAuthContext\?\.active_funcionario_id \|\| null\)\s*:\s*null;/,
    `const projection = resolveContextualUserProjection({
      sessionUser,
      sessionAuthContext: req.session && req.session.gestorAuthContext,
    });
    const contextualUnidadeId = projection.contextualUnidadeId;
    const contextualFuncionarioId = projection.contextualFuncionarioId;`
  );

  assert.notEqual(replaced, original, 'Nao conseguiu caracterizar o seam de projecao contextual');

  return buildFunction(replaced, context);
}

test('bootstrap do Gestor preserva o wiring do middleware e usa apenas sessionUser e sessionAuthContext para projetar req.user contextual', async () => {
  const projectionCalls = [];
  const userLookupCalls = [];

  const middleware = createCharacterizedPopulateUserMiddleware({
    mongoose: { connection: { readyState: 1 } },
    process: { env: { MONGO_QUERY_TIMEOUT_MS: '3000' } },
    resolveContextualUserProjection(input) {
      projectionCalls.push(JSON.parse(JSON.stringify(input)));
      return {
        contextualUnidadeId: input.sessionAuthContext.active_unidade_id,
        contextualFuncionarioId: input.sessionAuthContext.active_funcionario_id,
      };
    },
    async findUserByEmailCondLeanMaxTimeMs(query, maxTimeMS) {
      userLookupCalls.push({ query, maxTimeMS });
      return {
        _id: '507f1f77bcf86cd799439901',
        nome: 'Diretor Banco',
        email: 'contexto@gestor.test',
        role: 'diretor',
        unidade_id: null,
        funcionario_id: null,
        foto: null,
      };
    },
    console,
  });

  const req = {
    app: { locals: { skipDb: false } },
    skipAuth: false,
    session: {
      user: {
        id: '507f1f77bcf86cd799439901',
        email: 'Contexto@Gestor.test',
        nome: 'Diretor Contextual',
        role: 'diretor',
        unidade_id: 'legacy-unit-ignored',
        funcionario_id: 'legacy-func-ignored',
        auth_version: 'phase3',
      },
      gestorAuthContext: {
        active_unidade_id: '507f191e810c19729de860ea',
        active_funcionario_id: 'func-ctx-901',
      },
    },
  };

  let nextCalled = false;
  await middleware(req, {}, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(projectionCalls.length, 1);
  assert.deepEqual(projectionCalls[0], {
    sessionUser: {
      id: '507f1f77bcf86cd799439901',
      email: 'Contexto@Gestor.test',
      nome: 'Diretor Contextual',
      role: 'diretor',
      unidade_id: 'legacy-unit-ignored',
      funcionario_id: 'legacy-func-ignored',
      auth_version: 'phase3',
    },
    sessionAuthContext: {
      active_unidade_id: '507f191e810c19729de860ea',
      active_funcionario_id: 'func-ctx-901',
    },
  });
  assert.deepEqual(toPlainJson(userLookupCalls), [{
    query: { email: 'contexto@gestor.test' },
    maxTimeMS: 3000,
  }]);
  assert.deepEqual(toPlainJson(req.user), {
    id: '507f1f77bcf86cd799439901',
    _id: '507f1f77bcf86cd799439901',
    nome: 'Diretor Banco',
    email: 'contexto@gestor.test',
    role: 'diretor',
    isMaster: false,
    unidade_id: '507f191e810c19729de860ea',
    funcionario_id: 'func-ctx-901',
    foto: null,
  });
});

test('bootstrap do Gestor continua decidindo o fallback residual no owner quando o userDoc nao existe', async () => {
  const projectionCalls = [];

  const middleware = createCharacterizedPopulateUserMiddleware({
    mongoose: { connection: { readyState: 1 } },
    process: { env: { MONGO_QUERY_TIMEOUT_MS: '3000' } },
    resolveContextualUserProjection(input) {
      projectionCalls.push(JSON.parse(JSON.stringify(input)));
      return {
        contextualUnidadeId: input.sessionAuthContext.active_unidade_id,
        contextualFuncionarioId: input.sessionAuthContext.active_funcionario_id,
      };
    },
    async findUserByEmailCondLeanMaxTimeMs() {
      return null;
    },
    console,
  });

  const req = {
    app: { locals: { skipDb: false } },
    skipAuth: false,
    session: {
      user: {
        id: '507f1f77bcf86cd799439902',
        email: 'fallback@gestor.test',
        nome: 'Usuario Fallback',
        role: 'diretor',
        unidade_id: 'legacy-unit-fallback',
        funcionario_id: 'legacy-func-fallback',
        auth_version: 'phase3',
      },
      gestorAuthContext: {
        active_unidade_id: '507f191e810c19729de860eb',
        active_funcionario_id: 'func-ctx-902',
      },
    },
  };

  let nextCalled = false;
  await middleware(req, {}, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(projectionCalls.length, 1);
  assert.deepEqual(toPlainJson(req.user), {
    id: '507f1f77bcf86cd799439902',
    _id: '507f1f77bcf86cd799439902',
    nome: 'Usuario Fallback',
    email: 'fallback@gestor.test',
    role: 'diretor',
    isMaster: false,
    unidade_id: 'legacy-unit-fallback',
    funcionario_id: 'legacy-func-fallback',
    foto: null,
  });
});