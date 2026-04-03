import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/recursoApiController.js');
const CREATE_CORE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/utils/processCreateRecursoCore.js');
const UPDATE_CORE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/utils/processUpdateRecursoCore.js');
const POLICY_CORE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/recursos/createRecursoContextPolicyCore.js');
const LIST_SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/recursos/listarRecursos.service.js');
const DELETE_SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/recursos/deleteRecursoScoped.service.js');
const GET_CORE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/utils/getRecursoByIdCore.js');

const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const CREATE_CORE_SOURCE = fs.readFileSync(CREATE_CORE_PATH, 'utf8');
const UPDATE_CORE_SOURCE = fs.readFileSync(UPDATE_CORE_PATH, 'utf8');
const POLICY_CORE_SOURCE = fs.readFileSync(POLICY_CORE_PATH, 'utf8');
const LIST_SERVICE_SOURCE = fs.readFileSync(LIST_SERVICE_PATH, 'utf8');
const DELETE_SERVICE_SOURCE = fs.readFileSync(DELETE_SERVICE_PATH, 'utf8');
const GET_CORE_SOURCE = fs.readFileSync(GET_CORE_PATH, 'utf8');

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

function buildRecursoWriteValidationCoreSource() {
  return `function createRecursoWriteValidationCore({
    findRecursosByFiltroComUnidadeLean,
    findOutroRecursoByPlacaUpper,
    findOutroRecursoByChassiUpper,
    findOutroRecursoByRenavam,
  } = {}) {
    const placaRegexAntiga = /^[A-Z]{3}-[0-9]{4}$/;
    const placaRegexMercosul = /^[A-Z]{3}-[0-9][A-Z][0-9]{2}$/;

    function normalizePlaca(value) {
      return String(value || '').trim().toUpperCase();
    }

    function normalizeChassi(value) {
      return String(value || '').trim().toUpperCase();
    }

    function ensurePlacaFormat(placa) {
      const normalizedPlaca = normalizePlaca(placa);
      if (!normalizedPlaca) return { ok: true, normalizedPlaca: '' };
      const isValid = placaRegexAntiga.test(normalizedPlaca) || placaRegexMercosul.test(normalizedPlaca);
      if (!isValid) return { ok: false, error: 'invalid_placa_format' };
      return { ok: true, normalizedPlaca };
    }

    async function validateCreate({ requestedUnitId, tipo, placa, chassi, renavam, ano, mod, marca, modelo, cor }) {
      const placaResult = ensurePlacaFormat(placa);
      if (!placaResult.ok) return { error: placaResult.error };

      const normalizedPlaca = placaResult.normalizedPlaca;
      const normalizedChassi = normalizeChassi(chassi);

      if ((await findRecursosByFiltroComUnidadeLean({ unidade_id: requestedUnitId, placa: normalizedPlaca })).length > 0) {
        return { error: 'duplicate_placa' };
      }
      if ((await findRecursosByFiltroComUnidadeLean({ unidade_id: requestedUnitId, chassi: normalizedChassi })).length > 0) {
        return { error: 'duplicate_chassi' };
      }
      if ((await findRecursosByFiltroComUnidadeLean({ unidade_id: requestedUnitId, renavam })).length > 0) {
        return { error: 'duplicate_renavam' };
      }

      return {
        data: {
          unidade_id: requestedUnitId,
          tipo,
          placa: normalizedPlaca,
          chassi: normalizedChassi,
          renavam,
          ano: parseInt(ano),
          mod: parseInt(mod),
          marca,
          modelo,
          cor,
          ativo: true,
        },
      };
    }

    async function validateUpdate({ id, unidadeEfetiva, recurso, tipo, placa, chassi, renavam, ano, mod, marca, modelo, cor, ativo }) {
      const placaResult = placa ? ensurePlacaFormat(placa) : { ok: true, normalizedPlaca: recurso?.placa || '' };
      if (!placaResult.ok) return { error: placaResult.error };

      const normalizedPlaca = placa ? placaResult.normalizedPlaca : recurso.placa;
      const normalizedChassi = chassi ? normalizeChassi(chassi) : recurso.chassi;

      if (placa && normalizedPlaca !== recurso.placa && await findOutroRecursoByPlacaUpper(id, normalizedPlaca, unidadeEfetiva)) {
        return { error: 'duplicate_placa' };
      }
      if (chassi && normalizedChassi !== recurso.chassi && await findOutroRecursoByChassiUpper(id, normalizedChassi, unidadeEfetiva)) {
        return { error: 'duplicate_chassi' };
      }
      if (renavam && renavam !== recurso.renavam && await findOutroRecursoByRenavam(id, renavam, unidadeEfetiva)) {
        return { error: 'duplicate_renavam' };
      }

      return {
        data: {
          unidade_id: unidadeEfetiva,
          tipo,
          placa: normalizedPlaca,
          chassi: normalizedChassi,
          renavam,
          ano: ano ? parseInt(ano) : recurso.ano,
          mod: mod ? parseInt(mod) : recurso.mod,
          marca,
          modelo,
          cor,
          ativo: ativo !== undefined ? ativo : recurso.ativo,
        },
      };
    }

    return {
      ensurePlacaFormat,
      validateCreate,
      validateUpdate,
    };
  }`;
}

function buildDelegatedOwnersSource() {
  return `({
    async createOwner(req, res, deps) {
      const requestedUnitId = String(req.body?.unidade_id || '').trim();
      const validation = await deps.writeValidation.validateCreate({
        requestedUnitId,
        tipo: req.body?.tipo,
        placa: req.body?.placa,
        chassi: req.body?.chassi,
        renavam: req.body?.renavam,
        ano: req.body?.ano,
        mod: req.body?.mod,
        marca: req.body?.marca,
        modelo: req.body?.modelo,
        cor: req.body?.cor,
      });

      if (validation?.error) return deps.badRequest(res, validation.error);

      const created = await deps.createRecursoDb(validation.data);
      return deps.created(res, created._id, { data: created });
    },

    async updateOwner(req, res, deps) {
      const unidadeEfetiva = String(req.body?.unidade_id || '').trim() || null;
      const recurso = await deps.findRecursoByIdComUnidadeNome(req.params.id, unidadeEfetiva);
      if (!recurso) return deps.notFound(res, 'Recurso não encontrado');

      const validation = await deps.writeValidation.validateUpdate({
        id: req.params.id,
        unidadeEfetiva,
        recurso,
        tipo: req.body?.tipo,
        placa: req.body?.placa,
        chassi: req.body?.chassi,
        renavam: req.body?.renavam,
        ano: req.body?.ano,
        mod: req.body?.mod,
        marca: req.body?.marca,
        modelo: req.body?.modelo,
        cor: req.body?.cor,
        ativo: req.body?.ativo,
      });

      if (validation?.error) return deps.badRequest(res, validation.error);

      const updated = await deps.updateRecursoByIdComUnidadeNome(req.params.id, validation.data, unidadeEfetiva);
      if (!updated) return deps.notFound(res, 'Recurso não encontrado');

      return deps.ok(res, updated);
    },
  })`;
}

test('estado real atual: escrita semantica de create-update ainda esta repartida entre controller e cores locais', () => {
  assert.match(CONTROLLER_SOURCE, /const placaRegexAntiga = \/\^\[A-Z\]\{3\}-\[0-9\]\{4\}\$\//);
  assert.match(CONTROLLER_SOURCE, /const placaRegexMercosul = \/\^\[A-Z\]\{3\}-\[0-9\]\[A-Z\]\[0-9\]\{2\}\$\//);
  assert.match(CONTROLLER_SOURCE, /processCreateRecursoCore\(/);
  assert.match(CONTROLLER_SOURCE, /processUpdateRecursoCore\(/);
  assert.match(CREATE_CORE_SOURCE, /const normalizedPlaca = placa\.toUpperCase\(\);/);
  assert.match(CREATE_CORE_SOURCE, /const normalizedChassi = chassi\.toUpperCase\(\);/);
  assert.match(CREATE_CORE_SOURCE, /return \{ error: 'duplicate_placa' \};/);
  assert.match(CREATE_CORE_SOURCE, /return \{ error: 'duplicate_chassi' \};/);
  assert.match(CREATE_CORE_SOURCE, /return \{ error: 'duplicate_renavam' \};/);
  assert.match(UPDATE_CORE_SOURCE, /findOutroRecursoByPlacaUpper/);
  assert.match(UPDATE_CORE_SOURCE, /findOutroRecursoByChassiUpper/);
  assert.match(UPDATE_CORE_SOURCE, /findOutroRecursoByRenavam/);
  assert.match(UPDATE_CORE_SOURCE, /placa: placa \? placa\.toUpperCase\(\) : recurso\.placa/);
  assert.match(UPDATE_CORE_SOURCE, /chassi: chassi \? chassi\.toUpperCase\(\) : recurso\.chassi/);

  assert.equal(countOccurrences(CONTROLLER_SOURCE, 'placaRegexAntiga'), 4);
  assert.equal(countOccurrences(CONTROLLER_SOURCE, 'placaRegexMercosul'), 4);
  assert.equal(countOccurrences(CREATE_CORE_SOURCE, "duplicate_placa"), 1);
  assert.equal(countOccurrences(UPDATE_CORE_SOURCE, "duplicate_placa"), 1);

  assert.doesNotMatch(CONTROLLER_SOURCE, /createRecursoWriteValidationCore\(/);
  assert.doesNotMatch(CREATE_CORE_SOURCE, /createRecursoWriteValidationCore\(/);
  assert.doesNotMatch(UPDATE_CORE_SOURCE, /createRecursoWriteValidationCore\(/);
});

test('futura seam unica recebe apenas dados minimos de escrita e dependencias de verificacao', async () => {
  const functionSource = buildRecursoWriteValidationCoreSource();
  assert.match(functionSource, /function createRecursoWriteValidationCore\(\{/);
  assert.doesNotMatch(functionSource, /createRecursoContextPolicyCore|buildListScope|deleteRecursoScopedService|getRecursoByIdCore|mapRecurso/);
  assert.doesNotMatch(functionSource, /createRecursoDb|updateRecursoByIdComUnidadeNome|badRequest|created\(|ok\(|notFound|serverError/);
  assert.doesNotMatch(functionSource, /\breq\b|\bres\b/);

  const calls = [];
  const createRecursoWriteValidationCore = buildFunctionFromSource(buildRecursoWriteValidationCoreSource());
  const writeValidation = createRecursoWriteValidationCore({
    findRecursosByFiltroComUnidadeLean: async (filter) => {
      calls.push(['findRecursosByFiltroComUnidadeLean', toPlain(filter)]);
      if (filter.placa === 'ABC-1234') return [];
      if (filter.chassi === 'CHASSI-1') return [];
      if (filter.renavam === 'REN-1') return [];
      if (filter.placa === 'DUP-1234') return [{ _id: 'dup' }];
      return [];
    },
    findOutroRecursoByPlacaUpper: async (id, placaUpper, unidadeEfetiva) => {
      calls.push(['findOutroRecursoByPlacaUpper', id, placaUpper, unidadeEfetiva]);
      return placaUpper === 'DUP-1234' ? { _id: 'dup' } : null;
    },
    findOutroRecursoByChassiUpper: async (id, chassiUpper, unidadeEfetiva) => {
      calls.push(['findOutroRecursoByChassiUpper', id, chassiUpper, unidadeEfetiva]);
      return chassiUpper === 'DUP-CHASSI' ? { _id: 'dup' } : null;
    },
    findOutroRecursoByRenavam: async (id, renavam, unidadeEfetiva) => {
      calls.push(['findOutroRecursoByRenavam', id, renavam, unidadeEfetiva]);
      return renavam === 'DUP-REN' ? { _id: 'dup' } : null;
    },
  });

  assert.deepEqual(toPlain(writeValidation.ensurePlacaFormat('abc-1234')), {
    ok: true,
    normalizedPlaca: 'ABC-1234',
  });
  assert.deepEqual(toPlain(writeValidation.ensurePlacaFormat('abc1234')), {
    ok: false,
    error: 'invalid_placa_format',
  });

  assert.deepEqual(toPlain(await writeValidation.validateCreate({
    requestedUnitId: 'unit-1',
    tipo: 'carro',
    placa: 'abc-1234',
    chassi: 'chassi-1',
    renavam: 'REN-1',
    ano: '2024',
    mod: '2025',
    marca: 'Marca',
    modelo: 'Modelo',
    cor: 'Preto',
  })), {
    data: {
      unidade_id: 'unit-1',
      tipo: 'carro',
      placa: 'ABC-1234',
      chassi: 'CHASSI-1',
      renavam: 'REN-1',
      ano: 2024,
      mod: 2025,
      marca: 'Marca',
      modelo: 'Modelo',
      cor: 'Preto',
      ativo: true,
    },
  });

  assert.deepEqual(toPlain(await writeValidation.validateCreate({
    requestedUnitId: 'unit-1',
    tipo: 'carro',
    placa: 'dup-1234',
    chassi: 'chassi-2',
    renavam: 'REN-2',
    ano: '2024',
    mod: '2025',
    marca: 'Marca',
    modelo: 'Modelo',
    cor: 'Preto',
  })), {
    error: 'duplicate_placa',
  });

  assert.deepEqual(toPlain(await writeValidation.validateUpdate({
    id: 'rec-1',
    unidadeEfetiva: 'unit-1',
    recurso: { placa: 'OLD-0001', chassi: 'OLD-CHASSI', renavam: 'OLD-REN', ano: 2020, mod: 2021, ativo: true },
    tipo: 'moto',
    placa: 'abc-1234',
    chassi: 'chassi-1',
    renavam: 'REN-1',
    ano: '2026',
    mod: '2027',
    marca: 'Nova',
    modelo: 'Moto',
    cor: 'Azul',
    ativo: false,
  })), {
    data: {
      unidade_id: 'unit-1',
      tipo: 'moto',
      placa: 'ABC-1234',
      chassi: 'CHASSI-1',
      renavam: 'REN-1',
      ano: 2026,
      mod: 2027,
      marca: 'Nova',
      modelo: 'Moto',
      cor: 'Azul',
      ativo: false,
    },
  });

  assert.deepEqual(toPlain(await writeValidation.validateUpdate({
    id: 'rec-1',
    unidadeEfetiva: 'unit-1',
    recurso: { placa: 'OLD-0001', chassi: 'OLD-CHASSI', renavam: 'OLD-REN', ano: 2020, mod: 2021, ativo: true },
    tipo: 'moto',
    placa: 'dup-1234',
    chassi: 'chassi-1',
    renavam: 'REN-1',
    ano: '2026',
    mod: '2027',
    marca: 'Nova',
    modelo: 'Moto',
    cor: 'Azul',
  })), {
    error: 'duplicate_placa',
  });

  assert.deepEqual(calls, [
    ['findRecursosByFiltroComUnidadeLean', { unidade_id: 'unit-1', placa: 'ABC-1234' }],
    ['findRecursosByFiltroComUnidadeLean', { unidade_id: 'unit-1', chassi: 'CHASSI-1' }],
    ['findRecursosByFiltroComUnidadeLean', { unidade_id: 'unit-1', renavam: 'REN-1' }],
    ['findRecursosByFiltroComUnidadeLean', { unidade_id: 'unit-1', placa: 'DUP-1234' }],
    ['findOutroRecursoByPlacaUpper', 'rec-1', 'ABC-1234', 'unit-1'],
    ['findOutroRecursoByChassiUpper', 'rec-1', 'CHASSI-1', 'unit-1'],
    ['findOutroRecursoByRenavam', 'rec-1', 'REN-1', 'unit-1'],
    ['findOutroRecursoByPlacaUpper', 'rec-1', 'DUP-1234', 'unit-1'],
  ]);
});

test('create e update continuam owners HTTP apos a extracao da seam unica de escrita-validacao', async () => {
  const lifecycle = [];
  const owners = buildObjectFromSource(buildDelegatedOwnersSource());
  const deps = {
    writeValidation: {
      validateCreate: async (input) => {
        lifecycle.push(['validateCreate', toPlain(input)]);
        return { data: { unidade_id: input.requestedUnitId, placa: 'ABC-1234', chassi: 'CHASSI-1' } };
      },
      validateUpdate: async (input) => {
        lifecycle.push(['validateUpdate', toPlain(input)]);
        return { data: { unidade_id: input.unidadeEfetiva, placa: 'ABC-1234', chassi: 'CHASSI-1' } };
      },
    },
    badRequest: (_res, message) => ({ status: 400, message }),
    notFound: (_res, message) => ({ status: 404, message }),
    created: (_res, id, extra) => ({ created: true, id, extra }),
    ok: (_res, data) => ({ ok: true, data }),
    createRecursoDb: async (data) => {
      lifecycle.push(['createRecursoDb', toPlain(data)]);
      return { _id: 'rec-1', ...data };
    },
    findRecursoByIdComUnidadeNome: async (id, unidadeEfetiva) => {
      lifecycle.push(['findRecursoByIdComUnidadeNome', id, unidadeEfetiva]);
      return { _id: id, placa: 'OLD-0001', chassi: 'OLD-CHASSI', renavam: 'OLD-REN', ano: 2020, mod: 2021, ativo: true };
    },
    updateRecursoByIdComUnidadeNome: async (id, data, unidadeEfetiva) => {
      lifecycle.push(['updateRecursoByIdComUnidadeNome', id, toPlain(data), unidadeEfetiva]);
      return { _id: id, ...data };
    },
  };

  await owners.createOwner({
    body: {
      unidade_id: 'unit-1', tipo: 'carro', placa: 'abc-1234', chassi: 'chassi-1', renavam: 'REN-1', ano: '2024', mod: '2025', marca: 'Marca', modelo: 'Modelo', cor: 'Preto',
    },
  }, {}, deps);

  await owners.updateOwner({
    params: { id: 'rec-2' },
    body: {
      unidade_id: 'unit-2', tipo: 'moto', placa: 'abc-1234', chassi: 'chassi-1', renavam: 'REN-1', ano: '2024', mod: '2025', marca: 'Marca', modelo: 'Modelo', cor: 'Preto', ativo: false,
    },
  }, {}, deps);

  assert.deepEqual(lifecycle, [
    ['validateCreate', { requestedUnitId: 'unit-1', tipo: 'carro', placa: 'abc-1234', chassi: 'chassi-1', renavam: 'REN-1', ano: '2024', mod: '2025', marca: 'Marca', modelo: 'Modelo', cor: 'Preto' }],
    ['createRecursoDb', { unidade_id: 'unit-1', placa: 'ABC-1234', chassi: 'CHASSI-1' }],
    ['findRecursoByIdComUnidadeNome', 'rec-2', 'unit-2'],
    ['validateUpdate', { id: 'rec-2', unidadeEfetiva: 'unit-2', recurso: { _id: 'rec-2', placa: 'OLD-0001', chassi: 'OLD-CHASSI', renavam: 'OLD-REN', ano: 2020, mod: 2021, ativo: true }, tipo: 'moto', placa: 'abc-1234', chassi: 'chassi-1', renavam: 'REN-1', ano: '2024', mod: '2025', marca: 'Marca', modelo: 'Modelo', cor: 'Preto', ativo: false }],
    ['updateRecursoByIdComUnidadeNome', 'rec-2', { unidade_id: 'unit-2', placa: 'ABC-1234', chassi: 'CHASSI-1' }, 'unit-2'],
  ]);

  const ownersSource = buildDelegatedOwnersSource();
  assert.doesNotMatch(ownersSource, /placaRegexAntiga|placaRegexMercosul|toUpperCase\(|findOutroRecursoByPlacaUpper|findOutroRecursoByChassiUpper|findOutroRecursoByRenavam/);
  assert.doesNotMatch(ownersSource, /createRecursoContextPolicyCore|buildListScope|deleteRecursoScopedService|getRecursoByIdCore|mapRecurso/);
  assert.match(ownersSource, /createRecursoDb\(/);
  assert.match(ownersSource, /updateRecursoByIdComUnidadeNome\(/);
  assert.match(ownersSource, /findRecursoByIdComUnidadeNome\(/);
});