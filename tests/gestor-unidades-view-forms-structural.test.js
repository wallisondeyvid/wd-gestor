import test from 'node:test';
import assert from 'node:assert/strict';
import ejs from 'ejs';

const VIEW_PATH = 'views/gestor/unidades.ejs';

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
