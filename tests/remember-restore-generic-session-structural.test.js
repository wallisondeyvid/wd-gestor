import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve(process.cwd(), 'src/core/middlewares/rememberRestore.js');
const source = fs.readFileSync(filePath, 'utf8');

test('rememberRestore nao restaura sessao generica automaticamente fora do modulo Escalas', () => {
  assert.doesNotMatch(
    source,
    /else\s*\{\s*req\.session\.user\s*=\s*sessPayload;\s*\}/,
    'rememberRestore nao deve recriar req.session.user automaticamente para modulos genericos',
  );

  assert.match(
    source,
    /const originalUrl = String\(req\.originalUrl \|\| req\.url \|\| ''\);[\s\S]*const isEscalas = originalUrl\.startsWith\('\/escalas'\);[\s\S]*const isLoginPage = \/\\\/login\(\?:\[\?#\]\.\*\)\?\$\/i\.test\(originalUrl\);/,
    'rememberRestore deve calcular originalUrl, isEscalas e isLoginPage',
  );

  assert.match(
    source,
    /else if \(isLoginPage\) \{[\s\S]*const rememberedUser = \{[\s\S]*id: sessPayload\.id,[\s\S]*email: sessPayload\.email,[\s\S]*nome: sessPayload\.nome \|\| null,[\s\S]*\};[\s\S]*req\.rememberedUser = rememberedUser;[\s\S]*res\.locals\.rememberedUser = rememberedUser;[\s\S]*\}/,
    'rememberRestore generico deve apenas expor rememberedUser na tela de login',
  );
});

test('rememberRestore preserva sessao separada do modulo Escalas', () => {
  assert.match(
    source,
    /if \(isEscalas\) \{[\s\S]*req\.session\.escalasUser = sessPayload;[\s\S]*\}/,
    'rememberRestore deve preservar comportamento isolado de Escalas',
  );
});
