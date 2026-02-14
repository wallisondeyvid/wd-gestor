// Script: diagnosticar_codigos_setor.js
// Lista códigos de Setor, identifica duplicados e mostra próxima sugestão.
// Uso:
//   set MONGODB_URI=mongodb://localhost:27017/wdgestor && node scripts/diagnosticar_codigos_setor.js

import mongoose from 'mongoose';
import 'dotenv/config';
import Setor from '#core/models/setor.js';

async function run(){
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wdgestor';
  await mongoose.connect(uri);
  console.log('[diagnosticar_codigos_setor] Conectado em', uri);
  const setores = await Setor.find({}, { codigo:1 }).lean();
  const map = new Map();
  setores.forEach(s => { if(!s.codigo) return; map.set(s.codigo, (map.get(s.codigo)||0)+1); });
  const duplicados = Array.from(map.entries()).filter(([,q])=>q>1);
  console.log('Total setores:', setores.length);
  console.log('Total códigos únicos:', map.size);
  if (duplicados.length){
    console.warn('\nCódigos duplicados encontrados:');
    duplicados.forEach(([c,q])=> console.warn(' -', c, 'x'+q));
  } else {
    console.log('Nenhum código duplicado.');
  }
  // Sugerir próximo código
  let maxNum = 0;
  Array.from(map.keys()).forEach(c => {
    const m = c.match(/^S(\d{7})$/); if (m){ const n = parseInt(m[1],10); if (n>maxNum) maxNum = n; }
  });
  const sugestao = 'S'+ String(maxNum+1).padStart(7,'0');
  console.log('\nSugestão próximo código:', sugestao);
  await mongoose.disconnect();
}
run().catch(e=>{ console.error('Erro:', e); process.exit(1); });
