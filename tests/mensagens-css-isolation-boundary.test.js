import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mensagensAppPath = 'src/modules/mensagens/app/mensagens-app.js';
const mensagensViewPath = 'views/mensagens/caixa_de_mensagem.ejs';
const portalViewPath = 'views/portal-morador/caixa_de_mensagem.ejs';

test('Módulo Mensagens serve CSS isolado a partir de public/mensagens/css', () => {
  const src = fs.readFileSync(mensagensAppPath, 'utf8');

  assert.match(
    src,
    /app\.use\('\/css',\s*express\.static\(path\.join\(ROOT,\s*'public\/mensagens\/css'\)\)\);/,
    'Mensagens deve servir CSS próprio em /mensagens/css'
  );

  assert.doesNotMatch(
    src,
    /public\/css\/condominios-modern\.css/,
    'Mensagens não deve depender diretamente do CSS global em public/css'
  );
});

test('View standalone de Mensagens carrega condominios-modern.css pelo assetBasePath do módulo', () => {
  const view = fs.readFileSync(mensagensViewPath, 'utf8');

  assert.match(
    view,
    /href="<%=\s*_assetBp\s*%>\/css\/condominios-modern\.css/,
    'view de Mensagens deve carregar CSS pelo asset base do módulo'
  );

  assert.doesNotMatch(
    view,
    /href="\/condominios\/css\/condominios-modern\.css/,
    'view de Mensagens não deve apontar para CSS de Condomínios'
  );

  assert.doesNotMatch(
    view,
    /href="\/css\/condominios-modern\.css/,
    'view de Mensagens não deve apontar para CSS global raiz'
  );
});

test('Portal do Morador mantém tela própria e usa seu base path, não o CSS standalone de Mensagens', () => {
  const view = fs.readFileSync(portalViewPath, 'utf8');

  assert.match(
    view,
    /href="<%=\s*BP\s*%>\/css\/condominios-modern\.css/,
    'Portal deve continuar carregando CSS pelo base path próprio'
  );

  assert.match(
    view,
    /<script\s+src="\/mensagens\/js\/caixa_de_mensagem\.js/,
    'Portal usa o JS standalone de Mensagens'
  );

  assert.doesNotMatch(
    view,
    /href="\/mensagens\/css\/condominios-modern\.css/,
    'Portal não deve depender diretamente do CSS standalone de Mensagens'
  );
});

test('CSS standalone de Mensagens existe como cópia isolada do CSS base atual', () => {
  const globalCss = fs.readFileSync('public/css/condominios-modern.css', 'utf8');
  const mensagensCss = fs.readFileSync('public/mensagens/css/condominios-modern.css', 'utf8');

  assert.ok(globalCss.length > 0, 'CSS global deve existir');
  assert.ok(mensagensCss.length > 0, 'CSS standalone de Mensagens deve existir');

  assert.equal(
    mensagensCss,
    globalCss,
    'por enquanto, CSS de Mensagens é uma cópia isolada do CSS base'
  );
});
