// Script para ajustar o contador de setores se estiver defasado.
// Uso: node scripts/fix_setor_counter.js
import mongoose from 'mongoose';
import 'dotenv/config';
import Setor from '#models/setor.js';

async function main(){
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/wdgestor';
  await mongoose.connect(uri);
  const Counter = mongoose.models._Counter;
  const maxSetor = await Setor.find({ codigo:{ $exists:true } }).sort({ codigo:-1 }).limit(1).select('codigo').lean();
  const maxCodigo = maxSetor.length ? maxSetor[0].codigo : null;
  let targetSeq = 0;
  if (maxCodigo) {
    const num = Number(maxCodigo.slice(1));
    if (Number.isFinite(num)) targetSeq = num;
  }
  const before = await Counter.findOne({ _id:'setor_codigo' }).lean();
  const updated = await Counter.findOneAndUpdate(
    { _id:'setor_codigo', seq: { $lt: targetSeq } },
    { $set: { seq: targetSeq } },
    { new:true, upsert:true }
  ).lean();
  console.log('Max codigo existente:', maxCodigo);
  console.log('Counter antes:', before);
  console.log('Counter depois:', updated);
  await mongoose.disconnect();
}
main().catch(e=>{ console.error(e); process.exit(1); });
