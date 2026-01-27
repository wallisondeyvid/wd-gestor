// Lista até 10 funções sem descricao preenchida para diagnóstico
// Uso: node scripts/inspecionar_funcoes_sem_descricao.js
import mongoose from 'mongoose';
import Funcao from '../src/core/models/funcao.js';
import 'dotenv/config';

async function run(){
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/gestor';
  await mongoose.connect(uri);
  const semDesc = await Funcao.find({ $or:[ { descricao: { $exists:false } }, { descricao: null }, { descricao:'' } ] }).limit(10).lean();
  console.log('\n[diagnostico] Qtde sem descricao (amostra 10):', semDesc.length);
  console.log(semDesc.map(f=>({ _id:f._id, codigo:f.codigo, nome:f.nome, descricao:f.descricao })).slice(0,10));
  const totais = await Funcao.aggregate([
    { $group:{ _id:null, total:{ $sum:1 }, semDesc:{ $sum:{ $cond:[ { $or:[ { $eq:['$descricao',null] }, { $eq:['$descricao',''] }, { $not:['$descricao'] } ] },1,0 ] } } } }
  ]);
  console.log('\n[diagnostico] Totais:', totais);
  await mongoose.disconnect();
}
run().catch(e=>{ console.error(e); process.exit(1); });
