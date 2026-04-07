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
  const runtimeContext = {
    ...context,
    createUnidadePolicyContextCore: context.createUnidadePolicyContextCore || (() => ({
      ensureCanAccessUnidade: (unidadeId) => context.ensureCanAccessUnidade?.(context.__currentReqForPolicyContext, unidadeId),
      resolveRequestedPrincipalUnitId: (requestedPrincipalUnitId, fallbackPrincipalUnitId) => context.resolveRequestedPrincipalUnitId?.(
        context.__currentReqForPolicyContext,
        requestedPrincipalUnitId,
        fallbackPrincipalUnitId,
      ),
    })),
  };
  return script.runInNewContext(runtimeContext);
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

function buildUpdateUnidade(context = {}) {
  const functionSource = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'updateUnidade');
  return async function updateUnidadeWithRuntimeReq(req, res) {
    const executable = buildFunction(functionSource, {
      ...context,
      __currentReqForPolicyContext: req,
    });
    return executable(req, res);
  };
}

test('updateUnidade: owner real persiste updated, serializa e responde por ok', async () => {
  const callOrder = [];
  let capturedUpdate = null;
  let persistedApiBancaria = null;
  let updateUnidadeWriteArg = null;

  const updateUnidade = buildUpdateUnidade({
      findUnidadeById: async (id) => ({
        _id: id,
        diretor_usuario_id: 'dir-existente',
        unidade_principal_id: null,
        logo: 'https://cdn.example.test/logo-antiga.webp',
      }),
      ensureCanAccessUnidade: async () => true,
      resolveRequestedPrincipalUnitId: async () => ({ ok: true, principalUnitId: null }),
      findUnidadeByCpfExcludingId: async () => null,
      findUnidadeByCnpjExcludingId: async () => null,
      validarCnpj: () => true,
      sanitizeApiBancariaInput: (value) => ({ sanitized: true, original: value }),
      parseDateBRorISO: (value) => `parsed:${value}`,
      updateUnidadeByIdWithValidators: async (id, updated) => {
        callOrder.push('persist');
        capturedUpdate = { id, updated };
        return {
          _id: id,
          logo: updated.logo,
          apiBancaria: { persisted: true },
          toObject() {
            callOrder.push('serialize');
            return {
              _id: id,
              ...updated,
              apiBancaria: { persisted: true },
            };
          },
        };
      },
      updateUnidadeWrite: async (params) => {
        updateUnidadeWriteArg = params;
        return params.updateUnidadeByIdWithValidators(params.unidadeId, {
          nome: params.input.nomeFantasia,
          razaoSocial: params.input.razaoSocial || null,
          cnpj: params.input.pessoaTipo === 'pj' ? params.input.cleanedCnpj : null,
          cpf: params.input.pessoaTipo === 'pf' ? (params.input.cpf ? params.input.cpf.replace(/\D/g, '') : null) : null,
          pessoaTipo: params.input.pessoaTipo,
          dataAbertura: params.parseDateBRorISO(params.input.dataAbertura),
          inscricaoEstadual: params.input.inscricaoEstadual || null,
          inscricaoMunicipal: params.input.inscricaoMunicipal || null,
          cnaePrincipal: params.input.cnaePrincipal || null,
          cnaeSecundarios: params.input.cnaeSecundarios || null,
          regimeTributario: params.input.regimeTributario || null,
          naturezaJuridica: params.input.naturezaJuridica || null,
          tipoLogradouro: params.input.tipoLogradouro || null,
          logradouro: params.input.logradouro || null,
          numero: params.input.numero || null,
          complemento: params.input.complemento || null,
          bairro: params.input.bairro || null,
          cep: params.input.cep || null,
          cidade: params.input.cidade || null,
          estado: params.input.estado || null,
          codigoIbgeMunicipio: params.input.codigoIbgeMunicipio || null,
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
          modulosAcessiveis: Array.isArray(params.input.modulosAcessiveis)
            ? params.input.modulosAcessiveis
            : (params.input.modulosAcessiveis ? [params.input.modulosAcessiveis] : []),
          diretor_usuario_id: params.input.diretor_usuario_id,
          is_principal: params.input.subunidade === 'false',
          subunidade: params.input.subunidade === 'true',
          unidade_principal_id: params.input.effectivePrincipalUnitId,
          endereco: params.input.endereco || null,
          apiBancaria: params.input.apiBancariaPayload,
          logo: params.input.logo || null,
        });
      },
      buildApiBancariaForResponse: (value) => {
        callOrder.push('normalizeApiBancariaResponse');
        persistedApiBancaria = value;
        return { normalized: true, value };
      },
      ok: (res, data) => {
        callOrder.push('ok');
        return res.status(200).json({ success: true, data });
      },
      badRequest: (res, message) => res.status(400).json({ success: false, message }),
      notFound: (res, message) => res.status(404).json({ success: false, message }),
      serverError: (res, error) => res.status(500).json({ success: false, message: error?.message }),
      console,
    });

  const req = {
    user: { role: 'admin', isMaster: false },
    params: { id: 'u-edit' },
    body: {
      nomeFantasia: 'Clinica Renovada',
      razaoSocial: 'Clinica Renovada LTDA',
      cnpj: '12.345.678/0001-95',
      cpf: '',
      pessoaTipo: 'pj',
      subunidade: 'false',
      unidadePrincipal: '',
      dataAbertura: '2024-02-03',
      emailPrincipal: 'contato@renovada.test',
      emailFiscal: 'fiscal@renovada.test',
      pixChave: 'pix@renovada.test',
      tipoPix: 'email',
      modulosAcessiveis: 'financeiro',
      apiBancaria: { clientId: 'bank-client' },
    },
  };
  const res = createApiRes();

  await updateUnidade(req, res);

  assert.ok(updateUnidadeWriteArg, 'O owner deve delegar a fronteira minima ao use case extraido');
  assert.ok(capturedUpdate, 'O owner deve enviar o payload final para persistencia');
  assert.equal(capturedUpdate.id, 'u-edit');
  assert.equal(typeof capturedUpdate.updated, 'object');
  assert.deepEqual(capturedUpdate.updated.apiBancaria, {
    sanitized: true,
    original: { clientId: 'bank-client' },
  });
  assert.equal(capturedUpdate.updated.logo, 'https://cdn.example.test/logo-antiga.webp');

  assert.deepEqual(persistedApiBancaria, { persisted: true });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.unidade.apiBancaria, {
    normalized: true,
    value: { persisted: true },
  });

  assert.deepEqual(callOrder, [
    'persist',
    'serialize',
    'normalizeApiBancariaResponse',
    'ok',
  ]);
});