import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/funcaoApiController.js');
const CREATE_CORE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/utils/processCreateFuncaoCore.js');
const UPDATE_CORE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/utils/executeUpdateFuncaoCore.js');
const POLICY_CORE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/funcoes/createFuncaoContextPolicyCore.js');
const LIST_SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/funcoes/listarFuncoes.service.js');
const DELETE_SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/funcoes/deleteFuncaoScoped.service.js');
const GET_BY_ID_CORE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/utils/getFuncaoByIdCore.js');
const GET_BY_UNIT_CORE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/utils/getFuncoesByUnitCore.js');
const BULK_CORE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/utils/processBulkUpdateFuncoes.js');

const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const CREATE_CORE_SOURCE = fs.readFileSync(CREATE_CORE_PATH, 'utf8');
const UPDATE_CORE_SOURCE = fs.readFileSync(UPDATE_CORE_PATH, 'utf8');
const POLICY_CORE_SOURCE = fs.readFileSync(POLICY_CORE_PATH, 'utf8');
const LIST_SERVICE_SOURCE = fs.readFileSync(LIST_SERVICE_PATH, 'utf8');
const DELETE_SERVICE_SOURCE = fs.readFileSync(DELETE_SERVICE_PATH, 'utf8');
const GET_BY_ID_CORE_SOURCE = fs.readFileSync(GET_BY_ID_CORE_PATH, 'utf8');
const GET_BY_UNIT_CORE_SOURCE = fs.readFileSync(GET_BY_UNIT_CORE_PATH, 'utf8');
const BULK_CORE_SOURCE = fs.readFileSync(BULK_CORE_PATH, 'utf8');

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

function buildFuncaoWriteValidationCoreSource() {
  return `function createFuncaoWriteValidationCore({
    findFuncaoByNome,
    findOutraFuncaoByNomeExcludingId,
    findUnidadeByIdWithModulosAcessiveis,
    normalizarListaModulos,
  } = {}) {
    async function validateCreate({ nome, descricao, canonicalPrincipalUnitId, modulosHabilitados } = {}) {
      const dup = await findFuncaoByNome(nome, canonicalPrincipalUnitId || null);
      if (dup) {
        return { error: 'Função já cadastrada' };
      }

      const unidade = await findUnidadeByIdWithModulosAcessiveis(canonicalPrincipalUnitId || null);
      if (!unidade) {
        return { error: 'Unidade inválida' };
      }

      const lista = normalizarListaModulos(modulosHabilitados);
      const permitidos = new Set((unidade.modulosAcessiveis || []).map((modulo) => String(modulo._id)));
      const modsFiltrados = lista.filter((id) => permitidos.has(String(id)));

      return {
        data: {
          nome,
          descricao,
          unidade_principal_id: canonicalPrincipalUnitId,
          modulos_habilitados: modsFiltrados,
        },
      };
    }

    async function validateUpdate({
      id,
      nome,
      descricao,
      unidade_principal_id,
      modulos_habilitados,
      contextPrincipalUnitId,
      existente,
      normalizeUnitId,
    } = {}) {
      const unidadePrincipalExistenteId = normalizeUnitId(existente?.unidade_principal_id);
      const targetPrincipalUnitId = contextPrincipalUnitId || normalizeUnitId(unidade_principal_id || unidadePrincipalExistenteId);

      if (nome && nome !== existente?.nome) {
        const dup = await findOutraFuncaoByNomeExcludingId(
          id,
          nome,
          targetPrincipalUnitId || unidadePrincipalExistenteId || null,
        );
        if (dup) return { error: 'Já existe uma função com este nome' };
      }

      const updates = {};
      if (nome) updates.nome = nome;
      if (descricao !== undefined) updates.descricao = descricao;

      if (targetPrincipalUnitId) {
        const unidade = await findUnidadeByIdWithModulosAcessiveis(targetPrincipalUnitId);
        if (!unidade) return { error: 'Unidade inválida' };

        updates.unidade_principal_id = targetPrincipalUnitId;
        if (modulos_habilitados !== undefined) {
          const lista = normalizarListaModulos(modulos_habilitados);
          const permitidos = new Set((unidade.modulosAcessiveis || []).map((modulo) => String(modulo._id)));
          updates.modulos_habilitados = lista.filter((moduloId) => permitidos.has(String(moduloId)));
        }
      } else if (modulos_habilitados !== undefined) {
        const unidade = await findUnidadeByIdWithModulosAcessiveis(unidadePrincipalExistenteId);
        const lista = normalizarListaModulos(modulos_habilitados);
        const permitidos = new Set((unidade.modulosAcessiveis || []).map((modulo) => String(modulo._id)));
        updates.modulos_habilitados = lista.filter((moduloId) => permitidos.has(String(moduloId)));
      }

      return {
        data: updates,
        targetPrincipalUnitId: targetPrincipalUnitId || unidadePrincipalExistenteId || null,
      };
    }

    return {
      validateCreate,
      validateUpdate,
    };
  }`;
}

function buildDelegatedOwnersSource() {
  return `({
    async createOwner(req, res, deps) {
      const validation = await deps.writeValidation.validateCreate({
        nome: req.body?.nome,
        descricao: req.body?.descricao,
        canonicalPrincipalUnitId: deps.canonicalPrincipalUnitId,
        modulosHabilitados: req.body?.modulos_habilitados,
      });

      if (validation?.error) return deps.badRequest(res, validation.error);

      const created = await deps.createFuncaoDb(validation.data);
      return deps.created(res, created._id, { data: { _id: created._id } });
    },

    async updateOwner(req, res, deps) {
      const existente = await deps.findFuncaoById(req.params.id, deps.contextPrincipalUnitId || null);
      if (!existente) return deps.notFound(res, 'Função não encontrada');

      const validation = await deps.writeValidation.validateUpdate({
        id: req.params.id,
        nome: req.body?.nome,
        descricao: req.body?.descricao,
        unidade_principal_id: req.body?.unidade_principal_id,
        modulos_habilitados: req.body?.modulos_habilitados,
        contextPrincipalUnitId: deps.contextPrincipalUnitId,
        existente,
        normalizeUnitId: deps.normalizeUnitId,
      });

      if (validation?.error === 'Unidade inválida') return deps.badRequest(res, 'Unidade inválida');
      if (validation?.error === 'Já existe uma função com este nome') return deps.badRequest(res, 'Já existe uma função com este nome');

      const updated = await deps.updateFuncaoById(req.params.id, validation.data, validation.targetPrincipalUnitId);
      const reloaded = await deps.findFuncaoByIdLean(req.params.id, validation.targetPrincipalUnitId);
      return deps.ok(res, { updated: true, funcao: reloaded });
    },
  })`;
}

test('estado real atual: create e update ainda concentram o miolo de escrita semantica compartilhada', () => {
  assert.match(POLICY_CORE_SOURCE, /export function createFuncaoContextPolicyCore\(/);
  assert.match(CONTROLLER_SOURCE, /processCreateFuncaoCore\(/);
  assert.match(CONTROLLER_SOURCE, /executeUpdateFuncaoCore\(/);
  assert.match(CREATE_CORE_SOURCE, /const dup = await findFuncaoByNome\(nome, canonicalPrincipalUnitId\);/);
  assert.match(CREATE_CORE_SOURCE, /const unidade = await findUnidadeByIdWithModulosAcessiveis\(canonicalPrincipalUnitId\);/);
  assert.match(CREATE_CORE_SOURCE, /const lista = normalizarListaModulos\(modulosHabilitados\);/);
  assert.match(CREATE_CORE_SOURCE, /const permitidos = new Set\(\(unidade\.modulosAcessiveis \|\| \[\]\)\.map\(\(modulo\) => String\(modulo\._id\)\)\);/);
  assert.match(CREATE_CORE_SOURCE, /return \{ error: 'Função já cadastrada' \};/);
  assert.match(CREATE_CORE_SOURCE, /return \{ error: 'Unidade inválida' \};/);

  assert.match(UPDATE_CORE_SOURCE, /const dup = await findOutraFuncaoByNomeExcludingId\(/);
  assert.match(UPDATE_CORE_SOURCE, /if \(dup\) return \{ error: 'Já existe uma função com este nome' \};/);
  assert.match(UPDATE_CORE_SOURCE, /const unidade = await findUnidadeByIdWithModulosAcessiveis\(targetPrincipalUnitId\);/);
  assert.match(UPDATE_CORE_SOURCE, /if \(!unidade\) return \{ error: 'Unidade inválida' \};/);
  assert.match(UPDATE_CORE_SOURCE, /const lista = normalizarListaModulos\(modulos_habilitados\);/);
  assert.match(UPDATE_CORE_SOURCE, /updates\.modulos_habilitados = lista\.filter\(moduloId => permitidos\.has\(String\(moduloId\)\)\);/);

  assert.match(CONTROLLER_SOURCE, /if \(funcao\?\.error === 'Função já cadastrada'\) return badRequest\(res,'Função já cadastrada'\);/);
  assert.match(CONTROLLER_SOURCE, /if \(funcao\?\.error === 'Unidade inválida'\) return badRequest\(res,'Unidade inválida'\);/);
  assert.match(CONTROLLER_SOURCE, /if \(updated\?\.error === 'Já existe uma função com este nome'\) return badRequest\(res,'Já existe uma função com este nome'\);/);
  assert.match(CONTROLLER_SOURCE, /if \(updated\?\.error === 'Unidade inválida'\) return badRequest\(res,'Unidade inválida'\);/);

  assert.doesNotMatch(CONTROLLER_SOURCE, /createFuncaoWriteValidationCore/);
  assert.doesNotMatch(CREATE_CORE_SOURCE, /createFuncaoContextPolicyCore/);
  assert.doesNotMatch(UPDATE_CORE_SOURCE, /createFuncaoContextPolicyCore/);
  assert.doesNotMatch(BULK_CORE_SOURCE, /modulos_habilitados|findOutraFuncaoByNomeExcludingId|findUnidadeByIdWithModulosAcessiveis/);
  assert.doesNotMatch(GET_BY_ID_CORE_SOURCE, /findFuncaoByNome|findOutraFuncaoByNomeExcludingId|modulosAcessiveis/);
  assert.doesNotMatch(GET_BY_UNIT_CORE_SOURCE, /findFuncaoByNome|findOutraFuncaoByNomeExcludingId|modulosAcessiveis/);
  assert.doesNotMatch(DELETE_SERVICE_SOURCE, /findFuncaoByNome|findOutraFuncaoByNomeExcludingId|modulosAcessiveis/);
});

test('futura seam unica recebe apenas dados minimos de escrita e dependencias de verificacao', async () => {
  const functionSource = buildFuncaoWriteValidationCoreSource();
  assert.match(functionSource, /function createFuncaoWriteValidationCore\(\{/);
  assert.doesNotMatch(functionSource, /createFuncaoContextPolicyCore|resolveCanonicalContextPrincipalUnitId|ensureRequestedUnitWithinContextCluster|buildListScope/);
  assert.doesNotMatch(functionSource, /processBulkUpdateFuncoesItems|getFuncaoByIdCore|getFuncoesByUnitCore|listarFuncoesService|deleteFuncaoScopedService/);
  assert.doesNotMatch(functionSource, /createFuncaoDb|updateFuncaoById|findFuncaoByIdLean|badRequest|created\(|ok\(|notFound|serverError/);
  assert.doesNotMatch(functionSource, /descricao_display|descricao_final|mapClusterFuncao|mapUnidadeFuncao/);
  assert.doesNotMatch(functionSource, /\breq\b|\bres\b/);

  const calls = [];
  const createFuncaoWriteValidationCore = buildFunctionFromSource(buildFuncaoWriteValidationCoreSource());
  const writeValidation = createFuncaoWriteValidationCore({
    findFuncaoByNome: async (nome, unidadePrincipalId) => {
      calls.push(['findFuncaoByNome', nome, unidadePrincipalId]);
      return nome === 'Duplicada' ? { _id: 'dup-create' } : null;
    },
    findOutraFuncaoByNomeExcludingId: async (id, nome, unidadePrincipalId) => {
      calls.push(['findOutraFuncaoByNomeExcludingId', id, nome, unidadePrincipalId]);
      return nome === 'Duplicada Update' ? { _id: 'dup-update' } : null;
    },
    findUnidadeByIdWithModulosAcessiveis: async (unidadeId) => {
      calls.push(['findUnidadeByIdWithModulosAcessiveis', unidadeId]);
      if (unidadeId === 'principal-invalida') return null;
      return {
        _id: unidadeId,
        modulosAcessiveis: [
          { _id: 'mod-1' },
          { _id: 'mod-2' },
        ],
      };
    },
    normalizarListaModulos: (input) => {
      calls.push(['normalizarListaModulos', toPlain(input)]);
      return Array.isArray(input) ? input.filter(Boolean) : [];
    },
  });

  assert.deepEqual(toPlain(await writeValidation.validateCreate({
    nome: 'Supervisor',
    descricao: 'Descricao',
    canonicalPrincipalUnitId: 'principal-a',
    modulosHabilitados: ['mod-1', 'mod-3', 'mod-2'],
  })), {
    data: {
      nome: 'Supervisor',
      descricao: 'Descricao',
      unidade_principal_id: 'principal-a',
      modulos_habilitados: ['mod-1', 'mod-2'],
    },
  });

  assert.deepEqual(toPlain(await writeValidation.validateCreate({
    nome: 'Duplicada',
    descricao: 'Descricao',
    canonicalPrincipalUnitId: 'principal-a',
    modulosHabilitados: ['mod-1'],
  })), {
    error: 'Função já cadastrada',
  });

  assert.deepEqual(toPlain(await writeValidation.validateCreate({
    nome: 'Supervisor',
    descricao: 'Descricao',
    canonicalPrincipalUnitId: 'principal-invalida',
    modulosHabilitados: ['mod-1'],
  })), {
    error: 'Unidade inválida',
  });

  assert.deepEqual(toPlain(await writeValidation.validateUpdate({
    id: 'func-1',
    nome: 'Supervisor Atualizado',
    descricao: 'Nova',
    unidade_principal_id: 'principal-a',
    modulos_habilitados: ['mod-2', 'mod-9'],
    contextPrincipalUnitId: 'principal-a',
    existente: {
      nome: 'Supervisor',
      unidade_principal_id: 'principal-a',
    },
    normalizeUnitId(value) {
      return String(value || '').trim();
    },
  })), {
    data: {
      nome: 'Supervisor Atualizado',
      descricao: 'Nova',
      unidade_principal_id: 'principal-a',
      modulos_habilitados: ['mod-2'],
    },
    targetPrincipalUnitId: 'principal-a',
  });

  assert.deepEqual(toPlain(await writeValidation.validateUpdate({
    id: 'func-1',
    nome: 'Duplicada Update',
    descricao: 'Nova',
    unidade_principal_id: 'principal-a',
    modulos_habilitados: ['mod-2'],
    contextPrincipalUnitId: 'principal-a',
    existente: {
      nome: 'Supervisor',
      unidade_principal_id: 'principal-a',
    },
    normalizeUnitId(value) {
      return String(value || '').trim();
    },
  })), {
    error: 'Já existe uma função com este nome',
  });

  assert.deepEqual(toPlain(await writeValidation.validateUpdate({
    id: 'func-1',
    nome: 'Supervisor Atualizado',
    descricao: 'Nova',
    unidade_principal_id: 'principal-invalida',
    modulos_habilitados: ['mod-2'],
    contextPrincipalUnitId: '',
    existente: {
      nome: 'Supervisor',
      unidade_principal_id: 'principal-a',
    },
    normalizeUnitId(value) {
      return String(value || '').trim();
    },
  })), {
    error: 'Unidade inválida',
  });

  assert.ok(calls.some((entry) => entry[0] === 'findFuncaoByNome'));
  assert.ok(calls.some((entry) => entry[0] === 'findOutraFuncaoByNomeExcludingId'));
  assert.ok(calls.some((entry) => entry[0] === 'findUnidadeByIdWithModulosAcessiveis' && entry[1] === 'principal-a'));
  assert.ok(calls.some((entry) => entry[0] === 'normalizarListaModulos'));
});

test('apos extracao, create e update seguem owners HTTP e delegam apenas o miolo de escrita semantica', async () => {
  const ownerSource = buildDelegatedOwnersSource();
  assert.match(ownerSource, /deps\.writeValidation\.validateCreate\(\{/);
  assert.match(ownerSource, /deps\.writeValidation\.validateUpdate\(\{/);
  assert.match(ownerSource, /deps\.createFuncaoDb\(validation\.data\)/);
  assert.match(ownerSource, /deps\.updateFuncaoById\(req\.params\.id, validation\.data, validation\.targetPrincipalUnitId\)/);
  assert.doesNotMatch(ownerSource, /findFuncaoByNome|findOutraFuncaoByNomeExcludingId|findUnidadeByIdWithModulosAcessiveis|normalizarListaModulos/);
  assert.doesNotMatch(ownerSource, /createFuncaoContextPolicyCore|buildListScope|deleteFuncaoScopedService|getFuncaoByIdCore|getFuncoesByUnitCore|processBulkUpdateFuncoesItems/);

  const calls = [];
  const owners = buildObjectFromSource(buildDelegatedOwnersSource());
  const deps = {
    canonicalPrincipalUnitId: 'principal-a',
    contextPrincipalUnitId: 'principal-a',
    normalizeUnitId(value) {
      return String(value || '').trim();
    },
    badRequest(res, message) {
      calls.push(['badRequest', message]);
      res.statusCode = 400;
      res.body = { message };
      return res;
    },
    notFound(res, message) {
      calls.push(['notFound', message]);
      res.statusCode = 404;
      res.body = { message };
      return res;
    },
    created(res, id, payload) {
      calls.push(['created', id, toPlain(payload)]);
      res.statusCode = 201;
      res.body = { id, ...toPlain(payload) };
      return res;
    },
    ok(res, payload) {
      calls.push(['ok', toPlain(payload)]);
      res.statusCode = 200;
      res.body = toPlain(payload);
      return res;
    },
    writeValidation: {
      async validateCreate(input) {
        calls.push(['validateCreate', toPlain(input)]);
        return {
          data: {
            nome: input.nome,
            descricao: input.descricao,
            unidade_principal_id: input.canonicalPrincipalUnitId,
            modulos_habilitados: ['mod-1'],
          },
        };
      },
      async validateUpdate(input) {
        calls.push(['validateUpdate', toPlain(input)]);
        return {
          data: {
            nome: input.nome,
            descricao: input.descricao,
            unidade_principal_id: input.contextPrincipalUnitId,
            modulos_habilitados: ['mod-2'],
          },
          targetPrincipalUnitId: input.contextPrincipalUnitId,
        };
      },
    },
    createFuncaoDb: async (payload) => {
      calls.push(['createFuncaoDb', toPlain(payload)]);
      return { _id: 'func-created', ...payload };
    },
    findFuncaoById: async (id, contextPrincipalUnitId) => {
      calls.push(['findFuncaoById', id, contextPrincipalUnitId]);
      return { _id: id, nome: 'Supervisor', unidade_principal_id: 'principal-a' };
    },
    updateFuncaoById: async (id, payload, targetPrincipalUnitId) => {
      calls.push(['updateFuncaoById', id, toPlain(payload), targetPrincipalUnitId]);
      return { _id: id, ...payload };
    },
    findFuncaoByIdLean: async (id, targetPrincipalUnitId) => {
      calls.push(['findFuncaoByIdLean', id, targetPrincipalUnitId]);
      return { _id: id, nome: 'Supervisor Atualizado', unidade_principal_id: targetPrincipalUnitId };
    },
  };

  const createRes = {};
  await owners.createOwner({
    body: {
      nome: 'Supervisor',
      descricao: 'Descricao',
      modulos_habilitados: ['mod-1', 'mod-9'],
    },
  }, createRes, deps);

  const updateRes = {};
  await owners.updateOwner({
    params: { id: 'func-1' },
    body: {
      nome: 'Supervisor Atualizado',
      descricao: 'Nova',
      unidade_principal_id: 'principal-a',
      modulos_habilitados: ['mod-2', 'mod-9'],
    },
  }, updateRes, deps);

  assert.equal(createRes.statusCode, 201);
  assert.equal(updateRes.statusCode, 200);
  assert.deepEqual(calls, [
    ['validateCreate', {
      nome: 'Supervisor',
      descricao: 'Descricao',
      canonicalPrincipalUnitId: 'principal-a',
      modulosHabilitados: ['mod-1', 'mod-9'],
    }],
    ['createFuncaoDb', {
      nome: 'Supervisor',
      descricao: 'Descricao',
      unidade_principal_id: 'principal-a',
      modulos_habilitados: ['mod-1'],
    }],
    ['created', 'func-created', { data: { _id: 'func-created' } }],
    ['findFuncaoById', 'func-1', 'principal-a'],
    ['validateUpdate', {
      id: 'func-1',
      nome: 'Supervisor Atualizado',
      descricao: 'Nova',
      unidade_principal_id: 'principal-a',
      modulos_habilitados: ['mod-2', 'mod-9'],
      contextPrincipalUnitId: 'principal-a',
      existente: {
        _id: 'func-1',
        nome: 'Supervisor',
        unidade_principal_id: 'principal-a',
      },
    }],
    ['updateFuncaoById', 'func-1', {
      nome: 'Supervisor Atualizado',
      descricao: 'Nova',
      unidade_principal_id: 'principal-a',
      modulos_habilitados: ['mod-2'],
    }, 'principal-a'],
    ['findFuncaoByIdLean', 'func-1', 'principal-a'],
    ['ok', {
      updated: true,
      funcao: {
        _id: 'func-1',
        nome: 'Supervisor Atualizado',
        unidade_principal_id: 'principal-a',
      },
    }],
  ]);
});