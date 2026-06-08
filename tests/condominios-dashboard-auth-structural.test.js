import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve(process.cwd(), 'src/modules/condominios/app/condominios-app.js');
const source = fs.readFileSync(filePath, 'utf8');

test('dashboard do modulo condominios exige login efetivo', () => {
  assert.match(
    source,
    /function\s+requireCondominiosPageLogin\s*\(req,\s*res,\s*next\)\s*\{[\s\S]*const ctxUser = getCtxUser\(req\);[\s\S]*if \(ctxUser\) \{[\s\S]*req\.user = req\.user \|\| ctxUser;[\s\S]*res\.locals\.user = res\.locals\.user \|\| ctxUser;[\s\S]*return next\(\);[\s\S]*\}/,
    'deve existir guard local que valida ctxUser e hidrata req.user/res.locals.user',
  );

  assert.match(
    source,
    /const basePath = req\.baseUrl \|\| '\/condominios';[\s\S]*return res\.redirect\(`\$\{basePath\}\/login\?next=\$\{nextUrl\}`\);/,
    'visitante sem sessao deve ser redirecionado para login do proprio modulo',
  );

  assert.match(
    source,
    /app\.get\('\/',\s*requireCondominiosPageLogin,\s*\(req,\s*res\)\s*=>\s*\{[\s\S]*res\.redirect\(\(req\.baseUrl \|\| '\/condominios'\) \+ '\/dashboard'\)/,
    'raiz do modulo nao deve redirecionar para dashboard sem passar pelo guard',
  );

  assert.match(
    source,
    /app\.get\('\/dashboard',\s*requireCondominiosPageLogin,\s*\(req,\s*res\)\s*=>\s*\{[\s\S]*res\.render\('dashboard'/,
    'dashboard deve usar requireCondominiosPageLogin antes de renderizar',
  );
});

test('dashboard do modulo condominios nao deve redirecionar visitante para login do gestor', () => {
  const guardMatch = /function\s+requireCondominiosPageLogin\s*\(req,\s*res,\s*next\)\s*\{[\s\S]*?\n\}/.exec(source);
  assert.ok(guardMatch, 'guard requireCondominiosPageLogin deve existir');

  assert.doesNotMatch(
    guardMatch[0],
    /\/gestor\/login/,
    'guard de paginas do Condominios deve redirecionar para login do proprio modulo, nao para /gestor/login',
  );
});