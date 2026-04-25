import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const filePath = path.resolve(process.cwd(), 'src/modules/condominios/app/condominios-app.js');

async function readSource() {
  return fs.readFile(filePath, 'utf8');
}

function extractBlock(source, signature, nextSignature = '\napp.') {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `bloco não encontrado: ${signature}`);

  const end = source.indexOf(nextSignature, start + signature.length);
  if (end === -1) return source.slice(start);
  return source.slice(start, end);
}

test('GET de listagem de solicitações separa escopo, filtro de consulta e resposta final', async () => {
  const source = await readSource();

  const scopeBlock = extractBlock(
    source,
    'async function resolveServiceRequestListReadScope({ req, unidadeParam }) {',
    '\nfunction buildServiceRequestListQueryFilter({'
  );
  const filterBlock = extractBlock(
    source,
    'function buildServiceRequestListQueryFilter({ statusParam, unidadeFilter }) {',
    '\nasync function buildServiceRequestListResponsePayload({'
  );
  const responseBlock = extractBlock(
    source,
    'async function buildServiceRequestListResponsePayload({ filter }) {',
    "\napp.get('/api/solicitacoes-servico/:id', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.get('/api/servicos/solicitacoes', async (req, res) => {",
    "\napp.get('/api/habitacoes/:id/reservas', async (req, res) => {"
  );

  assert.match(scopeBlock, /listarUnidadesParaUsuario\(ctxUser\)/);
  assert.match(scopeBlock, /Unidade fora do escopo do usuário/);
  assert.match(scopeBlock, /return \{ empty: true \ }|return \{ empty: true \};/);
  assert.doesNotMatch(scopeBlock, /CondSolicitacaoServico\.find\(/);

  assert.match(filterBlock, /statusParam\.split\(','\)/);
  assert.match(filterBlock, /status: statusArray\.length \? \{ \$in: statusArray \} : \{ \$in: \['aberto', 'aceita'\] \}/);
  assert.match(filterBlock, /filter\.unidade_id = unidadeFilter/);

  assert.match(responseBlock, /CondSolicitacaoServico\.find\(filter\)/);
  assert.match(responseBlock, /sort\(\{ createdAt: -1 \}\)/);
  assert.match(responseBlock, /limit\(120\)/);
  assert.match(responseBlock, /return \{ data: docs \|\| \[\] \};|return \{ data: docs \|\| \[\] \ };/);

  assert.match(routeBlock, /const listScope = await resolveServiceRequestListReadScope\(\{ req, unidadeParam \}\);/);
  assert.match(routeBlock, /const filter = buildServiceRequestListQueryFilter\(\{/);
  assert.match(routeBlock, /buildServiceRequestListResponsePayload\(\{ filter \}\)/);
  assert.doesNotMatch(routeBlock, /CondSolicitacaoServico\.find\(/);
  assert.doesNotMatch(routeBlock, /listarUnidadesParaUsuario\(ctxUser\)/);
});