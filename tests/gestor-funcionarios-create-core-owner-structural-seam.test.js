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
    funcao_id: 'funcao-001',
    nome: '  Maria Core  ',
    nome_social: '  Maria Social  ',
    rg: 'RG-123',
    rg_orgao: 'SSP',
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
    telefone: '11999990000',
    telefone2: '1133334444',
    email: '  maria.core@example.com  ',
    observacoes: '  observacao core  ',
    salario_base: '1.234,56',
    carga_semanal: '44',
    face_imagem: 'data:image/png;base64,face-inline',
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

function buildCreateDelegatedSource() {
  const original = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'createFuncionario');
  if (original.includes('await executeCreateFuncionarioCore({')) {
    return original;
  }

  const blockStartMarker = "let anexosExistentes=[]; if(req.body.anexos_existentes){ try { anexosExistentes=JSON.parse(req.body.anexos_existentes);} catch{} }";
  const blockEndMarker = "\n\t// Upload da foto (se houver) após ter o _id";
  const blockStart = original.indexOf(blockStartMarker);
  const blockEnd = original.indexOf(blockEndMarker, blockStart);

  assert.ok(blockStart >= 0, 'Nao encontrou o inicio do create core minimo atual');
  assert.ok(blockEnd > blockStart, 'Nao encontrou o fim do create core minimo atual');

  const seamBlock = `const coreResult = await executeCreateFuncionarioCore({
\t\tunidade_id,
\t\tfuncao_id,
\t\tnome,
\t\tnome_social,
\t\tnome_mae,
\t\tnome_pai,
\t\trg,
\t\trg_orgao,
\t\trg_uf,
\t\trg_data_expedicao,
\t\tcpf,
\t\tpis,
\t\tdata_nascimento,
\t\tsexo,
\t\testado_civil,
\t\traca_cor,
\t\tescolaridade,
\t\tnacionalidade,
\t\tpais_nascimento,
\t\tdata_chegada_brasil,
\t\tnaturalidade,
\t\tendereco,
\t\ttelefone,
\t\ttelefone2,
\t\temail,
\t\ttipo_ctps,
\t\tctps_numero,
\t\tctps_serie,
\t\tctps_uf,
\t\tpcd,
\t\ttipo_deficiencia,
\t\tcid,
\t\tbiometrico,
\t\tbiometrico_face,
\t\tfp_template_b64,
\t\tfp_template_sha256,
\t\tfp_imagem,
\t\tfp_dedo,
\t\tface_template_b64,
\t\tface_template_sha256,
\t\tface_imagem,
\t\tobservacoes,
\t\tdata_admissao,
\t\ttipo_admissao,
\t\tcategoria_trabalhador,
\t\ttipo_contrato,
\t\tdata_termino,
\t\tobjeto_determinante,
\t\tclausula_assecuratoria,
\t\tcargo,
\t\tcbo,
\t\tdepartamento,
\t\tregime_contratacao,
\t\tregime_jornada,
\t\tcarga_semanal,
\t\tsalario_base,
\t\ttipo_salario,
\t\tforma_pagamento,
\t\tforma_pagamento_desc,
\t\tbanco,
\t\tagencia_num,
\t\tagencia_dv,
\t\tconta_num,
\t\tconta_dv,
\t\ttipo_conta,
\t\tsindicato,
\t\tfgts_optante,
\t\tfgts_data,
\t\tregime_previdenciario,
\t\ttipo_especial,
\t\tcert_militar,
\t\tcert_militar_orgao,
\t\tcert_militar_uf,
\t\tcert_militar_data,
\t\ttitulo,
\t\ttitulo_zona,
\t\ttitulo_secao,
\t\tcnh,
\t\tcnh_categoria,
\t\tcnh_validade,
\t\tcnh_uf,
\t\torgao_prof,
\t\torgao_prof_uf,
\t\torgao_prof_numero,
\t\trawBody: req.body,
\t\tanexosFiles: req.files?.anexos || [],
\t\tmapFiles,
\t\tcreateFuncionarioDoc,
\t});
\tconst novo = coreResult.novo;`;

  const replaced = `${original.slice(0, blockStart)}${seamBlock}${original.slice(blockEnd)}`;
  assert.notEqual(replaced, original, 'Nao conseguiu instalar a seam estrutural do create core');
  return replaced;
}

function buildHarness(overrides = {}) {
  const callOrder = [];
  let seamArgs = null;
  let photoUploadArgs = null;
  let biometriaUploadArgs = null;
  let autoUserArgs = null;
  let createFuncionarioDocCalledDirectly = false;
  let saveFuncionarioCalls = [];
  let serverErrorArg = null;
  let duplicateArgs = [];

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
    normalizeFuncionarioPayload: (payload) => payload,
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
    findFuncionarioByCpfAndUnidade: async () => null,
    isValidPIS: () => true,
    mapFiles: () => {
      throw new Error('o owner nao deve chamar mapFiles diretamente apos delegar o create core');
    },
    createFuncionarioDoc: async () => {
      createFuncionarioDocCalledDirectly = true;
      throw new Error('o owner nao deve persistir diretamente fora da seam');
    },
    executeCreateFuncionarioCore: async (input) => {
      callOrder.push('core');
      seamArgs = input;
      return {
        novo: {
          _id: 'func-001',
          unidade_id: input.unidade_id,
          email: input.email,
          face_imagem: input.face_imagem,
          biometrias_facial: [
            {
              hash: 'hash-face-1',
              imagem: 'data:image/png;base64,face-inline',
              template_b64: 'template-face-1',
              template_sha256: 'sha-face-1',
              qualidade: 87,
            },
          ],
        },
      };
    },
    getBlobToken: () => 'blob-token',
    uploadFuncionarioFotoToBlob: async (buffer, funcionarioId) => {
      callOrder.push('foto');
      photoUploadArgs = { buffer, funcionarioId };
      return 'https://blob.invalid/func-001.webp';
    },
    saveFuncionario: async (funcionario) => {
      saveFuncionarioCalls.push(JSON.parse(JSON.stringify(funcionario)));
      return funcionario;
    },
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
      autoUserArgs = {
        _id: funcionario._id,
        foto: funcionario.foto,
        face_imagem: funcionario.face_imagem,
      };
      return { ok: true, outcome: 'created' };
    },
    handleFuncionarioCreateDuplicateError: (res, error) => {
      duplicateArgs.push(error);
      return null;
    },
    console: { log() {}, warn() {}, error() {} },
    process: { env: {} },
    ...overrides,
  };

  return {
    createFuncionario: buildFunction(buildCreateDelegatedSource(), context),
    callOrder,
    getSeamArgs: () => seamArgs,
    getPhotoUploadArgs: () => photoUploadArgs,
    getBiometriaUploadArgs: () => biometriaUploadArgs,
    getAutoUserArgs: () => autoUserArgs,
    getSaveFuncionarioCalls: () => saveFuncionarioCalls,
    getServerErrorArg: () => serverErrorArg,
    getDuplicateArgs: () => duplicateArgs,
    wasCreateFuncionarioDocCalledDirectly: () => createFuncionarioDocCalledDirectly,
  };
}

test('createFuncionario: owner real preserva gate de contexto antes da seam do create core', async () => {
  let seamCalled = false;

  const { createFuncionario } = buildHarness({
    requestedUnitMatchesContext: () => false,
    executeCreateFuncionarioCore: async () => {
      seamCalled = true;
      throw new Error('nao deve delegar o core fora do contexto');
    },
  });

  const req = buildReq({ unidade_id: 'unit-fora-contexto' });
  const res = createApiRes();

  await createFuncionario(req, res);

  assert.equal(seamCalled, false);
  assert.equal(res.statusCode, 404);
  assert.equal(
    JSON.stringify(res.body),
    JSON.stringify({ success: false, code: 'NOT_FOUND', message: 'Unidade não encontrada' })
  );
});

test('createFuncionario: owner real preserva abortos de validacao anteriores a seam', async () => {
  let seamCalled = false;

  const { createFuncionario } = buildHarness({
    isValidPIS: () => false,
    executeCreateFuncionarioCore: async () => {
      seamCalled = true;
      throw new Error('nao deve delegar o core quando a validacao falha');
    },
  });

  const req = buildReq({ pis: '11111111111' });
  const res = createApiRes();

  await createFuncionario(req, res);

  assert.equal(seamCalled, false);
  assert.equal(res.statusCode, 400);
  assert.equal(
    JSON.stringify(res.body),
    JSON.stringify({ success: false, code: 'BAD_REQUEST', message: 'PIS inválido', campo: 'pis' })
  );
});

test('createFuncionario: owner real delega apenas o create core minimo e preserva a cauda pos-persistencia', async () => {
  const {
    createFuncionario,
    callOrder,
    getSeamArgs,
    getPhotoUploadArgs,
    getBiometriaUploadArgs,
    getAutoUserArgs,
    getSaveFuncionarioCalls,
    wasCreateFuncionarioDocCalledDirectly,
  } = buildHarness();

  const req = buildReq({}, {
    file: { fieldname: 'foto', buffer: 'foto-buffer' },
    files: { anexos: [{ originalname: 'novo-anexo.pdf' }] },
  });
  const res = createApiRes();

  await createFuncionario(req, res);

  const seamArgs = getSeamArgs();
  assert.ok(seamArgs, 'A seam do create core minimo deve ser delegavel a partir do owner real');
  assert.equal(seamArgs.unidade_id, 'unit-001');
  assert.equal(seamArgs.nome, '  Maria Core  ');
  assert.equal(seamArgs.email, '  maria.core@example.com  ');
  assert.equal(seamArgs.observacoes, '  observacao core  ');
  assert.equal(seamArgs.rawBody, req.body);
  assert.equal(seamArgs.anexosFiles, req.files.anexos);
  assert.equal(typeof seamArgs.mapFiles, 'function');
  assert.equal(typeof seamArgs.createFuncionarioDoc, 'function');
  assert.equal('uploadFuncionarioFotoToBlob' in seamArgs, false);
  assert.equal('mapBiometriasFaciaisToBlob' in seamArgs, false);
  assert.equal('criarUsuarioAuto' in seamArgs, false);
  assert.equal('saveFuncionario' in seamArgs, false);
  assert.equal(wasCreateFuncionarioDocCalledDirectly(), false);

  assert.equal(
    JSON.stringify(callOrder),
    JSON.stringify(['core', 'foto', 'biometria', 'autoUser', 'created'])
  );
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
    JSON.stringify(getAutoUserArgs()),
    JSON.stringify({
      _id: 'func-001',
      foto: 'https://blob.invalid/func-001.webp',
      face_imagem: 'https://blob.invalid/face-1.webp',
    })
  );
  assert.equal(getSaveFuncionarioCalls().length, 2);
  assert.equal(res.statusCode, 201);
  assert.equal(
    JSON.stringify(res.body),
    JSON.stringify({
      success: true,
      id: 'func-001',
      data: { id: 'func-001', autoUser: { ok: true, outcome: 'created' } },
    })
  );
});

test('createFuncionario: owner real preserva tratamento de erro externo quando a seam falha', async () => {
  let photoCalled = false;
  let biometriaCalled = false;
  let autoUserCalled = false;

  const { createFuncionario, getServerErrorArg, getDuplicateArgs } = buildHarness({
    executeCreateFuncionarioCore: async () => {
      throw new Error('falha-core-induzida');
    },
    uploadFuncionarioFotoToBlob: async () => {
      photoCalled = true;
      throw new Error('nao deve subir foto quando a seam falha');
    },
    mapBiometriasFaciaisToBlob: async () => {
      biometriaCalled = true;
      throw new Error('nao deve subir biometria quando a seam falha');
    },
    criarUsuarioAuto: async () => {
      autoUserCalled = true;
      throw new Error('nao deve criar autoUser quando a seam falha');
    },
  });

  const req = buildReq();
  const res = createApiRes();

  await createFuncionario(req, res);

  assert.equal(photoCalled, false);
  assert.equal(biometriaCalled, false);
  assert.equal(autoUserCalled, false);
  assert.equal(getDuplicateArgs().length, 1);
  assert.ok(getDuplicateArgs()[0] instanceof Error);
  assert.equal(getServerErrorArg(), 'Erro ao cadastrar funcionário');
  assert.equal(
    JSON.stringify(res.body),
    JSON.stringify({ success: false, code: 'SERVER_ERROR', message: 'Erro ao cadastrar funcionário' })
  );
});