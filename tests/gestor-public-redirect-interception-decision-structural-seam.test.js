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
      if (depth === 0) return SOURCE.slice(start, index + 1);
    }
  }

  throw new Error(`Nao conseguiu extrair o bloco completo de ${functionName}`);
}

function buildFunction(functionName, context = {}) {
  const functionSource = extractFunctionSource(functionName);
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

test('wrapper global de redirect delega a decisao para a seam e preserva fallback estrutural', () => {
  assert.match(
    SOURCE,
    /res\.redirect = async function\(statusOrUrl, maybeUrl\) \{[\s\S]*const redirectDecision = resolvePublicRedirectInterceptionDecision\(req, statusOrUrl, maybeUrl\);[\s\S]*if \(redirectDecision\) \{[\s\S]*\}[\s\S]*if \(typeof statusOrUrl === 'number'\) \{[\s\S]*return originalRedirect\(statusOrUrl, maybeUrl\);[\s\S]*\}[\s\S]*return originalRedirect\(String\(statusOrUrl \|\| ''\)\);[\s\S]*\};/,
    'o wrapper de res.redirect deve delegar para resolvePublicRedirectInterceptionDecision e preservar o fallback final para originalRedirect',
  );

  assert.match(
    SOURCE,
    /const isPortalSeg = seg === 'portal-morador' \|\| seg === 'portal_morador';[\s\S]*if \(isPortalSeg && isPA && !isLogin\) \{[\s\S]*return originalRedirect\(statusOrUrl, maybeUrl\);[\s\S]*\}/,
    'a excecao estrutural do Portal do Morador em primeiro acesso deve continuar caindo no originalRedirect',
  );
});

test('resolvePublicRedirectInterceptionDecision preserva elegibilidade e shape estrutural da decisao', () => {
  const resolvePublicRedirectInterceptionDecision = buildFunction('resolvePublicRedirectInterceptionDecision', {
    URLSearchParams,
  });

  assert.equal(
    resolvePublicRedirectInterceptionDecision({ method: 'POST' }, '/gestor/login'),
    null,
    'metodos fora de GET/HEAD devem continuar fora da interceptacao estrutural',
  );

  assert.equal(
    resolvePublicRedirectInterceptionDecision({ method: 'GET' }, '/gestor/dashboard'),
    null,
    'targets que nao sejam login ou primeiro acesso devem continuar fora da interceptacao estrutural',
  );

  const loginDecision = resolvePublicRedirectInterceptionDecision(
    { method: 'GET' },
    307,
    '/gestor/login?erro=usuario#frag',
  );
  assert.equal(loginDecision.status, 307, 'a seam deve preservar o status numerico quando fornecido');
  assert.equal(loginDecision.url, '/gestor/login?erro=usuario#frag', 'a seam deve preservar a url original para o restante do wrapper');
  assert.equal(loginDecision.target, '/gestor/login?erro=usuario', 'a seam deve normalizar o target sem fragmento');
  assert.equal(loginDecision.isLogin, true, 'a seam deve continuar distinguindo login');
  assert.equal(loginDecision.isPA, false, 'a seam deve continuar distinguindo primeiro acesso');
  assert.equal(loginDecision.erro, 'usuario', 'a seam deve continuar extraindo erro da query');
  assert.equal(loginDecision.mensagem, null, 'a seam de login deve continuar sem mensagem derivada');
  assert.equal(loginDecision.seg, 'gestor', 'a seam deve continuar detectando o segmento do Gestor');
  assert.equal(loginDecision.basePath, '/gestor', 'a seam deve continuar projetando o basePath do Gestor');

  const primeiroAcessoDecision = resolvePublicRedirectInterceptionDecision(
    { method: 'HEAD' },
    '/portal-morador/primeiroacesso?erro=forca',
  );
  assert.equal(primeiroAcessoDecision.status, 302, 'a seam deve continuar usando 302 como status padrao');
  assert.equal(primeiroAcessoDecision.target, '/portal-morador/primeiroacesso?erro=forca', 'a seam deve preservar o target quando nao ha fragmento');
  assert.equal(primeiroAcessoDecision.isLogin, false, 'a seam deve continuar marcando primeiro acesso fora do login');
  assert.equal(primeiroAcessoDecision.isPA, true, 'a seam deve continuar marcando primeiro acesso');
  assert.equal(primeiroAcessoDecision.erro, 'forca', 'a seam deve continuar extraindo erro do primeiro acesso');
  assert.equal(primeiroAcessoDecision.mensagem, 'A senha precisa conter maiúscula, minúscula e número.', 'a seam deve continuar derivando a mensagem estrutural de primeiro acesso');
  assert.equal(primeiroAcessoDecision.seg, 'portal-morador', 'a seam deve continuar detectando o segmento do target');
  assert.equal(primeiroAcessoDecision.basePath, '/portal-morador', 'a seam deve continuar projetando o basePath do segmento detectado');

  const escalasFallbackDecision = resolvePublicRedirectInterceptionDecision(
    { method: 'GET' },
    '/escalas/login?erro=contexto',
  );
  assert.equal(escalasFallbackDecision.seg, 'escalas', 'a seam deve continuar preservando o fallback estrutural de segmento para Escalas');
  assert.equal(escalasFallbackDecision.basePath, '/escalas', 'a seam deve continuar projetando basePath de Escalas no fallback estrutural');
});