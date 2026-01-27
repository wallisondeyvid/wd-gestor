// Script: backfill_setores_orfaos.js
// Objetivo: Atribuir uma unidade padrão a setores que estejam sem unidade_id
// Uso:
//   set MONGODB_URI=mongodb://localhost:27017/wdgestor && node scripts/backfill_setores_orfaos.js --unidade <ID_DA_UNIDADE>
// Se não passar --unidade, apenas lista e NÃO altera.

import mongoose from 'mongoose';
import 'dotenv/config';
import Setor from '../src/core/models/setor.js';
import Unidade from '../src/core/models/unidade.js';

function parseArgs(){
  const args = process.argv.slice(2);
  const out = {};
  for (let i=0;i<args.length;i++){
    if (args[i]==='--unidade' && args[i+1]) { out.unidade = args[i+1]; i++; }
    if (args[i]==='--dry-run') { out.dry = true; }
  }
  return out;
}

async function run(){
  const { unidade, dry } = parseArgs();
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wdgestor';
  await mongoose.connect(uri);
  console.log('Conectado em', uri);

  const orfaos = await Setor.find({ $or: [ { unidade_id: { $exists:false } }, { unidade_id: null } ] }).lean();
  console.log(`Setores órfãos encontrados: ${orfaos.length}`);
  orfaos.forEach(s=> console.log(` - _id=${s._id} nome="${s.nome}" codigo=${s.codigo}`));

  if (!unidade){
    console.log('\nNenhuma unidade alvo passada. Use --unidade <ID>. Nada será alterado.');
    await mongoose.disconnect();
    return;
  }

  const uni = await Unidade.findById(unidade).lean();
  if (!uni){
    console.error('Unidade alvo não encontrada:', unidade);
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`\nUnidade alvo: ${uni._id} => ${uni.codigo || ''} ${uni.nome || ''}`);

  if (!orfaos.length){
    console.log('Nada a atualizar.');
    await mongoose.disconnect();
    return;
  }

  if (dry){
    console.log('\nExecução em modo dry-run. Nenhuma alteração persistida.');
    await mongoose.disconnect();
    return;
  }

  const bulk = orfaos.map(s => ({ updateOne: { filter:{ _id: s._id }, update:{ $set:{ unidade_id: uni._id } } } }));
  const result = await Setor.bulkWrite(bulk);
  console.log('\nAtualização concluída:', result.modifiedCount, 'setores atualizados.');

  await mongoose.disconnect();
  console.log('Fim.');
}

run().catch(e => { console.error('Erro geral:', e); process.exit(1); });
