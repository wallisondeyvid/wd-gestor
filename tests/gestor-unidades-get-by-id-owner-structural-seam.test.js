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

function buildGetUnidadeByIdWithSeam() {
  const original = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'getUnidadeById');

  const installedSeamBlock = `const unidadeData = await getUnidadeDetailsPayload({ unidade, findDiretorAtivoByUnidadeSelectId, buildApiBancariaForResponse, warn: console.warn });`;
  if (original.includes(installedSeamBlock)) {
    return original;
  }

  const currentDetailBlock = `let diretorId = unidade.diretor_usuario_id;
  if (unidade.is_principal && !diretorId) {
    try {
      const diretor = await findDiretorAtivoByUnidadeSelectId(unidade._id);
      if (diretor) diretorId = diretor._id;
    } catch (e) {
      console.warn('[API UNIDADES][getById] Fallback diretor falhou:', e.message);
    }
  }
  const unidadeData = { _id: unidade._id, codigo: unidade.codigo, nome: unidade.nome, razaoSocial: unidade.razaoSocial, cnpj: unidade.cnpj, cpf: unidade.cpf, pessoaTipo: unidade.pessoaTipo, inscricaoEstadual: unidade.inscricaoEstadual, inscricaoMunicipal: unidade.inscricaoMunicipal, cnaePrincipal: unidade.cnaePrincipal, cnaeSecundarios: unidade.cnaeSecundarios, regimeTributario: unidade.regimeTributario, naturezaJuridica: unidade.naturezaJuridica, is_principal: unidade.is_principal, subunidade: unidade.subunidade, unidade_principal_id: unidade.unidade_principal_id, dataAbertura: unidade.dataAbertura, telefoneFixo: unidade.telefoneFixo, telefoneCelular: unidade.telefoneCelular, emailPrincipal: unidade.emailPrincipal, emailFiscal: unidade.emailFiscal, site: unidade.site, banco: unidade.banco, agencia: unidade.agencia, contaCorrente: unidade.contaCorrente, pixChave: unidade.pixChave, tipoPix: unidade.tipoPix, modulosAcessiveis: unidade.modulosAcessiveis, diretor_usuario_id: diretorId || null, endereco: unidade.endereco, logo: unidade.logo || null, apiBancaria: buildApiBancariaForResponse(unidade.apiBancaria) };`;

  const seamBlock = `const unidadeData = await getUnidadeDetailsPayload({
    unidade,
    findDiretorAtivoByUnidadeSelectId,
    buildApiBancariaForResponse,
    warn: console.warn,
  });`;

  const replaced = original.replace(currentDetailBlock, seamBlock);
  assert.notEqual(replaced, original, 'Nao conseguiu substituir o bloco atual de detalhe');
  return replaced;
}

test('getUnidadeById: owner real preserva lookup/autorizacao, admite seam no bloco de detalhe e responde por ok', async () => {
  const callOrder = [];
  let lookupId = null;
  let authorizeId = null;
  let resolveDetailsArgs = null;

  const getUnidadeById = buildFunction(
    buildGetUnidadeByIdWithSeam(),
    {
      findUnidadeById: async (id) => {
        callOrder.push('lookup');
        lookupId = id;
        return {
          _id: id,
          is_principal: true,
          diretor_usuario_id: null,
          apiBancaria: { persisted: true },
          logo: null,
        };
      },
      createUnidadePolicyContextCore: () => ({
        ensureCanAccessUnidade: async (unidadeId) => {
          callOrder.push('authorize');
          authorizeId = unidadeId;
          return true;
        },
      }),
      findDiretorAtivoByUnidadeSelectId: async (unidadeId) => ({ _id: `dir:${unidadeId}` }),
      buildApiBancariaForResponse: (value) => ({ normalized: true, value }),
      getUnidadeDetailsPayload: async (input) => {
        callOrder.push('resolveDetails');
        resolveDetailsArgs = input;

        let diretorId = input.unidade.diretor_usuario_id;
        if (input.unidade.is_principal && !diretorId) {
          const diretor = await input.findDiretorAtivoByUnidadeSelectId(input.unidade._id);
          if (diretor) diretorId = diretor._id;
        }

        return {
          _id: input.unidade._id,
          diretor_usuario_id: diretorId || null,
          logo: input.unidade.logo || null,
          apiBancaria: input.buildApiBancariaForResponse(input.unidade.apiBancaria),
        };
      },
      ok: (res, data) => {
        callOrder.push('ok');
        return res.status(200).json({ success: true, data });
      },
      badRequest: (res, message) => res.status(400).json({ success: false, message }),
      notFound: (res, message) => res.status(404).json({ success: false, message }),
      serverError: (res, error) => res.status(500).json({ success: false, message: error?.message }),
      console,
    }
  );

  const req = {
    user: { role: 'admin' },
    params: { id: 'u-matriz' },
  };
  const res = createApiRes();

  await getUnidadeById(req, res);

  assert.equal(lookupId, 'u-matriz');
  assert.equal(authorizeId, 'u-matriz');

  assert.ok(resolveDetailsArgs, 'O bloco atual de detalhe deve ser extraivel via seam adapter');
  assert.equal(resolveDetailsArgs.unidade._id, 'u-matriz');

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      _id: 'u-matriz',
      diretor_usuario_id: 'dir:u-matriz',
      logo: null,
      apiBancaria: {
        normalized: true,
        value: { persisted: true },
      },
    },
  });

  assert.deepEqual(callOrder, [
    'lookup',
    'authorize',
    'resolveDetails',
    'ok',
  ]);
});