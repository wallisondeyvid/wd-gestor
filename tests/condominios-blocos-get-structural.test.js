import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const filePath = path.resolve(process.cwd(), 'src/modules/condominios/app/services/blocos.service.js');

async function readSource() {
  return fs.readFile(filePath, 'utf8');
}

function extractBlock(source, signature, nextSignature = '\nexport ') {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `bloco não encontrado: ${signature}`);

  const end = source.indexOf(nextSignature, start + signature.length);
  if (end === -1) return source.slice(start);
  return source.slice(start, end);
}

test('GET de blocos separa unidade requisitada, disponibilidade, filtro e leitura do repositório', async () => {
  const source = await readSource();

  const requestedUnitBlock = extractBlock(
    source,
    'function resolveBlocosListRequestedUnidade({ req, mongoose }) {',
    '\nfunction assertBlocosListDbAvailable({'
  );
  const dbBlock = extractBlock(
    source,
    'function assertBlocosListDbAvailable({ mongoose }) {',
    '\nasync function buildBlocosListFilter({'
  );
  const filterBlock = extractBlock(
    source,
    'async function buildBlocosListFilter({ req, unidade, listarUnidadesParaUsuario }) {',
    '\nasync function readBlocosList({'
  );
  const readBlock = extractBlock(
    source,
    'async function readBlocosList({ repo, filter }) {',
    '\nexport async function listarBlocosService({'
  );
  const serviceBlock = extractBlock(
    source,
    'export async function listarBlocosService({',
    '\nfunction assertDbAvailable({'
  );

  assert.match(requestedUnitBlock, /req\.query\.unidade \|\| req\.query\.unidade_id \|\| ''/);
  assert.match(requestedUnitBlock, /shouldReturnEmpty: true/);
  assert.doesNotMatch(requestedUnitBlock, /repo\.findMany\(/);

  assert.match(dbBlock, /mongoose\.connection\.readyState !== 1/);
  assert.match(dbBlock, /__httpStatus = 503/);

  assert.match(filterBlock, /ativo: \{ \$ne: false \}/);
  assert.match(filterBlock, /listarUnidadesParaUsuario\(ctxUser\)/);
  assert.doesNotMatch(filterBlock, /repo\.findMany\(/);

  assert.match(readBlock, /repo\.findMany\(/);
  assert.match(readBlock, /selectFields: '_id nome unidade_id ordem'/);
  assert.doesNotMatch(readBlock, /listarUnidadesParaUsuario\(/);

  assert.match(serviceBlock, /const requestedUnidade = resolveBlocosListRequestedUnidade\(\{ req, mongoose \}\);/);
  assert.match(serviceBlock, /assertBlocosListDbAvailable\(\{ mongoose \}\);/);
  assert.match(serviceBlock, /const filter = await buildBlocosListFilter\(\{/);
  assert.match(serviceBlock, /const blocos = await readBlocosList\(\{ repo, filter \}\);/);
  assert.doesNotMatch(serviceBlock, /req\.query\.unidade \|\| req\.query\.unidade_id/);
  assert.doesNotMatch(serviceBlock, /mongoose\.connection\.readyState !== 1/);
  assert.doesNotMatch(serviceBlock, /repo\.findMany\(/);
});