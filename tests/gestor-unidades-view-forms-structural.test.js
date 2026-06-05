import test from 'node:test';
import assert from 'node:assert/strict';
import ejs from 'ejs';
import bcrypt from 'bcryptjs';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';
import { disconnectMongo } from '../src/core/db/connect.js';

const VIEW_PATH = 'views/gestor/unidades.ejs';
const PASSWORD = 'Senha@123456';

let app;
let closeServer;
let passwordHash = '';
let sequence = 0;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'unidades-view-forms') {
  return `${prefix}.${Date.now()}.${nextSequence()}@example.com`;
}

function listForms(html) {
  return [...html.matchAll(/<form\b[^>]*>/gi)].map((match, index) => ({
    order: index + 1,
    tag: match[0],
    index: match.index,
  }));
}

function listFormsWithMetadata(html) {
  const forms = [...html.matchAll(/<form\b[^>]*>/gi)].map((match, index) => {
    const tag = match[0];
    const idMatch = tag.match(/\bid="([^"]+)"/i);
    const classMatch = tag.match(/\bclass="([^"]+)"/i);
    const id = idMatch ? idMatch[1] : '';
    const className = classMatch ? classMatch[1] : '';
    const openIndex = match.index;
    const closeIndex = html.indexOf('</form>', openIndex);
    assert.notEqual(closeIndex, -1, `form ${id || className || index + 1} deve ter fechamento`);

    return {
      order: index + 1,
      id,
      className,
      openIndex,
      closeIndex,
      openTag: tag,
    };
  });

  return forms.map((form, index) => {
    const relevantAncestor = html.slice(Math.max(0, form.openIndex - 400), form.openIndex);
    const previousForm = forms[index - 1];
    const nestedWithinPrevious = !!(previousForm && form.openIndex < previousForm.closeIndex);
    let probableOrigin = 'desconhecido';
    if (form.id === 'cadastroUnidadeForm') probableOrigin = 'views/gestor/unidades.ejs';
    else if (form.id === 'formAlterarSenha') probableOrigin = 'views/partials/perfil.ejs';

    return {
      ...form,
      relevantAncestor,
      nestedWithinPrevious,
      probableOrigin,
    };
  });
}

function getFormMarkerIndex(html, marker) {
  const index = html.indexOf(marker);
  assert.notEqual(index, -1, `marcador ${marker} deve existir`);
  return index;
}

test.before(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, Number(process.env.BCRYPT_MIN_ROUNDS || 12));
  const built = await createServer({ skipDb: false, deferErrorHandlers: true });
  app = built.app;
  closeServer = built.close;
  app.get('/__seed-session', (req, res) => {
    const email = String(req.query?.email || buildUniqueEmail()).trim().toLowerCase();
    const role = String(req.query?.role || 'admin').trim().toLowerCase();
    const globalRole = String(req.query?.globalRole || 'admin').trim().toLowerCase();

    req.session.user = {
      id: `seed-${nextSequence()}`,
      _id: `seed-${nextSequence()}`,
      email,
      role,
      nome: `Seed ${role}`,
      global_role: globalRole,
      senha: passwordHash,
    };
    req.session.gestorAuthContext = {
      source: 'auth-context-v1',
      global_role: globalRole,
      needs_selection: false,
    };
    return req.session.save(() => res.status(204).end());
  });
  if (typeof built.registerErrorHandlers === 'function') {
    await Promise.resolve(built.registerErrorHandlers());
  }
});

test.after(async () => {
  try {
    if (typeof closeServer === 'function') {
      await closeServer({ stopMemoryServer: true });
      return;
    }
    await disconnectMongo({ stopMemoryServer: true });
  } catch {}
});

async function renderUnidadesView() {
  return ejs.renderFile(
    VIEW_PATH,
    {
      _basePath: '/gestor',
      user: { role: 'admin', isMaster: false, nome: 'Teste Estrutural' },
      isMaster: false,
      unidadesFiltradas: [],
      principalUnits: [],
      modulos: [],
      usuariosDiretor: [],
      currentPage: 1,
      totalPages: 1,
      totalUnidades: 0,
    },
    { root: process.cwd() },
  );
}

function findFormOpenTagBounds(html, formId) {
  const marker = `id="${formId}"`;
  const idIndex = html.indexOf(marker);
  assert.notEqual(idIndex, -1, `form ${formId} deve existir`);

  const openStart = html.lastIndexOf('<form', idIndex);
  const openEnd = html.indexOf('>', idIndex);
  assert.notEqual(openStart, -1, `abertura de ${formId} deve existir`);
  assert.notEqual(openEnd, -1, `tag de abertura de ${formId} deve fechar`);

  return { openStart, openEnd, idIndex };
}

test('unidades.ejs mantém cadastroUnidadeForm como form principal e isola forms de modais fora dele', async () => {
  const html = await renderUnidadesView();

  const formIds = [...html.matchAll(/<form\b[^>]*id="([^"]+)"[^>]*>/gi)].map((match) => match[1]);
  assert.deepEqual(formIds, ['cadastroUnidadeForm', 'formAlterarSenha']);

  const cadastro = findFormOpenTagBounds(html, 'cadastroUnidadeForm');
  const cadastroClose = html.indexOf('</form>', cadastro.openEnd);
  assert.notEqual(cadastroClose, -1, 'cadastroUnidadeForm deve ter fechamento');

  const cadastroInnerHtml = html.slice(cadastro.openEnd + 1, cadastroClose);
  assert.doesNotMatch(cadastroInnerHtml, /<form\b/i);

  const submitTag = '<button type="submit" id="btnSubmitUnidade" class="btn btn-primary" data-mode="create" title="Cadastrar" aria-label="Cadastrar">Cadastrar</button>';
  assert.match(cadastroInnerHtml, /<button type="submit" id="btnSubmitUnidade"/i);
  assert.ok(cadastroInnerHtml.includes(submitTag));

  const formAlterarSenha = findFormOpenTagBounds(html, 'formAlterarSenha');
  assert.ok(formAlterarSenha.openStart > cadastroClose, 'formAlterarSenha deve ficar fora do cadastro principal');
  const formAlterarSenhaClose = html.indexOf('</form>', formAlterarSenha.openEnd);
  assert.notEqual(formAlterarSenhaClose, -1, 'formAlterarSenha deve ter fechamento');
  const formAlterarSenhaInnerHtml = html.slice(formAlterarSenha.openEnd + 1, formAlterarSenhaClose);
  assert.match(formAlterarSenhaInnerHtml, /id="senhaAtual"/i);
  assert.match(formAlterarSenhaInnerHtml, /id="novaSenha"/i);
  assert.match(formAlterarSenhaInnerHtml, /id="confirmarSenha"/i);

  const modalIds = [
    'modalPerfil',
    'modalAlterarSenha',
    'detalhesModal',
    'modalBanco',
    'modalCnaePrincipal',
    'modalCnaeSecundario',
    'modalNaturezaJuridica',
    'modalModulos',
    'modalDiretor',
    'uDeleteConfirmModal',
  ];

  for (const modalId of modalIds) {
    assert.ok(html.includes(`id="${modalId}"`), `modal ${modalId} deve estar presente na página`);
  }

  const modalBancoIndex = html.indexOf('id="modalBanco"');
  assert.ok(modalBancoIndex > cadastroClose, 'os modais da página devem aparecer após o fechamento do cadastro principal');
});

test('GET /gestor/unidades entrega HTML final sem form aninhado em cadastroUnidadeForm', async () => {
  const agent = request.agent(app);
  const seedRes = await agent
    .get('/__seed-session')
    .query({ role: 'admin', globalRole: 'admin', email: buildUniqueEmail('runtime-forms') });

  assert.equal(seedRes.status, 204);

  const response = await agent.get('/gestor/unidades');

  assert.equal(response.status, 200);
  const html = response.text;

  const formTags = listForms(html);
  const forms = listFormsWithMetadata(html);
  assert.equal(formTags.length, 2);
  assert.match(html, /<form\b[^>]*id="cadastroUnidadeForm"/i);
  assert.match(html, /<form\b[^>]*id="formAlterarSenha"/i);
  assert.doesNotMatch(html, /<form\b[^>]*class="wdg-feedback-chat-compose"/i);
  assert.match(html, /<div\b[^>]*class="wdg-feedback-chat-compose"[^>]*data-chat-compose/i);

  const cadastro = findFormOpenTagBounds(html, 'cadastroUnidadeForm');
  const cadastroClose = html.indexOf('</form>', cadastro.openEnd);
  assert.notEqual(cadastroClose, -1, 'cadastroUnidadeForm deve ter fechamento no HTML final');

  const cadastroInnerHtml = html.slice(cadastro.openEnd + 1, cadastroClose);
  assert.doesNotMatch(cadastroInnerHtml, /<form\b/i);

  const formAlterarSenhaIndex = getFormMarkerIndex(html, 'id="formAlterarSenha"');
  assert.ok(formAlterarSenhaIndex > cadastroClose, 'formAlterarSenha deve permanecer fora do cadastro principal no HTML final');

  assert.deepEqual(
    forms.map(({ order, id, probableOrigin, nestedWithinPrevious }) => ({ order, id, probableOrigin, nestedWithinPrevious })),
    [
      { order: 1, id: 'cadastroUnidadeForm', probableOrigin: 'views/gestor/unidades.ejs', nestedWithinPrevious: false },
      { order: 2, id: 'formAlterarSenha', probableOrigin: 'views/partials/perfil.ejs', nestedWithinPrevious: false },
    ],
  );

  assert.match(forms[0].relevantAncestor, /<div class="wdg-card-body wdg-form wdg-tight">/i);
  assert.match(forms[1].relevantAncestor, /<div class="modal-body">/i);
});

test('feedback widget usa compose sem form nativo e mantém responsabilidade isolada', async () => {
  const html = await renderUnidadesView();

  assert.doesNotMatch(html, /<form\b[^>]*class="wdg-feedback-chat-compose"/i);
  assert.match(html, /<div\b[^>]*class="wdg-feedback-chat-compose"[^>]*role="group"[^>]*aria-label="Compor mensagem de feedback"/i);
  assert.match(html, /<button class="wdg-feedback-chat-send" type="button" aria-label="Enviar" data-chat-send>/i);
  assert.match(html, /<form\b[^>]*id="formAlterarSenha"/i);
});
