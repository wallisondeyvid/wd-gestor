import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/funcionarios/loadPaginaFuncionariosBundle.service.js');
const SERVICE_SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao encontrou assinatura: ${signature}`);

  const paramsEnd = source.indexOf(')', start);
  assert.ok(paramsEnd >= 0, `Nao encontrou fechamento de parametros para: ${signature}`);

  const braceStart = source.indexOf('{', paramsEnd);
  assert.ok(braceStart >= 0, `Nao encontrou bloco para: ${signature}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1).replace(/^export\s+/, '');
      }
    }
  }

  throw new Error(`Nao conseguiu extrair funcao: ${signature}`);
}

function buildFunction(source, signature, context = {}) {
  const functionSource = extractFunction(source, signature);
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

test('loadPaginaFuncionariosBundle preserva os ramos contextual, vazio e privilegiado global', async () => {
  const scopedBundleCalls = [];
  const privilegedBundleCalls = [];

  const loadPaginaFuncionariosBundle = buildFunction(SERVICE_SOURCE, 'export async function loadPaginaFuncionariosBundle', {
    loadScopedPaginaFuncionariosBundleData: async (context) => {
      scopedBundleCalls.push(context);
      return {
        funcoesFiltradas: [{ _id: 'f-1', codigo: '001', nome: 'Recepcao', descricao: '' }],
        setoresFiltrados: [{ _id: 's-1', nome: 'Administrativo', descricao: 'Setor A' }],
        funcionarios: [{ _id: 'func-1', nome: 'Maria' }],
      };
    },
    loadPrivilegedPaginaFuncionariosBundleData: async () => {
      privilegedBundleCalls.push(true);
      return {
        unidadesFiltradas: [{ _id: 'u-1', codigo: 'A', nome: 'Matriz A' }],
        funcoesFiltradas: [{ _id: 'fg-1', nome: 'Operador' }],
        setoresFiltrados: [{ _id: 'sg-1', nome: 'Financeiro' }],
        funcionarios: [{ _id: 'func-1', nome: 'Maria' }],
      };
    },
  });

  let result = await loadPaginaFuncionariosBundle({
    req: { user: { id: 'user-1' } },
    privilegedUser: false,
    loadScopedOperationalUnitContext: async () => ({
      operationalUnitId: 'u-operacional',
      operationalUnit: { _id: 'u-operacional', nome: 'Filial B' },
      principalUnitId: 'u-principal',
    }),
  });

  assert.equal(result.unidadeContextualId, 'u-operacional');
  assert.equal(result.unidadesFiltradas.length, 1);
  assert.equal(result.unidadesFiltradas[0]._id, 'u-operacional');
  assert.equal(result.funcoesFiltradas.length, 1);
  assert.equal(result.funcoesFiltradas[0].codigo, '001');
  assert.equal(result.setoresFiltrados.length, 1);
  assert.equal(result.setoresFiltrados[0].nome, 'Administrativo');
  assert.equal(result.funcionarios.length, 1);
  assert.equal(scopedBundleCalls.length, 1);
  assert.equal(JSON.stringify(scopedBundleCalls[0]), JSON.stringify({
    operationalUnitId: 'u-operacional',
    principalUnitId: 'u-principal',
  }));

  result = await loadPaginaFuncionariosBundle({
    req: { user: { id: 'user-2' } },
    privilegedUser: false,
    loadScopedOperationalUnitContext: async () => ({
      operationalUnitId: '',
      operationalUnit: null,
      principalUnitId: '',
    }),
  });

  assert.equal(result.unidadeContextualId, '');
  assert.equal(result.unidadesFiltradas.length, 0);
  assert.equal(result.funcoesFiltradas.length, 0);
  assert.equal(result.setoresFiltrados.length, 0);
  assert.equal(result.funcionarios.length, 0);

  result = await loadPaginaFuncionariosBundle({
    req: { user: { id: 'user-3' } },
    privilegedUser: true,
    loadScopedOperationalUnitContext: async () => ({
      operationalUnitId: '',
      operationalUnit: null,
      principalUnitId: '',
    }),
  });

  assert.equal(result.unidadeContextualId, '');
  assert.equal(result.unidadesFiltradas.length, 1);
  assert.equal(result.unidadesFiltradas[0]._id, 'u-1');
  assert.equal(result.funcoesFiltradas.length, 1);
  assert.equal(result.funcoesFiltradas[0]._id, 'fg-1');
  assert.equal(result.setoresFiltrados.length, 1);
  assert.equal(result.setoresFiltrados[0]._id, 'sg-1');
  assert.equal(result.funcionarios.length, 1);
  assert.equal(privilegedBundleCalls.length, 1);
});