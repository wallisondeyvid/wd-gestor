import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = 'public/mensagens/js/caixa_de_mensagem.js';

test('JS standalone de Mensagens documenta deep-link pelo caminho do módulo standalone', () => {
  const src = fs.readFileSync(sourcePath, 'utf8');

  assert.match(
    src,
    /\/mensagens\/dashboard\?view=entrada\|saida\|arquivo\|lixeira\|nova\|grupos\|cfg_caixas\|cfg_geral/,
    'comentário de deep-link deve apontar para /mensagens/dashboard'
  );

  assert.doesNotMatch(
    src,
    /\/administracao\/caixa-de-mensagem\?view=/,
    'JS standalone de Mensagens não deve documentar a rota legada de Condomínios como deep-link'
  );
});
