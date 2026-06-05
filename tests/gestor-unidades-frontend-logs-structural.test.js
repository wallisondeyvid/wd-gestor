import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const FORM_SUBMIT_PATH = path.join(process.cwd(), 'public/gestor/js/pages/form-submit-unidade.js');
const UNIDADES_PAGE_PATH = path.join(process.cwd(), 'public/gestor/js/pages/unidades.js');

test('frontend de unidades remove logs de payload completo em produção e usa flag explícita de debug', () => {
  const formSubmitSource = fs.readFileSync(FORM_SUBMIT_PATH, 'utf8');
  const unidadesSource = fs.readFileSync(UNIDADES_PAGE_PATH, 'utf8');

  assert.equal(formSubmitSource.includes('[FRONTEND] Payload construído'), false);
  assert.equal(formSubmitSource.includes('[cadastrarUnidade] payload enviado'), false);
  assert.equal(formSubmitSource.includes('[FRONTEND] Todos radio buttons pessoaTipo'), false);
  assert.equal(formSubmitSource.includes('[FRONTEND] Elemento checked encontrado'), false);
  assert.equal(unidadesSource.includes('[FRONTEND] Enviando requisição:'), false);
  assert.equal(unidadesSource.includes('[FRONTEND] Dados da resposta:'), false);

  assert.equal(formSubmitSource.includes('WDG_DEBUG_UNIDADES'), true);
  assert.equal(unidadesSource.includes('WDG_DEBUG_UNIDADES'), true);
  assert.equal(formSubmitSource.includes("safe[key] = '[REDACTED]';"), true);
  assert.equal(unidadesSource.includes("safe[key] = '[REDACTED]';"), true);
});