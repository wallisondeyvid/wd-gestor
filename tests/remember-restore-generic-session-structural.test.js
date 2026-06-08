import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve(process.cwd(), 'src/core/middlewares/rememberRestore.js');
const source = fs.readFileSync(filePath, 'utf8');

test('rememberRestore restaura sessao generica fora do modulo Escalas', () => {
  assert.match(
    source,
    /const isEscalas = req\.originalUrl && req\.originalUrl\.startsWith\('\/escalas'\);[\s\S]*if \(isEscalas\) \{[\s\S]*req\.session\.escalasUser = sessPayload;[\s\S]*\} else \{[\s\S]*req\.session\.user = sessPayload;[\s\S]*\}/,
    'rememberRestore deve preencher req.session.user para modulos genericos como condominios',
  );
});

test('rememberRestore preserva sessao separada do modulo Escalas', () => {
  assert.match(
    source,
    /req\.session\.escalasUser = sessPayload;/,
    'Escalas deve continuar usando req.session.escalasUser',
  );
});
