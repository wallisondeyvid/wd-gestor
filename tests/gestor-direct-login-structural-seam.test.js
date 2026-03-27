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

function createRenderResponse() {
  return {
    headers: {},
    rendered: null,
    statusCode: null,
    body: null,
    set(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    render(view, locals, callback) {
      this.rendered = { view, locals };
      if (callback) callback(null, `<html>${view}</html>`);
      return this;
    },
  };
}

test('GET /gestor/login delega para renderDirectGestorLogin e preserva precedencia sobre o corredor generico', () => {
  assert.match(
    SOURCE,
    /app\.get\('\/gestor\/login',\s*\(req,\s*res,\s*next\)\s*=>\s*\{[\s\S]*return renderDirectGestorLogin\(req, res, next\);[\s\S]*\}\);/,
    'GET /gestor/login deve delegar para renderDirectGestorLogin',
  );

  const directLoginIndex = SOURCE.indexOf("app.get('/gestor/login'");
  const genericLoginIndex = SOURCE.indexOf("app.get('/:seg/login'");

  assert.ok(directLoginIndex >= 0, 'rota direta de login deve existir no source');
  assert.ok(genericLoginIndex >= 0, 'rota generica de login deve existir no source');
  assert.ok(directLoginIndex < genericLoginIndex, 'GET /gestor/login deve permanecer antes do corredor generico');
});

test('renderDirectGestorLogin preserva parse, view, locals, headers e status estruturais', () => {
  const parseCalls = [];
  const parseErroMensagem = (isLogin, queryStr) => {
    parseCalls.push({ isLogin, queryStr });
    return { erro: 'usuario', mensagem: 'Mensagem estrutural' };
  };

  const renderDirectGestorLogin = buildFunction('renderDirectGestorLogin', {
    parseErroMensagem,
  });

  const req = {
    originalUrl: '/gestor/login?erro=usuario&from=structural',
  };
  const res = createRenderResponse();
  const nextCalls = [];
  const next = (err) => nextCalls.push(err || null);

  renderDirectGestorLogin(req, res, next);

  assert.equal(parseCalls.length, 1, 'a seam deve continuar consultando parseErroMensagem uma vez');
  assert.equal(parseCalls[0].isLogin, true, 'a seam deve continuar sinalizando parse de login');
  assert.equal(parseCalls[0].queryStr, 'erro=usuario&from=structural', 'a seam deve continuar extraindo a query de originalUrl');

  assert.equal(res.rendered.view, 'gestor/logingestor', 'a seam deve continuar renderizando a view atual');
  assert.equal(res.rendered.locals.basePath, '/gestor', 'a seam deve continuar expondo basePath fixo do Gestor');
  assert.equal(res.rendered.locals.moduleLabel, 'WDGestor', 'a seam deve continuar expondo moduleLabel fixo do Gestor');
  assert.equal(res.rendered.locals.erro, 'usuario', 'a seam deve continuar propagando erro do parse');
  assert.equal(res.rendered.locals.mensagem, 'Mensagem estrutural', 'a seam deve continuar propagando mensagem do parse');

  assert.equal(res.headers['Content-Type'], 'text/html; charset=utf-8', 'a seam deve continuar configurando Content-Type html utf-8');
  assert.equal(res.headers['Cache-Control'], 'no-store, no-cache, must-revalidate', 'a seam deve continuar configurando Cache-Control');
  assert.equal(res.headers.Pragma, 'no-cache', 'a seam deve continuar configurando Pragma');
  assert.equal(res.headers.Expires, '0', 'a seam deve continuar configurando Expires');
  assert.equal(res.headers['X-Server-Direct'], 'login', 'a seam deve continuar sinalizando o header estrutural atual');
  assert.equal(res.statusCode, 200, 'a seam deve continuar respondendo 200 no caminho feliz');
  assert.equal(res.body, '<html>gestor/logingestor</html>', 'a seam deve continuar enviando o html renderizado');
  assert.deepEqual(nextCalls, [], 'a seam nao deve acionar next() no caminho feliz');
});