import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = 'src/modules/portal-morador/app/portal-morador-app.js';

function readSource() {
  return fs.readFileSync(sourcePath, 'utf8');
}

test('Portal mantém compatibilidade do JS antigo apontando para asset standalone de Mensagens', () => {
  const src = readSource();

  assert.match(
    src,
    /app\.get\('\/js\/condominios\/caixa_de_mensagem\.js'/,
    'rota de compatibilidade do Portal para JS antigo deve existir'
  );

  assert.match(
    src,
    /public\/mensagens\/js\/caixa_de_mensagem\.js/,
    'rota de compatibilidade deve servir o asset atual do módulo Mensagens'
  );

  assert.doesNotMatch(
    src,
    /public\/js\/condominios\/caixa_de_mensagem\.js/,
    'Portal não deve apontar para asset legado removido de Condomínios'
  );
});
