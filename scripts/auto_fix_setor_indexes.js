// Script: auto_fix_setor_indexes.js
// Objetivo: Detectar e remover índices UNIQUE globais inválidos (sem unidade_id) em 'nome' ou 'nome_normalizado'
// Uso:
//   set MONGODB_URI=mongodb://localhost:27017/wdgestor && node scripts/auto_fix_setor_indexes.js --apply
// Sem --apply roda em modo somente leitura.

import mongoose from 'mongoose';
import 'dotenv/config';

async function run(){
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wdgestor';
  await mongoose.connect(uri);
  console.log('[auto_fix_setor_indexes] Conectado em', uri);
  const coll = mongoose.connection.collection('setors');
  const indexes = await coll.indexes();
  console.log('Índices existentes:');
  indexes.forEach(i => console.log(' -', i.name, JSON.stringify(i.key), i.unique ? '[UNIQUE]' : ''));

  const alvo = indexes.filter(i => i.unique && (
    (i.key && i.key.nome && !('unidade_id' in i.key)) ||
    (i.key && i.key.nome_normalizado && !('unidade_id' in i.key))
  ));

  if (!alvo.length){
    console.log('Nenhum índice global inválido encontrado. Nada a fazer.');
    await mongoose.disconnect();
    return;
  }

  console.warn('\nÍndices UNIQUE potencialmente inválidos encontrados:');
  alvo.forEach(a => console.warn(' *', a.name, JSON.stringify(a.key)));

  if (!apply){
    console.warn('\nModo leitura. Execute com --apply para remover:');
    alvo.forEach(a => console.warn('  db.setors.dropIndex("'+a.name+'")'));
    await mongoose.disconnect();
    return;
  }

  for (const idx of alvo){
    try {
      console.log('Removendo índice', idx.name);
      await coll.dropIndex(idx.name);
      console.log(' -> OK');
    } catch(err){
      console.error('Falha ao remover', idx.name, err.message);
    }
  }

  console.log('\nRecriando índices definidos no schema via ensureIndexes()...');
  await mongoose.model('Setor').syncIndexes();
  console.log('Concluído.');
  await mongoose.disconnect();
}

run().catch(e => { console.error('Erro geral:', e); process.exit(1); });
