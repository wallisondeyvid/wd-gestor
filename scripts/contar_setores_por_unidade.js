// Script: contar_setores_por_unidade.js
// Objetivo: Mostrar contagem de setores com e sem unidade_id para diagnosticar tela de listagem.
// Uso:
//   set MONGODB_URI=mongodb://localhost:27017/wdgestor && node scripts/contar_setores_por_unidade.js
import mongoose from 'mongoose';
import 'dotenv/config';
import Setor from '../src/core/models/setor.js';

async function run(){
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wdgestor';
  await mongoose.connect(uri);
  const total = await Setor.countDocuments();
  const sem = await Setor.countDocuments({ $or:[ { unidade_id: { $exists:false } }, { unidade_id:null } ] });
  const com = total - sem;
  console.log('Total setores:', total);
  console.log('Com unidade_id:', com);
  console.log('Sem unidade_id:', sem);
  // Amostra rápida de 5 registros sem unidade
  if (sem){
    const amostra = await Setor.find({ $or:[ { unidade_id: { $exists:false } }, { unidade_id:null } ] }).limit(5).lean();
    console.log('\nAmostra setores sem unidade_id:');
    amostra.forEach(s => console.log(` - _id=${s._id} nome="${s.nome}" codigo=${s.codigo}`));
  }
  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
