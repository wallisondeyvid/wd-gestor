// Script: diagnosticar_setores_sem_unidade.js
// Objetivo: Listar setores que estão sem unidade_id ou com unidade_id inexistente
// Uso (Windows / cmd):
//   set MONGODB_URI=mongodb://localhost:27017/wdgestor && node scripts/diagnosticar_setores_sem_unidade.js
// (Ajuste a connection string conforme necessário)

import mongoose from 'mongoose';
import 'dotenv/config';
import Setor from '../src/core/models/setor.js';
import Unidade from '../src/core/models/unidade.js';

async function run(){
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wdgestor';
  await mongoose.connect(uri);
  console.log('Conectado em', uri);

  // 1. Setores sem unidade_id definido
  const semUnidade = await Setor.find({ $or: [ { unidade_id: { $exists: false } }, { unidade_id: null } ] }).lean();
  console.log(`\nSetores sem unidade_id (count=${semUnidade.length}):`);
  semUnidade.forEach(s => console.log(` - _id=${s._id} nome="${s.nome}" codigo=${s.codigo}`));

  // 2. Setores com unidade_id que aponta para unidade inexistente
  const comUnidade = await Setor.find({ unidade_id: { $exists: true, $ne: null } }).select('unidade_id nome codigo').lean();
  const idsUnidades = [...new Set(comUnidade.map(s => String(s.unidade_id)))];
  const unidadesExistentes = await Unidade.find({ _id: { $in: idsUnidades } }).select('_id').lean();
  const setIdsExist = new Set(unidadesExistentes.map(u => String(u._id)));
  const orfãos = comUnidade.filter(s => !setIdsExist.has(String(s.unidade_id)));

  console.log(`\nSetores com unidade_id inexistente (count=${orfãos.length}):`);
  orfãos.forEach(s => console.log(` - _id=${s._id} unidade_id=${s.unidade_id} nome="${s.nome}" codigo=${s.codigo}`));

  // 3. Resumo
  console.log('\nResumo:');
  console.log('  Sem unidade_id........:', semUnidade.length);
  console.log('  Unidade inexistente....:', orfãos.length);
  console.log('  Total analisado........:', semUnidade.length + comUnidade.length);

  await mongoose.disconnect();
  console.log('\nFim.');
}

run().catch(e => { console.error('Erro geral:', e); process.exit(1); });
