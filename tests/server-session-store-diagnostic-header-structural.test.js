import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve(process.cwd(), 'src/server/createServer.js');
const source = fs.readFileSync(filePath, 'utf8');

test('createServer expõe header seguro do tipo de session store', () => {
  assert.match(
    source,
    /let store;[\s\S]*let sessionStoreKind = 'memory';/,
    'sessionStoreKind deve iniciar como memory',
  );

  assert.match(
    source,
    /store = wrapSessionStoreSafe\(store\);[\s\S]*sessionStoreKind = 'mongo';[\s\S]*console\.log\('\[session\] usando connect-mongo'\);/,
    'sessionStoreKind deve mudar para mongo quando connect-mongo for habilitado',
  );

  assert.match(
    source,
    /app\.locals\.sessionStoreKind = sessionStoreKind;/,
    'tipo do session store deve ser registrado em app.locals',
  );

  assert.match(
    source,
    /res\.setHeader\('X-Session-Store', String\(app\.locals\.sessionStoreKind \|\| 'memory'\)\);/,
    'resposta deve expor X-Session-Store sem segredo',
  );
});
