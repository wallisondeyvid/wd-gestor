import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const FACADE_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/data/funcionarios/funcionarioDeletePostDataFacade.js');
const SERVICE_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/services/funcionarios/deleteFuncionarioPostExecution.service.js');
const STRUCTURAL_TEST_FILE = path.resolve(process.cwd(), 'tests/gestor-funcionarios-delete-post-structural-seam.test.js');
const RUNTIME_TEST_FILE = path.resolve(process.cwd(), 'tests/gestor-funcionarios-delete-post-runtime-contract.test.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('delete-post ja preserva cobertura do contrato publico observavel nos testes adjacentes', () => {
  const structuralSource = readText(STRUCTURAL_TEST_FILE);
  const runtimeSource = readText(RUNTIME_TEST_FILE);

  assert.match(
    structuralSource,
    /DELETE_POST_DATA_FACADE_MOCK_MODULE_URL/,
    'o teste estrutural atual deve continuar mockando o data facade para preservar o seam do controller/service sem abrir banco real',
  );

  assert.match(
    runtimeSource,
    /sem sessao retorna unauthorized em JSON/,
    'o contrato runtime atual deve continuar cobrindo o bloqueio de usuario nao autenticado',
  );

  assert.match(
    runtimeSource,
    /com alvo master vinculado retorna forbidden/,
    'o contrato runtime atual deve continuar cobrindo o bloqueio de vinculo master',
  );

  assert.match(
    runtimeSource,
    /fora do escopo contextual retorna alreadyRemoved sem tocar no alvo/,
    'o contrato runtime atual deve continuar cobrindo a idempotencia observavel fora do escopo contextual',
  );

  assert.match(
    runtimeSource,
    /remove o funcionario da unidade ativa e retorna redirect em JSON/,
    'o contrato runtime atual deve continuar cobrindo o delete legitimo da unidade ativa',
  );
});

test('service do delete-post recebe canonicalUnitId antes de resolver o usuario vinculado', () => {
  const serviceSource = readText(SERVICE_FILE);

  assert.match(
    serviceSource,
    /const scopedUnitId = normalizeUnitId\(canonicalUnitId\) \|\| null;/,
    'o service deve continuar derivando scopedUnitId a partir do canonicalUnitId antes de chamar o data facade',
  );

  assert.match(
    serviceSource,
    /findFuncionarioForDeletePostData\([\s\S]*unidadeId:\s*scopedUnitId[\s\S]*findLinkedUserForDeletePostData\(\{ funcionarioId: funcionario\._id \}\)/,
    'o service deve continuar localizando o funcionario sob contexto de unidade antes de resolver o usuario vinculado',
  );

  assert.match(
    serviceSource,
    /const effectiveUnitId = scopedUnitId \|\| normalizeUnitId\(funcionario\?\.unidade_id\) \|\| null;/,
    'o service deve continuar preservando o contexto efetivo para o delete do funcionario',
  );
});

test('protecao tenant-aware exige contexto explicito no seam de usuario vinculado', () => {
  const facadeSource = readText(FACADE_FILE);

  assert.match(
    facadeSource,
    /findLinkedUserForDeletePostData/,
    'o seam sensivel deve continuar existindo de forma explicita para que o teste proteja sua assinatura',
  );

  assert.match(
    facadeSource,
    /export async function findLinkedUserForDeletePostData\s*\(\s*\{\s*funcionarioId\s*,\s*(unidadeId|unitScope|canonicalUnitId)/,
    'quando houver contexto tenant-aware disponivel antes da facade, o seam de usuario vinculado deve aceitar unidadeId, unitScope ou canonicalUnitId de forma explicita',
  );
});

test('protecao tenant-aware nao aceita GLOBAL_SCOPE incondicional para resolver usuario vinculado', () => {
  const facadeSource = readText(FACADE_FILE);

  assert.doesNotMatch(
    facadeSource,
    /findUserByFuncionarioIdRepo\(\{\s*unitScope:\s*GLOBAL_SCOPE\s*,\s*funcionarioId\s*\}\)/,
    'o seam nao deve manter leitura global incondicional de usuario vinculado; qualquer fallback global futuro precisa ser explicito, condicionado e documentado',
  );
});