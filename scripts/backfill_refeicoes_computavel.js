// Atualiza documentos de Escala para garantir que cada item de recursos[].refeicoes tenha o campo booleano `computavel`
// Inferência: quando ausente, computavel = true, a menos que tipo seja 'nao_computado' (ou 'não_computado').
// Uso: node scripts/backfill_refeicoes_computavel.js "mongodb://localhost/seu_banco"

import mongoose from 'mongoose';
import Escala from '../src/core/models/escala.js';

const MONGO_URI = process.argv[2] || process.env.MONGO_URI;
if(!MONGO_URI){
  console.error('Forneça a URI do MongoDB: node scripts/backfill_refeicoes_computavel.js "mongodb://..."');
  process.exit(1);
}

function inferComputavel(iv){
  if(iv && typeof iv.computavel === 'boolean') return iv.computavel;
  const t = String(iv?.tipo||'').toLowerCase();
  if(t === 'nao_computado' || t === 'não_computado') return false;
  return true;
}

async function run(){
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('[backfill] conectado');
  const cursor = Escala.find({ 'equipes.recursos.refeicoes': { $exists: true, $ne: [] } }).cursor();
  let totalEsc=0, totalRec=0, totalIv=0, totalTouched=0;
  for await (const esc of cursor){
    let touched=false;
    totalEsc++;
    for(const eq of (esc.equipes||[])){
      for(const rec of (eq.recursos||[])){
        if(Array.isArray(rec.refeicoes) && rec.refeicoes.length){
          totalRec++;
          for(const iv of rec.refeicoes){
            totalIv++;
            if(typeof iv.computavel !== 'boolean'){
              iv.computavel = inferComputavel(iv);
              touched=true; totalTouched++;
            }
          }
        }
      }
    }
    if(touched){
      try { await esc.save(); } catch(e){ console.warn('[backfill] falha salvar escala', esc._id, e.message); }
    }
  }
  console.log(`[backfill] escalas=${totalEsc} recursos=${totalRec} intervalos=${totalIv} atualizados=${totalTouched}`);
  await mongoose.disconnect();
  console.log('[backfill] concluído');
}

run().catch(e=>{ console.error('[backfill] erro fatal', e); process.exit(2); });
