import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/funcionarioApiController.js');
const SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function buildFunctionFromSource(functionSource, context = {}) {
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function buildObjectFromSource(source, context = {}) {
  const script = new vm.Script(source);
  return script.runInNewContext(context);
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function buildSharedUpdateCoreSource() {
  return `async function createFuncionarioUpdateSharedCore({ id, body, canonicalUnitId } = {}) {
    const funcionario = await findFuncionarioById(id, canonicalUnitId || null);
    if (!funcionario) {
      return { kind: 'not_found' };
    }

    if (body?.unidade_id && !requestedUnitMatchesCanonicalContext(canonicalUnitId, body.unidade_id)) {
      return { kind: 'unit_not_allowed' };
    }

    coerceBodyValues(body);
    applyDateNormalizationToBody(body);

    if (body?.pis && !isValidPIS(String(body.pis).replace(/\D/g, ''))) {
      return { kind: 'validation_error', field: 'pis', message: 'PIS invalido' };
    }

    if (body?.pis_pasep && !isValidPIS(String(body.pis_pasep).replace(/\D/g, ''))) {
      return { kind: 'validation_error', field: 'pis_pasep', message: 'PIS/PASEP invalido' };
    }

    let ops = buildUpdateOpsFromBody(body);

    if (ops.$set && Object.prototype.hasOwnProperty.call(ops.$set, 'cpf')) {
      const rawCpf = String(ops.$set.cpf || '').replace(/\D/g, '');
      if (!rawCpf) {
        delete ops.$set.cpf;
        ops.$unset.cpf = 1;
      } else if (rawCpf.length !== 11) {
        return { kind: 'validation_error', field: 'cpf', message: 'CPF invalido' };
      } else {
        ops.$set.cpf = rawCpf;
      }
    }

    if (ops.$set) {
      if (Array.isArray(ops.$set.dependentes)) {
        ops.$set.dependentes = ops.$set.dependentes.map((dependente) => {
          if (dependente && dependente.cpf) dependente.cpf = String(dependente.cpf).replace(/\D/g, '');
          return dependente;
        });
      }

      Object.keys(ops.$set).forEach((key) => {
        if (key === 'anexos' || key.startsWith('anexos.')) delete ops.$set[key];
      });
    }

    if (ops.$unset) {
      Object.keys(ops.$unset).forEach((key) => {
        if (key === 'anexos' || key.startsWith('anexos.')) delete ops.$unset[key];
      });
    }

    if (ops.$set && Object.prototype.hasOwnProperty.call(ops.$set, 'salario_base')) {
      const raw = String(ops.$set.salario_base || '').trim();
      if (!raw) {
        delete ops.$set.salario_base;
        ops.$unset.salario_base = 1;
      } else {
        const parsed = Number(raw.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.'));
        if (Number.isFinite(parsed)) ops.$set.salario_base = parsed;
        else {
          delete ops.$set.salario_base;
          ops.$unset.salario_base = 1;
        }
      }
    }

    if (body?.pcd === 'N') {
      ops.$unset.tipo_deficiencia = 1;
      ops.$unset.cid = 1;
    }

    if (canonicalUnitId && Object.prototype.hasOwnProperty.call(body || {}, 'unidade_id')) {
      ops.$set.unidade_id = canonicalUnitId;
      if (ops.$unset?.unidade_id) delete ops.$unset.unidade_id;
    }

    ops = filterOpsBySchema(ops);
    ops = protectRequiredFieldsFromUnset(ops);

    return {
      kind: 'ready',
      funcionario,
      effectiveUnitId: canonicalUnitId || normalizeUnitId(funcionario?.unidade_id) || null,
      ops,
    };
  }`;
}

function buildDelegatedOwnersSource() {
  return `({
    async updateIncrementalOwner(req, deps) {
      const shared = await createFuncionarioUpdateSharedCore({
        id: req.params.id,
        body: req.body,
        canonicalUnitId: deps.getCanonicalContextUnitId(req),
      });

      if (shared.kind === 'not_found') return deps.notFound('Funcionário não encontrado');
      if (shared.kind === 'unit_not_allowed') return deps.notFound('Unidade não encontrada');
      if (shared.kind === 'validation_error') return deps.badRequest(shared.message, { campo: shared.field });

      await deps.applyIncrementalMediaMutations({
        req,
        funcionario: shared.funcionario,
        ops: shared.ops,
      });

      await deps.persistUpdate({
        id: req.params.id,
        ops: shared.ops,
        canonicalUnitId: shared.effectiveUnitId,
      });

      return deps.ok({ updated: true });
    },

    async updateFullOwner(req, deps) {
      const shared = await createFuncionarioUpdateSharedCore({
        id: req.params.id,
        body: req.body,
        canonicalUnitId: deps.getCanonicalContextUnitId(req),
      });

      if (shared.kind === 'not_found') return deps.notFound('Funcionário não encontrado');
      if (shared.kind === 'unit_not_allowed') return deps.notFound('Unidade não encontrada');
      if (shared.kind === 'validation_error') return deps.badRequest(shared.message, { campo: shared.field });

      await deps.applyFullFotoMutation({
        req,
        funcionario: shared.funcionario,
        ops: shared.ops,
      });
      await deps.applyFullAnexosMutation({
        req,
        funcionario: shared.funcionario,
        ops: shared.ops,
      });
      await deps.applyFullBiometriaMutation({
        req,
        funcionario: shared.funcionario,
        ops: shared.ops,
      });

      await deps.persistUpdate({
        id: req.params.id,
        ops: shared.ops,
        canonicalUnitId: shared.effectiveUnitId,
      });

      return deps.ok({ updated: true });
    },
  })`;
}

test('estado real atual: o controller delega o miolo tecnico compartilhado dos dois updates para a seam unica', () => {
  assert.match(SOURCE, /export async function updateFuncionarioIncremental\(req,res\)/);
  assert.match(SOURCE, /export async function updateFuncionario\(req,res\)/);
  assert.match(SOURCE, /async function createFuncionarioUpdateSharedCore\(\{ id, body, canonicalUnitId \} = \{\}\)/);
  assert.match(SOURCE, /function requestedUnitMatchesCanonicalContext\(canonicalUnitId, requestedUnitId\)/);
  assert.match(SOURCE, /function coerceBodyValues\(body\)/);
  assert.equal(countOccurrences(SOURCE, "createFuncionarioUpdateSharedCore({ id, body: req.body, canonicalUnitId });"), 2);

  assert.equal(countOccurrences(SOURCE, "let ops = buildUpdateOpsFromBody(body);"), 1);
  assert.equal(countOccurrences(SOURCE, "ops = filterOpsBySchema(ops);"), 1);
  assert.equal(countOccurrences(SOURCE, "ops = protectRequiredFieldsFromUnset(ops);"), 1);
  assert.equal(countOccurrences(SOURCE, "if(body?.pis && !isValidPIS(String(body.pis).replace(/\\D/g,''))) {"), 1);
  assert.equal(countOccurrences(SOURCE, "if(body?.pis_pasep && !isValidPIS(String(body.pis_pasep).replace(/\\D/g,''))) {"), 1);
  assert.equal(countOccurrences(SOURCE, "if(body?.pcd==='N'){ ops.$unset['tipo_deficiencia']=1; ops.$unset['cid']=1; }"), 1);
  assert.equal(countOccurrences(SOURCE, "if (canonicalUnitId && Object.prototype.hasOwnProperty.call(body || {}, 'unidade_id')) {"), 1);
  assert.doesNotMatch(SOURCE, /let ops = buildUpdateOpsFromBody\(req\.body\);/);
});

test('futura seam unica recebe apenas o contexto minimo do update e concentra somente o miolo tecnico comum', async () => {
  const calls = [];
  const createFuncionarioUpdateSharedCore = buildFunctionFromSource(buildSharedUpdateCoreSource(), {
    findFuncionarioById: async (id, canonicalUnitId) => {
      calls.push(['findFuncionarioById', id, canonicalUnitId]);
      return { _id: id, unidade_id: 'u-origem' };
    },
    requestedUnitMatchesCanonicalContext: (canonicalUnitId, requestedUnitId) => {
      calls.push(['requestedUnitMatchesCanonicalContext', canonicalUnitId, requestedUnitId]);
      return canonicalUnitId === String(requestedUnitId || '').trim();
    },
    coerceBodyValues: (body) => {
      calls.push(['coerceBodyValues']);
      if (Array.isArray(body.data_admissao)) body.data_admissao = body.data_admissao[0];
    },
    applyDateNormalizationToBody: (body) => {
      calls.push(['applyDateNormalizationToBody']);
      if (body.data_admissao === '01/03/2026') body.data_admissao = '2026-03-01';
    },
    isValidPIS: (value) => {
      calls.push(['isValidPIS', value]);
      return true;
    },
    buildUpdateOpsFromBody: (body) => {
      calls.push(['buildUpdateOpsFromBody']);
      return {
        $set: {
          pis: body.pis,
          salario_base: body.salario_base,
          dependentes: body.dependentes,
          unidade_id: body.unidade_id,
          data_admissao: body.data_admissao,
          anexos: ['nao-entra-na-seam'],
        },
        $unset: {
          'anexos.0': 1,
        },
      };
    },
    filterOpsBySchema: (ops) => {
      calls.push(['filterOpsBySchema']);
      return ops;
    },
    protectRequiredFieldsFromUnset: (ops) => {
      calls.push(['protectRequiredFieldsFromUnset']);
      return ops;
    },
    normalizeUnitId: (value) => String(value || '').trim(),
    Object,
    Number,
    String,
    Array,
  });

  const result = await createFuncionarioUpdateSharedCore({
    id: 'func-1',
    canonicalUnitId: 'u-contexto',
    body: {
      unidade_id: 'u-contexto',
      cpf: '123.456.789-09',
      pis: '123.45678.90-1',
      salario_base: '1.234,56',
      pcd: 'N',
      dependentes: [{ nome: 'Dep', cpf: '111.222.333-44' }],
      data_admissao: ['01/03/2026'],
    },
  });

  assert.match(buildSharedUpdateCoreSource(), /createFuncionarioUpdateSharedCore\(\{ id, body, canonicalUnitId \} = \{\}\)/);
  assert.match(buildSharedUpdateCoreSource(), /rawCpf\.length !== 11/);
  assert.match(buildSharedUpdateCoreSource(), /Array\.isArray\(ops\.\$set\.dependentes\)/);
  assert.match(buildSharedUpdateCoreSource(), /Object\.prototype\.hasOwnProperty\.call\(ops\.\$set, 'salario_base'\)/);
  assert.doesNotMatch(buildSharedUpdateCoreSource(), /req\b/);
  assert.doesNotMatch(buildSharedUpdateCoreSource(), /uploadFuncionarioFotoToBlob|reconcileUpdateFuncionarioIncrementalAnexos|reconcileUpdateFuncionarioFullAnexos|reconcileUpdateFuncionarioFullBiometria|updateFuncionarioByIdWithOps|return ok\(|return badRequest\(|return notFound\(/);

  const plainResult = toPlain(result);
  assert.equal(plainResult.kind, 'ready');
  assert.deepEqual(plainResult.funcionario, { _id: 'func-1', unidade_id: 'u-origem' });
  assert.equal(plainResult.effectiveUnitId, 'u-contexto');
  assert.equal(plainResult.ops.$set.pis, '123.45678.90-1');
  assert.equal(plainResult.ops.$set.unidade_id, 'u-contexto');
  assert.equal(plainResult.ops.$set.data_admissao, '2026-03-01');
  assert.equal('anexos' in plainResult.ops.$set, false);
  assert.equal('anexos.0' in plainResult.ops.$unset, false);
  assert.equal(plainResult.ops.$unset.tipo_deficiencia, 1);
  assert.equal(plainResult.ops.$unset.cid, 1);

  assert.deepEqual(calls, [
    ['findFuncionarioById', 'func-1', 'u-contexto'],
    ['requestedUnitMatchesCanonicalContext', 'u-contexto', 'u-contexto'],
    ['coerceBodyValues'],
    ['applyDateNormalizationToBody'],
    ['isValidPIS', '123.45678.90-1'],
    ['buildUpdateOpsFromBody'],
    ['filterOpsBySchema'],
    ['protectRequiredFieldsFromUnset'],
  ]);
});

test('owners futuros continuam HTTP owners e mantem fora da seam foto, anexos, biometria, persistencia e resposta final', async () => {
  const sharedCalls = [];
  const mediaCalls = [];

  const owners = buildObjectFromSource(buildDelegatedOwnersSource(), {
    createFuncionarioUpdateSharedCore: async (input) => {
      sharedCalls.push(toPlain(input));
      return {
        kind: 'ready',
        funcionario: { _id: input.id, unidade_id: 'u-contexto' },
        effectiveUnitId: input.canonicalUnitId,
        ops: { $set: { nome: 'Ajustado' }, $unset: {} },
      };
    },
  });

  const deps = {
    getCanonicalContextUnitId: (req) => req.scopeUnitId,
    notFound: (message) => ({ kind: 'http_not_found', message }),
    badRequest: (message, meta) => ({ kind: 'http_bad_request', message, meta }),
    ok: (payload) => ({ kind: 'http_ok', payload }),
    applyIncrementalMediaMutations: async ({ funcionario, ops }) => {
      mediaCalls.push(['incremental', funcionario._id, toPlain(ops)]);
    },
    applyFullFotoMutation: async ({ funcionario, ops }) => {
      mediaCalls.push(['full-foto', funcionario._id, toPlain(ops)]);
    },
    applyFullAnexosMutation: async ({ funcionario, ops }) => {
      mediaCalls.push(['full-anexos', funcionario._id, toPlain(ops)]);
    },
    applyFullBiometriaMutation: async ({ funcionario, ops }) => {
      mediaCalls.push(['full-biometria', funcionario._id, toPlain(ops)]);
    },
    persistUpdate: async ({ id, ops, canonicalUnitId }) => {
      mediaCalls.push(['persist', id, canonicalUnitId, toPlain(ops)]);
    },
  };

  const incrementalResult = await owners.updateIncrementalOwner({
    params: { id: 'func-inc' },
    body: { nome: 'Inc' },
    scopeUnitId: 'u-inc',
  }, deps);

  const fullResult = await owners.updateFullOwner({
    params: { id: 'func-full' },
    body: { nome: 'Full' },
    scopeUnitId: 'u-full',
  }, deps);

  assert.deepEqual(sharedCalls, [
    { id: 'func-inc', body: { nome: 'Inc' }, canonicalUnitId: 'u-inc' },
    { id: 'func-full', body: { nome: 'Full' }, canonicalUnitId: 'u-full' },
  ]);

  assert.deepEqual(mediaCalls, [
    ['incremental', 'func-inc', { $set: { nome: 'Ajustado' }, $unset: {} }],
    ['persist', 'func-inc', 'u-inc', { $set: { nome: 'Ajustado' }, $unset: {} }],
    ['full-foto', 'func-full', { $set: { nome: 'Ajustado' }, $unset: {} }],
    ['full-anexos', 'func-full', { $set: { nome: 'Ajustado' }, $unset: {} }],
    ['full-biometria', 'func-full', { $set: { nome: 'Ajustado' }, $unset: {} }],
    ['persist', 'func-full', 'u-full', { $set: { nome: 'Ajustado' }, $unset: {} }],
  ]);

  assert.deepEqual(toPlain(incrementalResult), { kind: 'http_ok', payload: { updated: true } });
  assert.deepEqual(toPlain(fullResult), { kind: 'http_ok', payload: { updated: true } });

  assert.match(buildDelegatedOwnersSource(), /applyIncrementalMediaMutations/);
  assert.match(buildDelegatedOwnersSource(), /applyFullFotoMutation/);
  assert.match(buildDelegatedOwnersSource(), /applyFullAnexosMutation/);
  assert.match(buildDelegatedOwnersSource(), /applyFullBiometriaMutation/);
  assert.match(buildDelegatedOwnersSource(), /persistUpdate/);
});