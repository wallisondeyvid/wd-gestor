// Migração para normalizar campo 'classificacao' em documentos Escala.
// Uso: node scripts/migrar_classificacao_escalas.js
import mongoose from 'mongoose';
import Escala from '#core/models/escala.js';

async function run(){
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/gestor';
  await mongoose.connect(uri);
  console.log('Conectado ao MongoDB');

  const res1 = await Escala.updateMany(
    { $or:[ { classificacao:null }, { classificacao:{ $exists:false } } ] },
    { $set:{ classificacao:'ORDINÁRIA' } }
  );
  const res2 = await Escala.updateMany(
    { classificacao:'ORDINARIA' },
    { $set:{ classificacao:'ORDINÁRIA' } }
  );
  const res3 = await Escala.updateMany(
    { classificacao:'EXTRAORDINARIA' },
    { $set:{ classificacao:'EXTRAORDINÁRIA' } }
  );

  console.log('Atualizações realizadas:', {
    nullOuInexistente: res1.modifiedCount,
    ordinariaSemAcento: res2.modifiedCount,
    extraordinariaSemAcento: res3.modifiedCount
  });
  await mongoose.disconnect();
  console.log('Finalizado.');
}

run().catch(e=>{ console.error(e); process.exit(1); });
