// Script: check_setor_indexes.js
// Objetivo: Listar índices da coleção Setor e apontar potenciais conflitos
// Uso:
//   set MONGODB_URI=mongodb://localhost:27017/wdgestor && node scripts/check_setor_indexes.js

import mongoose from 'mongoose';
import 'dotenv/config';
import Setor from '../src/core/models/setor.js';

async function run(){
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wdgestor';
  await mongoose.connect(uri);
  console.log('[check_setor_indexes] Conectado em', uri);

  const coll = mongoose.connection.collection('setors'); // nome pluralizado pelo Mongoose (verifique se diferente)
  const indexes = await coll.indexes();
  console.log('\nÍndices existentes:');
  indexes.forEach(idx => console.log(' -', idx.name, JSON.stringify(idx.key), idx.unique ? '[UNIQUE]' : ''));

  // Procurar índices suspeitos (unique só em nome / nome_normalizado sem unidade_id)
  const suspeitos = indexes.filter(i => i.unique && (
    (i.key && i.key.nome && !('unidade_id' in i.key)) ||
    (i.key && i.key.nome_normalizado && !('unidade_id' in i.key))
  ));
  if (suspeitos.length){
    console.warn('\nATENÇÃO: Foram encontrados índices UNIQUE sem unidade_id que podem causar falso duplicado:');
    suspeitos.forEach(s => console.warn(' *', s.name, JSON.stringify(s.key)));
    console.warn('Se confirmar que não são necessários, remova manualmente (Mongo Shell):');
    suspeitos.forEach(s => console.warn(` db.setors.dropIndex("${s.name}")`));
  } else {
    console.log('\nNenhum índice unique suspeito (sem unidade_id) encontrado.');
  }

  await mongoose.disconnect();
}

run().catch(e => { console.error('Erro geral:', e); process.exit(1); });
