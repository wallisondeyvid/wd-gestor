import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = 'src/modules/condominios/app/condominios-app.js';

function readSource() {
  return fs.readFileSync(sourcePath, 'utf8');
}

function extractGetCtxUser(src) {
  const startNeedle = 'function getCtxUser(req) {';
  const start = src.indexOf(startNeedle);
  assert.notEqual(start, -1, 'getCtxUser deve existir');

  const endNeedle = '\nfunction userCanScopeAll';
  const end = src.indexOf(endNeedle, start);
  assert.notEqual(end, -1, 'fim de getCtxUser deve existir antes de userCanScopeAll');

  return src.slice(start, end);
}

test('Condomínios mantém bloqueio 410 para API legada de mensagens', () => {
  const src = readSource();

  assert.match(
    src,
    /app\.use\('\/api\/msg',\s*\(req,\s*res\)\s*=>\s*\{/,
    'deve existir bloqueio de /condominios/api/msg'
  );

  assert.match(
    src,
    /res\.status\(410\)\.json\(\{\s*error:\s*'Caixa de Mensagens migrada para \/mensagens\/api\/msg'/s,
    'bloqueio deve retornar 410 informando a API nova de Mensagens'
  );
});

test('getCtxUser de Condomínios não deve manter exceção específica para /api/msg', () => {
  const src = readSource();
  const block = extractGetCtxUser(src);

  assert.doesNotMatch(
    block,
    /const\s+isMsgApi\s*=\s*url\.includes\('\/api\/msg'\);/,
    'getCtxUser não deve mais calcular isMsgApi para /api/msg legado'
  );

  assert.doesNotMatch(
    block,
    /fromPortal\s*&&\s*isMsgApi/,
    'getCtxUser não deve mais ter branch especial Portal + isMsgApi'
  );

  assert.doesNotMatch(
    block,
    /isMsgApi\s*\|\|/,
    'isPortalSharedApi não deve incluir isMsgApi'
  );
});
