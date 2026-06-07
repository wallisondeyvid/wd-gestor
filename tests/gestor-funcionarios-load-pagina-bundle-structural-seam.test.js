import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SERVICE_PATH = path.join(
  process.cwd(),
  'src/modules/gestor/app/services/funcionarios/loadPaginaFuncionariosBundle.service.js',
);
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

test('loadPaginaFuncionariosBundle preserva ramos scoped, vazio e privilegiado global', async () => {
  const scopedBundleCalls = [];
  const privilegedBundleCalls = [];

  const loadPaginaFuncionariosBundle = buildFunction(
    SERVICE_SOURCE,
    'export async function loadPaginaFuncionariosBundle',
    {
      loadScopedPaginaFuncionariosBundleData: async (context) => {
        scopedBundleCalls.push(context);

        return {
          funcoesFiltradas: [
            {
              _id: 'f-1',
              codigo: '001',
              nome: 'Recepcao',
              descricao: '',
            },
          ],
          setoresFiltrados: [
            {
              _id: 's-1',
              nome: 'Administrativo',
              descricao: 'Setor A',
            },
          ],
          funcionarios: [
            {
              _id: 'func-1',
              nome: 'Maria',
            },
          ],
        };
      },

      loadPrivilegedPaginaFuncionariosBundleData: async () => {
        privilegedBundleCalls.push(true);

        return {
          unidadesFiltradas: [
            {
              _id: 'u-operacional',
              codigo: 'B',
              nome: 'Filial B',
            },
            {
              _id: 'u-outra',
              codigo: 'C',
              nome: 'Filial C',
            },
          ],
          funcoesFiltradas: [
            {
              _id: 'fg-1',
              nome: 'Operador',
            },
          ],
          setoresFiltrados: [
            {
              _id: 'sg-1',
              nome: 'Financeiro',
            },
          ],
          funcionarios: [
            {
              _id: 'func-2',
              nome: 'Joao',
            },
          ],
        };
      },
    },
  );

  // 1. Master/Admin global com unidade ativa:
  // unidadesFiltradas vem global para permitir troca de unidade,
  // mas funcoes/setores/funcionarios permanecem scoped pela unidade ativa.
  let result = await loadPaginaFuncionariosBundle({
    req: {
      user: {
        id: 'user-1',
        role: 'master',
        isMaster: true,
      },
    },
    privilegedUser: true,
    loadScopedOperationalUnitContext: async () => ({
      operationalUnitId: 'u-operacional',
      operationalUnit: {
        _id: 'u-operacional',
        nome: 'Filial B',
      },
      principalUnitId: 'u-principal',
    }),
  });

  assert.equal(result.unidadeContextualId, 'u-operacional');
  assert.equal(result.unidadesFiltradas.length, 2);

  const unidadeIds = result.unidadesFiltradas.map((unidade) => unidade._id);
  assert.ok(unidadeIds.includes('u-operacional'));
  assert.ok(unidadeIds.includes('u-outra'));

  assert.equal(result.funcoesFiltradas.length, 1);
  assert.equal(result.funcoesFiltradas[0].codigo, '001');
  assert.equal(result.setoresFiltrados.length, 1);
  assert.equal(result.setoresFiltrados[0].nome, 'Administrativo');
  assert.equal(result.funcionarios.length, 1);
  assert.equal(result.funcionarios[0]._id, 'func-1');

  assert.equal(scopedBundleCalls.length, 1);
assert.equal(scopedBundleCalls[0].operationalUnitId, 'u-operacional');
assert.equal(scopedBundleCalls[0].principalUnitId, 'u-principal');

  // 2. User/diretor comum sem unidade ativa:
  // nao recebe lista global indevida.
  result = await loadPaginaFuncionariosBundle({
    req: {
      user: {
        id: 'user-2',
        role: 'diretor',
      },
    },
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

  // 3. Master/Admin global sem unidade ativa:
  // mantém o comportamento de modo global completo.
  result = await loadPaginaFuncionariosBundle({
    req: {
      user: {
        id: 'user-3',
        role: 'master',
        isMaster: true,
      },
    },
    privilegedUser: true,
    loadScopedOperationalUnitContext: async () => ({
      operationalUnitId: '',
      operationalUnit: null,
      principalUnitId: '',
    }),
  });

  assert.equal(result.unidadeContextualId, '');
  assert.equal(result.unidadesFiltradas.length, 2);

  const unidadeIdsGlobais = result.unidadesFiltradas.map((unidade) => unidade._id);
  assert.ok(unidadeIdsGlobais.includes('u-operacional'));
  assert.ok(unidadeIdsGlobais.includes('u-outra'));

  assert.equal(result.funcoesFiltradas.length, 1);
  assert.equal(result.funcoesFiltradas[0]._id, 'fg-1');
  assert.equal(result.setoresFiltrados.length, 1);
  assert.equal(result.setoresFiltrados[0]._id, 'sg-1');
  assert.equal(result.funcionarios.length, 1);
  assert.equal(result.funcionarios[0]._id, 'func-2');

  assert.equal(privilegedBundleCalls.length, 2);
});