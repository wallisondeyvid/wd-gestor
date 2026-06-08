import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve(process.cwd(), 'src/modules/condominios/app/condominios-app.js');
const source = fs.readFileSync(filePath, 'utf8');

test('paginas internas do modulo condominios passam por protecao geral antes das rotas', () => {
  const localsIndex = source.indexOf('res.locals.user = req.user || (req.session && req.session.user) || null;');
  const guardFunctionIndex = source.indexOf('function isCondominiosPublicOrNonPageRequest(req)');
  const guardUseIndex = source.indexOf('if (isCondominiosPublicOrNonPageRequest(req)) return next();');
  const estruturarHabitacoesIndex = source.indexOf("app.get('/estruturar/habitacoes'");
  const editarHabitacoesIndex = source.indexOf("app.get('/editar/habitacoes'");
  const dashboardIndex = source.indexOf("app.get('/dashboard'");

  assert.ok(localsIndex >= 0, 'middleware de res.locals.user deve existir');
  assert.ok(guardFunctionIndex >= 0, 'função de classificação pública/interna deve existir');
  assert.ok(guardUseIndex >= 0, 'middleware de proteção geral deve existir');
  assert.ok(estruturarHabitacoesIndex >= 0, 'rota /estruturar/habitacoes deve existir');
  assert.ok(editarHabitacoesIndex >= 0, 'rota /editar/habitacoes deve existir');
  assert.ok(dashboardIndex >= 0, 'rota /dashboard deve existir');

  assert.ok(
    localsIndex < guardFunctionIndex,
    'proteção geral deve rodar depois da injeção de res.locals.user',
  );

  assert.ok(
    guardFunctionIndex < estruturarHabitacoesIndex,
    'proteção geral deve ser declarada antes de /estruturar/habitacoes',
  );

  assert.ok(
    guardFunctionIndex < editarHabitacoesIndex,
    'proteção geral deve ser declarada antes de /editar/habitacoes',
  );

  assert.ok(
    guardFunctionIndex < dashboardIndex,
    'proteção geral deve ser declarada antes de /dashboard',
  );
});

test('proteção geral do modulo condominios redireciona paginas internas deslogadas para login com next', () => {
  assert.match(
    source,
    /function isCondominiosPublicOrNonPageRequest\(req\) \{[\s\S]*if \(method !== 'GET' && method !== 'HEAD'\) return true;[\s\S]*if \(pathOnly === '\/'\) return false;[\s\S]*login\|logout\|esquecisenha\|esqueci-senha\|primeiroacesso\|reset-password[\s\S]*api\|css\|js\|images\|img\|uploads\|fonts\|assets\|data[\s\S]*return false;[\s\S]*\}/,
    'classificador deve manter públicas rotas públicas/assets/APIs e tratar páginas internas como protegidas',
  );

  assert.match(
    source,
    /const ctxUser = getCtxUser\(req\);[\s\S]*req\.user = req\.user \|\| ctxUser;[\s\S]*res\.locals\.user = res\.locals\.user \|\| ctxUser;[\s\S]*const basePath = req\.baseUrl \|\| '\/condominios';[\s\S]*const nextUrl = encodeURIComponent\(String\(req\.originalUrl \|\| `\$\{basePath\}\$\{req\.url \|\| ''\}`\)\);[\s\S]*return res\.redirect\(`\$\{basePath\}\/login\?next=\$\{nextUrl\}`\);/,
    'middleware deve hidratar usuário quando autenticado e redirecionar visitante para login com next',
  );
});
