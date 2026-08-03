import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = 'src/modules/mensagens/app/mensagens-api.js';

test('admin/users foi migrado para o módulo Mensagens', () => {
  const src = fs.readFileSync(sourcePath, 'utf8');

  assert.match(src, /import\s+CondUsuario\s+from\s+'#models\/cond_usuario\.js';/);
  assert.match(src, /import\s+CondMorador\s+from\s+'#models\/cond_morador\.js';/);
  assert.match(src, /import\s+Funcionario\s+from\s+'#models\/Funcionario\.js';/);

  assert.match(src, /router\.get\('\/admin\/users'/);
  assert.match(src, /function\s+pushAdminUserRow\s*\(/);

  assert.match(src, /Funcionario\.find\(\s*\{\s*unidade_id:\s*unidadeObjectId/);
  assert.match(src, /CondMorador\.find\(\s*\{\s*unidade_id:\s*unidadeObjectId/);
  assert.match(src, /CondUsuario\.find\(\s*\{/);

  assert.match(src, /origem:\s*'portal'/);
  assert.match(src, /origem:\s*'colaborador'/);
  assert.match(src, /habitacao_id:\s*habitacaoId/);
});
