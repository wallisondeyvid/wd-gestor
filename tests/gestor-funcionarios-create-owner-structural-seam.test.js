import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/funcionarioApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function extractExportedAsyncFunction(source, functionName) {
  const signature = `export async function ${functionName}(`;
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao encontrou ${functionName}`);

  const paramsEnd = source.indexOf(')', start);
  assert.ok(paramsEnd >= 0, `Nao encontrou fechamento de parametros de ${functionName}`);

  const braceStart = source.indexOf('{', paramsEnd);
  assert.ok(braceStart >= 0, `Nao encontrou bloco de ${functionName}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1).replace(/^export\s+/, '');
    }
  }

  throw new Error(`Nao conseguiu extrair ${functionName}`);
}

function buildFunction(functionSource, context = {}) {
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function createApiRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function buildReq(bodyOverrides = {}, reqOverrides = {}) {
  const body = {
    unidade_id: 'unit-001',
    nome: '  Maria Focal  ',
    rg: 'RG-123',
    cpf: '12345678901',
    pis: '12345678901',
    data_nascimento: '1991-04-02',
    sexo: 'F',
    endereco: {
      cep: '01001000',
      logradouro: 'Rua Alfa',
      numero: '42',
      bairro: 'Centro',
      cidade: 'Sao Paulo',
      estado: 'SP',
    },
    email: '  maria.focal@example.com  ',
    telefone: '11999990000',
    observacoes: '  observacao owner  ',
    face_imagem: 'data:image/png;base64,face-inline',
    ...bodyOverrides,
  };

  return {
    body,
    file: undefined,
    files: {},
    params: {},
    query: {},
    user: { unidade_id: 'unit-001' },
    session: { user: { unidade_id: 'unit-001' } },
    ...reqOverrides,
  };
}

function buildCreateFuncionarioHarness(overrides = {}) {
  const callOrder = [];
  let normalizedPayloadInput = null;
  let persistedDoc = null;
  let autoUserInput = null;
  let photoUploadArgs = null;
  let biometriaUploadArgs = null;
  let serverErrorArg = null;
  let consoleErrors = [];

  const context = {
    logDateDebug: () => {},
    asISODate: (value) => {
      if (value === undefined || value === null || value === '') return undefined;
      return String(value).trim();
    },
    asStr: (value) => {
      if (value === undefined || value === null) return '';
      if (typeof value === 'object') return value;
      return String(value);
    },
    getRequestUnitId: (req) => req.user?.unidade_id || null,
    normalizeUnitId: (value) => {
      const normalized = String(value || '').trim();
      return normalized || null;
    },
    getCanonicalContextUnitId: (req) => req.user?.unidade_id || null,
    requestedUnitMatchesContext: () => true,
    normalizeFuncionarioPayload: (payload) => {
      callOrder.push('normalize');
      normalizedPayloadInput = { ...payload };
      return payload;
    },
    badRequest: (res, message, extra = {}) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message, ...extra }),
    notFound: (res, message) => res.status(404).json({ success: false, code: 'NOT_FOUND', message }),
    serverError: (res, message) => {
      serverErrorArg = message;
      return res.status(500).json({ success: false, code: 'SERVER_ERROR', message });
    },
    created: (res, id, extra = {}) => {
      callOrder.push('created');
      return res.status(201).json({ success: true, id, ...extra });
    },
    findFuncionarioByCpfAndUnidade: async () => {
      callOrder.push('find-cpf');
      return null;
    },
    isValidPIS: () => true,
    mapFiles: (files) => files.map((file) => ({ originalname: file.originalname })),
    createFuncionarioDoc: async (doc) => {
      callOrder.push('persist');
      persistedDoc = JSON.parse(JSON.stringify(doc));
      return { _id: 'func-001', ...doc };
    },
    executeCreateFuncionarioCoreService: async (input) => {
      callOrder.push('core');
      const novo = await context.createFuncionarioDoc({
        unidade_id: input.unidade_id,
        funcao_id: input.funcao_id || undefined,
        nome: input.nome.trim(),
        nome_social: input.nome_social || undefined,
        nome_mae: input.nome_mae || undefined,
        nome_pai: input.nome_pai || undefined,
        rg: input.rg.trim(),
        rg_orgao: input.rg_orgao || undefined,
        cpf: input.cpf,
        data_nascimento: input.data_nascimento,
        sexo: input.sexo,
        endereco: input.endereco,
        telefone: input.telefone.trim(),
        telefone2: input.telefone2 || undefined,
        email: input.email,
        observacoes: input.observacoes ? input.observacoes.trim() : undefined,
        cargo: input.cargo || undefined,
        departamento: input.departamento || undefined,
        regime_contratacao: input.regime_contratacao || undefined,
        regime_jornada: input.regime_jornada || undefined,
        carga_semanal: input.carga_semanal || undefined,
        salario_base: input.salario_base || undefined,
        forma_pagamento: input.forma_pagamento || undefined,
        anexos: [{ nome: 'existente.pdf' }, { originalname: 'novo-anexo.pdf' }],
        extras: {},
        dependentes: [],
        beneficios: [],
        biometrias_digitais: undefined,
        biometrias_facial: [
          {
            hash: 'hash-face-1',
            imagem: 'data:image/png;base64,face-inline',
            template_b64: 'template-face-1',
            template_sha256: 'sha-face-1',
            qualidade: 87,
          },
        ],
        face_imagem: input.face_imagem || undefined,
      });
      return { novo };
    },
    getBlobToken: () => 'blob-token',
    uploadFuncionarioFotoToBlob: async (buffer, funcionarioId) => {
      callOrder.push('foto');
      photoUploadArgs = { buffer, funcionarioId };
      return 'https://blob.invalid/func-001.webp';
    },
    saveFuncionario: async (funcionario) => funcionario,
    canUseBlob: () => true,
    mapBiometriasFaciaisToBlob: async (arr, funcionarioId) => {
      callOrder.push('biometria');
      biometriaUploadArgs = { arr: JSON.parse(JSON.stringify(arr)), funcionarioId };
      return arr.map((item, index) => ({
        ...item,
        imagem: `https://blob.invalid/face-${index + 1}.webp`,
      }));
    },
    criarUsuarioAuto: async (funcionario) => {
      callOrder.push('autoUser');
      autoUserInput = { _id: funcionario._id, foto: funcionario.foto, face_imagem: funcionario.face_imagem };
      return { ok: true, outcome: 'created' };
    },
    handleFuncionarioCreateDuplicateError: () => null,
    console: {
      log() {},
      warn() {},
      error(...args) {
        consoleErrors.push(args);
      },
    },
    process: { env: {} },
    ...overrides,
  };

  context.createFuncionarioAssetsInfraCore = () => ({
    mapFiles: context.mapFiles,
    getBlobToken: context.getBlobToken,
    uploadFuncionarioFotoToBlob: context.uploadFuncionarioFotoToBlob,
    canUseBlob: context.canUseBlob,
    mapBiometriasFaciaisToBlob: context.mapBiometriasFaciaisToBlob,
  });

  return {
    createFuncionario: buildFunction(extractExportedAsyncFunction(CONTROLLER_SOURCE, 'createFuncionario'), context),
    callOrder,
    getNormalizedPayloadInput: () => normalizedPayloadInput,
    getPersistedDoc: () => persistedDoc,
    getAutoUserInput: () => autoUserInput,
    getPhotoUploadArgs: () => photoUploadArgs,
    getBiometriaUploadArgs: () => biometriaUploadArgs,
    getServerErrorArg: () => serverErrorArg,
    getConsoleErrors: () => consoleErrors,
  };
}

test('createFuncionario: owner real preserva gate de contexto e aborta antes da persistencia', async () => {
  let persistCalled = false;
  let autoUserCalled = false;

  const { createFuncionario, getConsoleErrors, getServerErrorArg } = buildCreateFuncionarioHarness({
    requestedUnitMatchesContext: () => false,
    createFuncionarioDoc: async () => {
      persistCalled = true;
      throw new Error('nao deve persistir fora do contexto');
    },
    criarUsuarioAuto: async () => {
      autoUserCalled = true;
      throw new Error('nao deve criar autoUser fora do contexto');
    },
  });

  const req = buildReq({ unidade_id: 'unit-fora-contexto' });
  const res = createApiRes();

  await createFuncionario(req, res);

  assert.equal(JSON.stringify(getConsoleErrors()), JSON.stringify([]));
  assert.equal(getServerErrorArg(), null);
  assert.equal(persistCalled, false);
  assert.equal(autoUserCalled, false);
  assert.equal(res.statusCode, 404);
  assert.equal(
    JSON.stringify(res.body),
    JSON.stringify({ success: false, code: 'NOT_FOUND', message: 'Unidade não encontrada' })
  );
});

test('createFuncionario: owner real preserva validacao obrigatoria apos normalizacao inicial e antes da persistencia', async () => {
  let persistCalled = false;

  const { createFuncionario, callOrder, getNormalizedPayloadInput, getConsoleErrors, getServerErrorArg } = buildCreateFuncionarioHarness({
    createFuncionarioDoc: async () => {
      persistCalled = true;
      throw new Error('nao deve persistir quando a validacao obrigatoria falha');
    },
  });

  const req = buildReq({ endereco: {} });
  const res = createApiRes();

  await createFuncionario(req, res);

  assert.equal(JSON.stringify(getConsoleErrors()), JSON.stringify([]));
  assert.equal(getServerErrorArg(), null);
  assert.equal(persistCalled, false);
  assert.equal(callOrder.includes('normalize'), true);
  assert.equal(getNormalizedPayloadInput().cpf, '12345678901');
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'BAD_REQUEST');
  assert.equal(res.body.message, 'Campos obrigatórios ausentes');
  assert.equal(JSON.stringify(res.body.campos), JSON.stringify(['endereco', 'endereco[cep]']));
});

test('createFuncionario: owner real executa a ordem estrutural normalizacao -> core minimo -> foto -> biometria -> autoUser -> resposta HTTP', async () => {
  const {
    createFuncionario,
    callOrder,
    getPersistedDoc,
    getAutoUserInput,
    getPhotoUploadArgs,
    getBiometriaUploadArgs,
    getConsoleErrors,
    getServerErrorArg,
  } = buildCreateFuncionarioHarness();

  const req = buildReq(
    {
      telefone2: '1133334444',
      salario_base: '1.234,56',
      carga_semanal: '44',
      face_capturas_json: JSON.stringify([
        {
          imagem: 'data:image/png;base64,face-inline',
          hash: 'hash-face-1',
          template_b64: 'template-face-1',
          template_sha256: 'sha-face-1',
          qualidade: 87,
        },
      ]),
      anexos_existentes: JSON.stringify([{ nome: 'existente.pdf' }]),
    },
    {
      file: { fieldname: 'foto', buffer: 'foto-buffer' },
      files: {
        anexos: [{ originalname: 'novo-anexo.pdf' }],
      },
    }
  );
  const res = createApiRes();

  await createFuncionario(req, res);

  assert.equal(JSON.stringify(getConsoleErrors()), JSON.stringify([]));
  assert.equal(getServerErrorArg(), null);
  const filteredOrder = callOrder.filter((step) => ['normalize', 'persist', 'foto', 'biometria', 'autoUser', 'created'].includes(step));

  assert.equal(
    JSON.stringify(filteredOrder),
    JSON.stringify(['normalize', 'persist', 'foto', 'biometria', 'autoUser', 'created'])
  );

  const persistedDoc = getPersistedDoc();
  assert.equal(persistedDoc.unidade_id, 'unit-001');
  assert.equal(persistedDoc.nome, 'Maria Focal');
  assert.equal(persistedDoc.rg, 'RG-123');
  assert.equal(persistedDoc.cpf, '12345678901');
  assert.equal(persistedDoc.telefone, '11999990000');
  assert.equal(persistedDoc.telefone2, '1133334444');
  assert.equal(persistedDoc.email, '  maria.focal@example.com  ');
  assert.equal(persistedDoc.observacoes, 'observacao owner');
  assert.equal(persistedDoc.carga_semanal, 44);
  assert.equal(persistedDoc.salario_base, 1234.56);
  assert.equal(JSON.stringify(persistedDoc.anexos), JSON.stringify([{ nome: 'existente.pdf' }, { originalname: 'novo-anexo.pdf' }]));
  assert.equal(JSON.stringify(persistedDoc.biometrias_facial), JSON.stringify([
    {
      hash: 'hash-face-1',
      imagem: 'data:image/png;base64,face-inline',
      template_b64: 'template-face-1',
      template_sha256: 'sha-face-1',
      qualidade: 87,
    },
  ]));

  assert.equal(
    JSON.stringify(getPhotoUploadArgs()),
    JSON.stringify({ buffer: 'foto-buffer', funcionarioId: 'func-001' })
  );
  assert.equal(
    JSON.stringify(getBiometriaUploadArgs()),
    JSON.stringify({
      arr: [
        {
          hash: 'hash-face-1',
          imagem: 'data:image/png;base64,face-inline',
          template_b64: 'template-face-1',
          template_sha256: 'sha-face-1',
          qualidade: 87,
        },
      ],
      funcionarioId: 'func-001',
    })
  );
  assert.equal(
    JSON.stringify(getAutoUserInput()),
    JSON.stringify({
      _id: 'func-001',
      foto: 'https://blob.invalid/func-001.webp',
      face_imagem: 'https://blob.invalid/face-1.webp',
    })
  );
  assert.equal(res.statusCode, 201);
  assert.equal(
    JSON.stringify(res.body),
    JSON.stringify({
      success: true,
      id: 'func-001',
      data: {
        id: 'func-001',
        autoUser: { ok: true, outcome: 'created' },
      },
    })
  );
});