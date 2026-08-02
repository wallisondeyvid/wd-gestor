import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const legacyAsset = path.join('public', 'js', 'condominios', 'configuracoes_geral.js');

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

test('Condomínios não deve manter asset legado de configurações gerais da Caixa de Mensagens', () => {
  assert.equal(
    fs.existsSync(legacyAsset),
    false,
    'asset legado public/js/condominios/configuracoes_geral.js não deve existir'
  );
});

test('views e módulos não devem referenciar configuracoes_geral.js legado de Condomínios', () => {
  const files = [
    ...walkFiles('views'),
    ...walkFiles('src')
  ];

  const forbidden = [
    '/js/condominios/configuracoes_geral',
    'condominios/configuracoes_geral.js',
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
    'não deve haver referência ao asset legado de configurações gerais em Condomínios'
  );
});
