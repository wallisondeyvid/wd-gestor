import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = 'views/shared/partials/navbar-shared.ejs';

function readSource() {
  return fs.readFileSync(sourcePath, 'utf8');
}

function extractMsgShortcutBlock(src) {
  const startNeedle = 'id="navMsgNotifyLink"';
  const start = src.indexOf(startNeedle);
  assert.notEqual(start, -1, 'navbar deve conter o atalho navMsgNotifyLink');

  const liStart = src.lastIndexOf('<li class="nav-item">', start);
  assert.notEqual(liStart, -1, 'atalho de mensagens deve estar dentro de um li.nav-item');

  const end = src.indexOf('</li>', start);
  assert.notEqual(end, -1, 'atalho de mensagens deve fechar o li');

  return src.slice(liStart, end + '</li>'.length);
}

test('navbar compartilhado mantém atalho global para Caixa de Mensagens', () => {
  const src = readSource();
  const block = extractMsgShortcutBlock(src);

  assert.match(
    block,
    /href="\/mensagens\/dashboard"/,
    'atalho de mensagens deve apontar para /mensagens/dashboard'
  );

  assert.match(
    block,
    /bi-envelope-fill/,
    'atalho de mensagens deve usar ícone global de envelope'
  );

  assert.doesNotMatch(
    block,
    /condominios|condominio|administracao\/caixa-de-mensagem/,
    'atalho de mensagens não deve depender do módulo Condomínios nem da rota legada'
  );
});

test('navbar compartilhado consulta badge de mensagens pelo módulo standalone', () => {
  const src = readSource();

  assert.match(
    src,
    /var\s+__NB_API_BASE\s*=\s*'\/mensagens';/,
    'badge de mensagens deve usar /mensagens como base de API'
  );

  assert.match(
    src,
    /var\s+LS_UNREAD_KEY\s*=\s*'wdg:mensagens:unreadCount';/,
    'cache de não lidas deve usar chave própria do módulo Mensagens'
  );

  assert.match(
    src,
    /location\.href\s*=\s*'\/mensagens\/dashboard';/,
    'clique da notificação deve abrir /mensagens/dashboard'
  );

  assert.match(
    src,
    /isMsgPage\s*=\s*p\.indexOf\('\/mensagens'\)\s*===\s*0;/,
    'detecção da tela de mensagens deve considerar /mensagens'
  );

  assert.doesNotMatch(
    src,
    /__NB_API_BASE\s*!==\s*'\/condominios'/,
    'badge não deve ser bloqueado fora do módulo Condomínios'
  );

  assert.doesNotMatch(
    src,
    /wdg:condominios:unreadCount/,
    'cache antigo de não lidas do Condomínios não deve ser usado'
  );
});
