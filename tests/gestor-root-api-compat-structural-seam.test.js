import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CREATE_SERVER_PATH = path.join(process.cwd(), 'src/server/createServer.js');
const SOURCE = fs.readFileSync(CREATE_SERVER_PATH, 'utf8');

function extractFunctionSource(functionName) {
  const signature = `function ${functionName}`;
  const start = SOURCE.indexOf(signature);
  assert.ok(start >= 0, `Nao encontrou ${functionName} em createServer.js`);

  const braceStart = SOURCE.indexOf('{', start);
  assert.ok(braceStart >= 0, `Nao encontrou abertura de bloco de ${functionName}`);

  let depth = 0;
  for (let index = braceStart; index < SOURCE.length; index += 1) {
    const char = SOURCE[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return SOURCE.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Nao conseguiu extrair o bloco completo de ${functionName}`);
}

function buildCompatResolver() {
  const functionSource = extractFunctionSource('resolveGestorRootApiCompatTarget');
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext({});
}

test('middleware /api delega a decisao para resolveGestorRootApiCompatTarget', () => {
  assert.match(
    SOURCE,
    /app\.use\('\/api',\s*\(req,\s*res,\s*next\)\s*=>\s*\{[\s\S]*const target = resolveGestorRootApiCompatTarget\(req\);[\s\S]*if \(!target\) return next\(\);[\s\S]*return res\.redirect\(307, target\);[\s\S]*\}\);/,
    'middleware /api deve delegar a decisao para resolveGestorRootApiCompatTarget preservando next() e redirect(307, target)',
  );
});

test('resolveGestorRootApiCompatTarget preserva as saidas estruturais do corredor', () => {
  const resolveTarget = buildCompatResolver();

  const requestFrom = ({ originalUrl, referer }) => ({
    originalUrl,
    url: originalUrl,
    get(headerName) {
      if (String(headerName || '').toLowerCase() === 'referer') {
        return referer || '';
      }
      return '';
    },
  });

  assert.equal(
    resolveTarget(requestFrom({ originalUrl: '/api/usuarios' })),
    '/gestor/api/usuarios',
    'destino padrao deve continuar sendo /gestor + original',
  );
  assert.equal(
    resolveTarget(requestFrom({ originalUrl: '/api/escalas/123' })),
    '',
    'bypass de /api/escalas deve permanecer vazio para cair no next()',
  );
  assert.equal(
    resolveTarget(requestFrom({ originalUrl: '/api/cep/12345678' })),
    '',
    'bypass de /api/cep deve permanecer vazio para cair no next()',
  );
  assert.equal(
    resolveTarget(requestFrom({ originalUrl: '/api/msg/threads', referer: 'https://host/portal-morador/home' })),
    '/portal-morador/api/msg/threads',
    'excecao contextual do Portal do Morador deve permanecer intacta',
  );
  assert.equal(
    resolveTarget(requestFrom({ originalUrl: '/api/msg/threads', referer: 'https://host/gestor/dashboard' })),
    '/gestor/api/msg/threads',
    'fora do contexto do Portal o destino padrao deve continuar sendo o Gestor',
  );
});