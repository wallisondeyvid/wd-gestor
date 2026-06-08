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
  const response = {
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

  return response;
}

test('rotas genericas delegam para as novas seams locais do corredor publico', () => {
  assert.match(
    SOURCE,
    /app\.get\('\/:seg\/login',\s*async\s*\(req,\s*res,\s*next\)\s*=>\s*\{[\s\S]*const seg = resolveGenericPublicSegment\(req\.params\.seg\);[\s\S]*if \(!seg\) return next\(\);[\s\S]*return renderGenericSegmentLogin\(req, res, next, seg\);[\s\S]*\}\);/,
    'GET /:seg/login deve delegar para resolveGenericPublicSegment e renderGenericSegmentLogin',
  );

  assert.match(
    SOURCE,
    /app\.post\(\s*'\/:seg\/login',[\s\S]*const seg = resolveGenericPublicSegment\(req\.params\.seg\);[\s\S]*if \(!seg\) return next\(\);[\s\S]*return handoffGenericSegmentLogin\(req, res, next, seg\);[\s\S]*\);\s*/m,
    'POST /:seg/login deve delegar para resolveGenericPublicSegment e handoffGenericSegmentLogin',
  );

  assert.match(
    SOURCE,
    /app\.get\('\/:seg\/primeiroacesso',\s*\(req,\s*res,\s*next\)\s*=>\s*\{[\s\S]*const seg = resolveGenericPublicSegment\(req\.params\.seg\);[\s\S]*if \(!seg\) return next\(\);[\s\S]*return renderGenericSegmentPrimeiroAcesso\(req, res, next, seg\);[\s\S]*\}\);/,
    'GET /:seg/primeiroacesso deve delegar para resolveGenericPublicSegment e renderGenericSegmentPrimeiroAcesso',
  );

  assert.match(
    SOURCE,
    /app\.post\('\/:seg\/primeiroacesso',[\s\S]*const seg = resolveGenericPublicSegment\(req\.params\.seg\);[\s\S]*if \(!seg\) return next\(\);[\s\S]*return handoffGenericSegmentPrimeiroAcesso\(req, res, next, seg\);[\s\S]*\}\);/,
    'POST /:seg/primeiroacesso deve delegar para resolveGenericPublicSegment e handoffGenericSegmentPrimeiroAcesso',
  );

  assert.match(
    SOURCE,
    /app\.get\('\/:seg\/esquecisenha',\s*async\s*\(req,\s*res,\s*next\)\s*=>\s*\{[\s\S]*const seg = resolveGenericPublicSegment\(req\.params\.seg\);[\s\S]*if \(!seg\) return next\(\);[\s\S]*return renderGenericSegmentEsqueciSenha\(req, res, next, seg\);[\s\S]*\}\);/,
    'GET /:seg/esquecisenha deve delegar para resolveGenericPublicSegment e renderGenericSegmentEsqueciSenha',
  );
});

test('POST generico de login fica depois da sessao e antes da montagem dos modulos', () => {
  const sessionIndex = SOURCE.indexOf('app.use(session({');
  assert.ok(sessionIndex >= 0, 'middleware de sessao deve existir no createServer.js');

  const postLoginMatch = /app\.post\(\s*'\/:seg\/login',[\s\S]*?handoffGenericSegmentLogin\(req, res, next, seg\);[\s\S]*?\);\s*/m.exec(SOURCE);
  assert.ok(postLoginMatch, 'POST /:seg/login generico deve existir no createServer.js');

  const postLoginIndex = postLoginMatch.index;
  const mountIndex = SOURCE.indexOf('mountBootstrapRegistry({');
  assert.ok(mountIndex >= 0, 'mountBootstrapRegistry deve existir no createServer.js');

  assert.ok(
    sessionIndex < postLoginIndex,
    'POST /:seg/login deve ser registrado depois de app.use(session(...)) para conseguir criar req.session.user e emitir wdg.sid',
  );

  assert.ok(
    postLoginIndex < mountIndex,
    'POST /:seg/login deve ser registrado antes de mountBootstrapRegistry para nao cair no 404 do app do modulo',
  );

  const sourceBeforeSession = SOURCE.slice(0, sessionIndex);
  assert.doesNotMatch(
    sourceBeforeSession,
    /app\.post\(\s*'\/:seg\/login'/,
    'nao deve haver POST /:seg/login antes do middleware de sessao',
  );

  const sourceAfterMount = SOURCE.slice(mountIndex);
  assert.doesNotMatch(
    sourceAfterMount,
    /app\.post\(\s*'\/:seg\/login'/,
    'nao deve haver POST /:seg/login tardio depois da montagem dos modulos',
  );
});

test('filtro de segmento e bifurcacao portal vs generico permanecem preservados', async () => {
  const resolveGenericPublicSegment = buildFunction('resolveGenericPublicSegment');
  const isPortalMoradorSegment = buildFunction('isPortalMoradorSegment');

  assert.equal(resolveGenericPublicSegment(''), '', 'segmento vazio deve permanecer bloqueado');
  assert.equal(resolveGenericPublicSegment('gestor'), '', 'segmento gestor deve permanecer excluido');
  assert.equal(resolveGenericPublicSegment('escalas'), '', 'segmento escalas deve permanecer excluido');
  assert.equal(resolveGenericPublicSegment('Clinica'), 'clinica', 'segmento generico deve continuar normalizado para lowercase');

  assert.equal(isPortalMoradorSegment('portal-morador'), true, 'portal-morador deve permanecer ramo proprio');
  assert.equal(isPortalMoradorSegment('portal_morador'), true, 'portal_morador deve permanecer ramo proprio');
  assert.equal(isPortalMoradorSegment('clinica'), false, 'segmento generico nao deve cair no ramo do portal');
});

test('handoffs e renderizacoes estruturais do corredor generico permanecem iguais', async () => {
  const assignGenericSegmentBaseUrl = buildFunction('assignGenericSegmentBaseUrl');
  const isPortalMoradorSegment = buildFunction('isPortalMoradorSegment');

  const calls = [];
  const portalLoginPost = () => {
    calls.push('portalLoginPost');
    return 'portal-login';
  };
  const genericLogin = () => {
    calls.push('genericLogin');
    return 'generic-login';
  };
  const portalPrimeiroAcessoGet = () => {
    calls.push('portalPrimeiroAcessoGet');
    return 'portal-primeiro-get';
  };
  const portalPrimeiroAcessoPost = () => {
    calls.push('portalPrimeiroAcessoPost');
    return 'portal-primeiro-post';
  };
  const genericPrimeiroAcessoPost = () => {
    calls.push('genericPrimeiroAcessoPost');
    return 'generic-primeiro-post';
  };

  const handoffGenericSegmentLogin = buildFunction('handoffGenericSegmentLogin', {
    Promise,
    assignGenericSegmentBaseUrl,
    isPortalMoradorSegment,
    portalLoginPost,
    genericLogin,
  });
  const renderGenericSegmentPrimeiroAcesso = buildFunction('renderGenericSegmentPrimeiroAcesso', {
    Promise,
    assignGenericSegmentBaseUrl,
    isPortalMoradorSegment,
    portalPrimeiroAcessoGet,
  });
  const handoffGenericSegmentPrimeiroAcesso = buildFunction('handoffGenericSegmentPrimeiroAcesso', {
    Promise,
    assignGenericSegmentBaseUrl,
    isPortalMoradorSegment,
    portalPrimeiroAcessoPost,
    genericPrimeiroAcessoPost,
  });

  const nextCalls = [];
  const next = (err) => nextCalls.push(err || null);

  const portalReq = { baseUrl: '', params: { seg: 'portal-morador' } };
  const genericReq = { baseUrl: '', params: { seg: 'clinica' } };
  const res = createRenderResponse();

  await handoffGenericSegmentLogin(portalReq, {}, next, 'portal-morador');
  await handoffGenericSegmentLogin(genericReq, {}, next, 'clinica');
  assert.deepEqual(calls.slice(0, 2), ['portalLoginPost', 'genericLogin'], 'POST /:seg/login deve manter handoff Portal vs generico');
  assert.equal(portalReq.baseUrl, '/portal-morador', 'handoff de login deve continuar projetando baseUrl do portal');
  assert.equal(genericReq.baseUrl, '/clinica', 'handoff de login deve continuar projetando baseUrl do segmento generico');

  const portalPrimeiroReq = { baseUrl: '' };
  await renderGenericSegmentPrimeiroAcesso(portalPrimeiroReq, {}, next, 'portal_morador');
  assert.equal(calls[2], 'portalPrimeiroAcessoGet', 'GET /:seg/primeiroacesso deve manter handoff do portal');
  assert.equal(portalPrimeiroReq.baseUrl, '/portal_morador', 'GET primeiro acesso do portal deve continuar projetando baseUrl');

  const genericPrimeiroReq = { baseUrl: '' };
  const genericPrimeiroRes = createRenderResponse();
  renderGenericSegmentPrimeiroAcesso(genericPrimeiroReq, genericPrimeiroRes, next, 'clinica');
  assert.equal(genericPrimeiroReq.baseUrl, '/clinica', 'GET primeiro acesso generico deve continuar projetando baseUrl');
  assert.equal(genericPrimeiroRes.rendered.view, 'gestor/primeiroacesso', 'GET primeiro acesso generico deve continuar renderizando a view atual');
  assert.equal(genericPrimeiroRes.rendered.locals.basePath, '/clinica', 'GET primeiro acesso generico deve continuar usando basePath esperado');
  assert.equal(genericPrimeiroRes.rendered.locals.moduleLabel, 'Clinica', 'GET primeiro acesso generico deve continuar usando moduleLabel esperado');

  await handoffGenericSegmentPrimeiroAcesso({ baseUrl: '' }, {}, next, 'portal-morador');
  await handoffGenericSegmentPrimeiroAcesso({ baseUrl: '' }, {}, next, 'clinica');
  assert.deepEqual(
    calls.slice(3),
    ['portalPrimeiroAcessoPost', 'genericPrimeiroAcessoPost'],
    'POST /:seg/primeiroacesso deve manter handoff Portal vs generico',
  );

  assert.deepEqual(nextCalls, [], 'nenhum handoff/renderizacao estrutural deve disparar next() no caminho feliz');
});

test('renderGenericSegmentLogin preserva estruturalmente portal vs generico no source atual', () => {
  assert.match(
    SOURCE,
    /async function renderGenericSegmentLogin\(req, res, next, seg\) \{[\s\S]*const isPortalMorador = isPortalMoradorSegment\(seg\);[\s\S]*if \(isPortalMorador\) \{[\s\S]*res\.render\('portal-morador\/login',[\s\S]*moduleLabel: 'Portal do Morador'[\s\S]*X-Server-Direct', 'login-portal-morador'[\s\S]*\}[\s\S]*res\.render\('gestor\/logingestor',[\s\S]*X-Server-Direct', 'login-generico'/,
    'renderGenericSegmentLogin deve preservar os ramos estruturalmente distintos de Portal e do caminho generico',
  );
});
