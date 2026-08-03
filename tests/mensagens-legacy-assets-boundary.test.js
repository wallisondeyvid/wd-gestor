import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else {
      out.push(full);
    }
  }

  return out;
}

test('assets legados da Caixa de Mensagens não devem voltar para public/js/condominios', () => {
  const legacyFiles = [
    path.join('public', 'js', 'condominios', 'caixa_de_mensagem.js'),
    path.join('public', 'js', 'condominios', 'configuracoes_geral.js')
  ];

  for (const file of legacyFiles) {
    assert.equal(
      fs.existsSync(file),
      false,
      `asset legado não deve existir: ${file}`
    );
  }

  assert.equal(
    fs.existsSync(path.join('public', 'mensagens', 'js', 'caixa_de_mensagem.js')),
    true,
    'asset standalone caixa_de_mensagem.js deve existir em public/mensagens/js'
  );

  assert.equal(
    fs.existsSync(path.join('public', 'mensagens', 'js', 'configuracoes_geral.js')),
    true,
    'asset standalone configuracoes_geral.js deve existir em public/mensagens/js'
  );
});

test('código não deve apontar diretamente para assets legados da Caixa em public/js/condominios', () => {
  const files = [
    ...walkFiles('src'),
    ...walkFiles('views'),
    ...walkFiles('public')
  ];

  const forbidden = [
    'public/js/condominios/caixa_de_mensagem.js',
    'public/js/condominios/configuracoes_geral.js'
  ];

  const hits = [];

  for (const file of files) {
    const txt = fs.readFileSync(file, 'utf8');
    for (const needle of forbidden) {
      if (txt.includes(needle)) {
        hits.push(`${file}: ${needle}`);
      }
    }
  }

  assert.deepEqual(
    hits,
    [],
    'não deve haver referência direta aos assets legados removidos'
  );
});
