import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = 'src/modules/mensagens/app/mensagens-app.js';

function readSource() {
  return fs.readFileSync(sourcePath, 'utf8');
}

function extractRouteBlock(src) {
  const startNeedle = "app.get('/api/modulos',";
  const endNeedle = "app.put('/api/usuario/senha'";

  const start = src.indexOf(startNeedle);
  assert.notEqual(start, -1, 'GET /api/modulos deve existir no módulo Mensagens');

  const end = src.indexOf(endNeedle, start);
  assert.notEqual(end, -1, 'GET /api/modulos deve ficar antes de PUT /api/usuario/senha');

  return src.slice(start, end);
}

test('Mensagens: GET /api/modulos não deve ser stub vazio', () => {
  const src = readSource();
  const block = extractRouteBlock(src);

  assert.match(
    block,
    /app\.get\('\/api\/modulos',\s*async\s*\(req,\s*res\)/,
    'GET /api/modulos deve ser rota async com acesso a req/res'
  );

  assert.doesNotMatch(
    block,
    /app\.get\('\/api\/modulos',\s*\(_req,\s*res\)\s*=>\s*\{\s*return\s+res\.json\(\{\s*success:\s*true,\s*data:\s*\[\],\s*modulos:\s*\[\]\s*\}\);?\s*\}\);/s,
    'GET /api/modulos não pode voltar a ser stub fixo com data/modulos vazios'
  );

  assert.match(
    block,
    /req\.user\s*\|\|\s*req\.session\?\.mensagensUser\s*\|\|\s*req\.session\?\.user/,
    'rota deve resolver usuário por req.user, req.session.mensagensUser ou req.session.user'
  );

  assert.match(
    block,
    /await import\('#models\/modulo\.js'\)/,
    'rota deve carregar o model Modulo para master/admin'
  );

  assert.match(
    block,
    /await import\('#models\/unidade\.js'\)/,
    'rota deve carregar Unidade para módulos acessíveis por unidade'
  );

  assert.match(
    block,
    /await import\('#models\/Funcionario\.js'\)/,
    'rota deve carregar Funcionario para módulos por função'
  );

  assert.match(
    block,
    /await import\('#models\/funcao\.js'\)/,
    'rota deve carregar Funcao para módulos habilitados da função'
  );

  assert.match(
    block,
    /return\s+res\.json\(\{\s*success:\s*true,\s*data,\s*modulos:\s*data\s*\}\)/,
    'rota deve retornar data e modulos para compatibilidade com navbar'
  );
});
