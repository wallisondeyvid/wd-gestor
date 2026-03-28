import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/unidadeApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function extractExportedAsyncFunction(source, functionName) {
  const signature = `export async function ${functionName}`;
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

test('createUnidade: owner real monta doc, persiste, vincula diretor, delega provisioning e encerra HTTP', async () => {
  const callOrder = [];
  let createDocArg = null;
  let docMontado = null;
  let saveDocArg = null;
  let diretorLinkArgs = null;
  let orchestrateArg = null;
  let createUnidadeWriteArg = null;

  const orchestrateUnitProvisioning = async (params) => {
    callOrder.push('orchestrateUnitProvisioning');
    orchestrateArg = params;
  };

  const createUnidade = buildFunction(
    extractExportedAsyncFunction(CONTROLLER_SOURCE, 'createUnidade'),
    {
      findUltimaUnidadePorCodigo: async () => null,
      findUnidadeByCodigo: async () => null,
      findUnidadeByCpf: async () => null,
      findUnidadeByCnpj: async () => null,
      findSubunidadesByUnidadePrincipal: async () => [],
      findUnidadeById: async () => null,
      updateUserUnidadeById: async (diretorId, unidadeId) => {
        callOrder.push('updateUserUnidadeById');
        diretorLinkArgs = [diretorId, unidadeId];
      },
      saveUnidadeDoc: async (doc) => {
        callOrder.push('saveUnidadeDoc');
        saveDocArg = doc;
        return {
          ...doc,
          _id: 'id-123',
          logo: null,
          apiBancaria: { persisted: true },
          toObject: () => ({
            ...doc,
            _id: 'id-123',
            logo: null,
            apiBancaria: { persisted: true },
          }),
        };
      },
      createUnidadeDoc: async (doc) => {
        callOrder.push('createUnidadeDoc');
        createDocArg = doc;
        docMontado = { __docMontado: true, ...doc };
        return docMontado;
      },
      ensureUnitProvisioned: async () => {},
      orchestrateUnitProvisioning,
      createUnidadeWrite: async (params) => {
        createUnidadeWriteArg = params;
        const novaUnidade = await params.createUnidadeDoc({
          codigo: params.input.codigo,
          nome: params.input.nomeFantasia,
          razaoSocial: params.input.razaoSocial || null,
          cnpj: params.input.finalCnpj,
          cpf: params.input.cpf ? params.input.cpf.replace(/\D/g, '') : null,
          pessoaTipo: params.input.pessoaTipo,
          inscricaoEstadual: params.input.inscricaoEstadual || null,
          inscricaoMunicipal: params.input.inscricaoMunicipal || null,
          cnaePrincipal: params.input.cnaePrincipal || null,
          cnaeSecundarios: params.input.cnaeSecundarios || null,
          regimeTributario: params.input.regimeTributario || null,
          naturezaJuridica: params.input.naturezaJuridica || null,
          is_principal: params.input.isPrincipal,
          subunidade: params.input.isSubunidade,
          unidade_principal_id: params.input.isSubunidade ? params.input.effectivePrincipalUnitId : null,
          dataAbertura: params.parseDateBRorISO(params.input.dataAbertura),
          endereco: params.input.endereco || null,
          telefoneFixo: params.input.telefoneFixo || null,
          telefoneCelular: params.input.telefoneCelular || null,
          emailPrincipal: params.input.emailPrincipal || null,
          emailFiscal: params.input.emailFiscal || null,
          site: params.input.site || null,
          banco: params.input.banco || null,
          agencia: params.input.agencia || null,
          contaCorrente: params.input.contaCorrente || null,
          pixChave: params.input.pixChave || null,
          tipoPix: params.input.tipoPix,
          modulosAcessiveis: params.input.modulosSelecionados,
          diretor_usuario_id: params.input.isPrincipal && params.input.diretor_usuario_id ? params.input.diretor_usuario_id : null,
          is_active: true,
          logo: null,
          apiBancaria: params.input.apiBancariaPayload,
        });

        const unidadeSalva = await params.saveUnidadeDoc(novaUnidade);
        if (params.input.isPrincipal && params.input.diretor_usuario_id) {
          await params.updateUserUnidadeById(params.input.diretor_usuario_id, unidadeSalva._id);
        }

        await params.orchestrateUnitProvisioning({
          unidadeId: unidadeSalva._id,
          is_principal: params.input.isPrincipal,
          subunidade: params.input.isSubunidade,
          modulosAcessiveis: params.input.modulosSelecionados,
          resolveTipoUnidadeProvisionada: params.resolveTipoUnidadeProvisionada,
          ensureUnitProvisioned: params.ensureUnitProvisioned,
        });

        return unidadeSalva;
      },
      parseDateBRorISO: (v) => v,
      validarCnpj: () => true,
      calcularDigitoVerificador: () => '0',
      resolveRequestedPrincipalUnitId: async () => ({ ok: true, principalUnitId: null }),
      ensureCanAccessUnidade: async () => true,
      buildApiBancariaForResponse: (v) => ({ normalized: true, value: v }),
      sanitizeApiBancariaInput: (v) => ({ sanitized: true, original: v }),
      resolveTipoUnidadeProvisionada: () => 'principal',
      created: (res, id, payload) => {
        callOrder.push('created');
        return res.status(201).json({ id, ...payload });
      },
      ok: (res, data) => res.status(201).json({ success: true, data }),
      badRequest: (res, msg) => res.status(400).json({ success: false, message: msg }),
      notFound: (res, msg) => res.status(404).json({ success: false, message: msg }),
      serverError: (res, err) => res.status(500).json({ success: false, message: err?.message }),
      console,
    }
  );

  const req = {
    user: { role: 'admin', isMaster: true },
    body: {
      nomeFantasia: 'Unidade Teste',
      razaoSocial: 'Razao Teste',
      pessoaTipo: 'pj',
      cnpj: '12.345.678/0001-99',
      emailPrincipal: 'teste@exemplo.com',
      principal: true,
      subunidade: false,
      diretor_usuario_id: 'dir-1',
      modulosAcessiveis: ['mod1', 'mod2'],
      apiBancaria: { clientId: 'client-1' },
    },
  };
  const res = createApiRes();
  await createUnidade(req, res);

  assert.ok(createUnidadeWriteArg, 'O owner deve delegar a fronteira menor ao use case extraido');
  assert.ok(createDocArg, 'O owner deve montar o doc final antes da persistencia');
  assert.equal(createDocArg.nome, 'Unidade Teste');
  assert.equal(createDocArg.cnpj, '12345678000199');
  assert.deepEqual(createDocArg.modulosAcessiveis, ['mod1', 'mod2']);
  assert.deepEqual(createDocArg.apiBancaria, {
    sanitized: true,
    original: { clientId: 'client-1' },
  });

  assert.equal(saveDocArg, docMontado, 'O owner deve persistir exatamente o doc montado');
  assert.deepEqual(diretorLinkArgs, ['dir-1', 'id-123'], 'O vinculo do diretor deve usar o id persistido');

  assert.ok(orchestrateArg, 'O owner deve delegar para orchestrateUnitProvisioning');
  assert.deepEqual(
    Object.keys(orchestrateArg).sort(),
    [
      'ensureUnitProvisioned',
      'is_principal',
      'modulosAcessiveis',
      'resolveTipoUnidadeProvisionada',
      'subunidade',
      'unidadeId',
    ].sort()
  );
  assert.equal(orchestrateArg.unidadeId, 'id-123');
  assert.equal(orchestrateArg.is_principal, true);
  assert.equal(orchestrateArg.subunidade, false);
  assert.deepEqual(orchestrateArg.modulosAcessiveis, ['mod1', 'mod2']);
  assert.equal(typeof orchestrateArg.resolveTipoUnidadeProvisionada, 'function');
  assert.equal(typeof orchestrateArg.ensureUnitProvisioned, 'function');

  assert.equal(res.statusCode, 201, 'O owner deve encerrar o HTTP em sucesso');
  assert.equal(res.body.id, 'id-123');
  assert.equal(res.body.data._id, 'id-123');

  assert.deepEqual(callOrder, [
    'createUnidadeDoc',
    'saveUnidadeDoc',
    'updateUserUnidadeById',
    'orchestrateUnitProvisioning',
    'created',
  ]);
});
