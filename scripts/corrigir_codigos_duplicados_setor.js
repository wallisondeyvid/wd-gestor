// Script: corrigir_codigos_duplicados_setor.js
// Objetivo: detectar códigos duplicados em Setor e reatribuir novos códigos usando o contador atômico existente.
// Uso:
//   set MONGODB_URI=mongodb://localhost:27017/wdgestor && node scripts/corrigir_codigos_duplicados_setor.js --apply
// Sem --apply apenas mostra o que faria.

import mongoose from 'mongoose';
import 'dotenv/config';
import Setor from '#core/models/setor.js';

async function obterNovoCodigo(){
  // Reutiliza o mesmo mecanismo do pre-save: incrementa manualmente a collection de counters
  const Counter = mongoose.model('_Counter');
  const ret = await Counter.findOneAndUpdate(
    { _id: 'setor_codigo' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return 'S' + String(ret.seq).padStart(7,'0');
}

async function run(){
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wdgestor';
  await mongoose.connect(uri);
  console.log('[corrigir_codigos_duplicados_setor] Conectado em', uri);

  const setores = await Setor.find({}, { codigo:1 }).lean();
  const byCodigo = new Map();
  setores.forEach(s => { if(!s.codigo) return; if(!byCodigo.has(s.codigo)) byCodigo.set(s.codigo, []); byCodigo.get(s.codigo).push(s._id); });
  const duplicados = Array.from(byCodigo.entries()).filter(([,arr]) => arr.length > 1);

  if (!duplicados.length){
    console.log('Nenhum código duplicado. Nada a fazer.');
    await mongoose.disconnect();
    return;
  }

  console.log('Códigos duplicados detectados:', duplicados.length);
  let plano = [];
  for (const [codigo, ids] of duplicados){
    // manter o primeiro, regenerar para restantes
    const manter = ids[0];
    const reatribuir = ids.slice(1);
    for (const id of reatribuir){
      plano.push({ antigo: codigo, id });
    }
  }
  console.log('Registros a reatribuir:', plano.length);
  plano.slice(0,10).forEach(p => console.log(' - setor', p.id, 'codigo atual', p.antigo));
  if (plano.length > 10) console.log(' ... (+', plano.length - 10, 'outros)');

  if (!apply){
    console.log('\nModo leitura. Execute com --apply para efetivar.');
    await mongoose.disconnect();
    return;
  }

  for (const item of plano){
    const novoCodigo = await obterNovoCodigo();
    await Setor.updateOne({ _id: item.id }, { $set: { codigo: novoCodigo } });
    console.log('Atualizado', item.id, '->', novoCodigo);
  }

  console.log('\nConcluído. Recomenda-se rodar novamente: diagnosticar_codigos_setor.js');
  await mongoose.disconnect();
}

run().catch(e => { console.error('Erro geral:', e); process.exit(1); });
