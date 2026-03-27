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

test('middleware ultra-early delega a decisao para a seam e preserva o fluxo estrutural atual', () => {
  assert.match(
    SOURCE,
    /app\.use\(async \(req, res, next\) => \{[\s\S]*const guardDecision = resolveUltraEarlyGuardDecision\(req\);[\s\S]*if \(!guardDecision\) return next\(\);[\s\S]*const \{ isLogin, raw, erro, mensagem \} = guardDecision;[\s\S]*if \(raw === '1' \|\| raw === 'true'\) \{[\s\S]*const tag = isLogin \? 'login' : 'primeiroacesso';[\s\S]*res\.set\('X-Guard-Direct', tag\);[\s\S]*return res\.status\(200\)\.send\(`\[server-guard\] direct \$\{tag\}`\);[\s\S]*\}[\s\S]*return res\.render\('gestor\/primeiroacesso',[\s\S]*if \(err\) return next\(\);[\s\S]*res\.set\('X-Guard-Direct', 'primeiroacesso'\);[\s\S]*return res\.status\(200\)\.send\(html\);[\s\S]*\}\);[\s\S]*\}\)\.*/,
    'o middleware ultra-early deve delegar para resolveUltraEarlyGuardDecision e preservar os ramos raw, html e next() do fluxo atual',
  );

  const guardIndex = SOURCE.indexOf('// Ultra-early guard: renderiza /gestor/login e /gestor/primeiroacesso antes de QUALQUER outra coisa');
  const staticIndex = SOURCE.indexOf('// Sirva estáticos e aliases o mais cedo possível');
  assert.ok(guardIndex >= 0, 'o bloco do ultra-early guard deve existir no source');
  assert.ok(staticIndex >= 0, 'o bloco de estaticos deve existir no source');
  assert.ok(guardIndex < staticIndex, 'o ultra-early guard deve permanecer antes dos estaticos no pipeline');
});

test('resolveUltraEarlyGuardDecision preserva elegibilidade e dados estruturais da decisao atual', () => {
  const resolveUltraEarlyGuardDecision = buildFunction('resolveUltraEarlyGuardDecision', {
    URLSearchParams,
  });

  assert.equal(
    resolveUltraEarlyGuardDecision({ method: 'POST', originalUrl: '/gestor/primeiroacesso?erro=campos' }),
    null,
    'metodos fora de GET/HEAD devem continuar fora do guard',
  );

  assert.equal(
    resolveUltraEarlyGuardDecision({ method: 'GET', originalUrl: '/gestor/dashboard' }),
    null,
    'urls fora do alvo do guard devem continuar fora da interceptacao',
  );

  assert.equal(
    resolveUltraEarlyGuardDecision({ method: 'GET', originalUrl: '/gestor/login?raw=1' }),
    null,
    'o comportamento efetivo atual do guard deve continuar fora do ramo especial para login direto',
  );

  const primeiroAcessoDecision = resolveUltraEarlyGuardDecision({
    method: 'HEAD',
    originalUrl: '/gestor/primeiroacesso?raw=true&erro=forca',
  });
  assert.equal(primeiroAcessoDecision.url, '/gestor/primeiroacesso?raw=true&erro=forca', 'a seam deve continuar lendo originalUrl');
  assert.equal(primeiroAcessoDecision.isLogin, false, 'a seam deve continuar distinguindo login');
  assert.equal(primeiroAcessoDecision.isPA, true, 'a seam deve continuar distinguindo primeiro acesso');
  assert.equal(primeiroAcessoDecision.queryStr, 'raw=true&erro=forca', 'a seam deve continuar extraindo queryStr');
  assert.equal(primeiroAcessoDecision.raw, 'true', 'a seam deve continuar extraindo raw');
  assert.equal(primeiroAcessoDecision.erro, 'forca', 'a seam deve continuar extraindo erro');
  assert.equal(primeiroAcessoDecision.mensagem, 'A senha precisa conter maiúscula, minúscula e número.', 'a seam deve continuar derivando a mensagem estrutural de primeiro acesso');

  const fallbackUrlDecision = resolveUltraEarlyGuardDecision({
    method: 'GET',
    url: '/primeiroacesso?erro=campos',
  });
  assert.equal(fallbackUrlDecision.url, '/primeiroacesso?erro=campos', 'a seam deve continuar usando req.url quando originalUrl nao existir');
  assert.equal(fallbackUrlDecision.isPA, true, 'a seam deve continuar reconhecendo primeiro acesso sem prefixo');
  assert.equal(fallbackUrlDecision.queryStr, 'erro=campos', 'a seam deve continuar extraindo query sem raw');
  assert.equal(fallbackUrlDecision.raw, null, 'a seam deve continuar retornando raw nulo quando ausente');
  assert.equal(fallbackUrlDecision.erro, 'campos', 'a seam deve continuar retornando erro extraido');
  assert.equal(fallbackUrlDecision.mensagem, 'Preencha todos os campos.', 'a seam deve continuar derivando a mensagem estrutural correspondente');
});