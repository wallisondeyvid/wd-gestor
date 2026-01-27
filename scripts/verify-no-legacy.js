#!/usr/bin/env node
/**
 * Verifica se arquivos monolíticos legacy reapareceram.
 * Uso: node scripts/verify-no-legacy.js
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(process.cwd());
const legacyFiles = [
  // Mantém checagens para garantir que nada volte sem querer
  'src/gestor-app.js',
  'src/gestor-app.js.backup',
  'src/index.js',
  'src/migrar-indices-empresas.js',
  'src/migrar-indices-corrigidos.js'
];

let found = [];
for (const rel of legacyFiles) {
  const full = path.join(root, rel);
  if (fs.existsSync(full)) {
    // Heurística: se contém "Arquivo legado" ou stub, pode ignorar? -> Não: queremos remoção física.
    found.push(rel);
  }
}

if (found.length === 0) {
  console.log('✅ Nenhum arquivo legacy detectado. Ambiente limpo.');
  process.exit(0);
} else {
  console.error('⚠️ Arquivos legacy detectados (remova-os):');
  for (const f of found) console.error(' - ' + f);
  process.exit(2);
}
