#!/usr/bin/env node
/**
 * Aplica overrides de naturezas_juridicas aos CNAEs existentes.
 * Lê public/data/cnaes_lista.json e public/data/cnaes_naturezas_overrides.json
 * Regrava cnaes_lista.json com os campos adicionados/atualizados.
 */
const fs = require('fs');
const path = require('path');
const CNAES_PATH = path.join(__dirname, '..', 'public', 'data', 'cnaes_lista.json');
const OVERRIDES_PATH = path.join(__dirname, '..', 'public', 'data', 'cnaes_naturezas_overrides.json');

function loadJSON(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }

function main(){
  if (!fs.existsSync(CNAES_PATH)) throw new Error('cnaes_lista.json não encontrado');
  if (!fs.existsSync(OVERRIDES_PATH)) throw new Error('cnaes_naturezas_overrides.json não encontrado');
  const base = loadJSON(CNAES_PATH);
  const overrides = loadJSON(OVERRIDES_PATH);
  const mapOverrides = new Map(overrides.map(o => [o.cod, o.naturezas_juridicas]));
  let aplicados = 0;
  for (const item of base) {
    if (mapOverrides.has(item.cod)) {
      item.naturezas_juridicas = mapOverrides.get(item.cod);
      aplicados++;
    }
  }
  fs.writeFileSync(CNAES_PATH, JSON.stringify(base, null, 2), 'utf8');
  console.log(`Overrides aplicados a ${aplicados} CNAEs.`);
}

if (require.main === module) {
  try { main(); } catch(e){ console.error(e.message); process.exit(1); }
}
