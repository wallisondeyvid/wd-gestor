// Enriquecer descrições de Função usando dataset CBO (public/data/cbo_full.json)
// Estratégia:
// 1. Carrega todas as funções sem descricao (descricao ausente/vazia ou igual ao codigo)
// 2. Para cada função tenta casar com título CBO usando heurísticas:
//    - Se nome (ou parte) coincide exatamente com titulo (case-insensitive)
//    - Se remover acentos e comparar inclui
//    - Mantém primeira correspondência com melhor score
// 3. Atualiza descricao com titulo CBO quando score >= limiar
// 4. Gera relatório dry-run por padrão. Para aplicar, rodar com APPLY=1
// Uso:
//   node scripts/enriquecer_funcoes_com_cbo.js             (somente relatório)
//   APPLY=1 node scripts/enriquecer_funcoes_com_cbo.js    (aplica updates)
// Requisitos: variável MONGO_URI ou MONGODB_URI configurada.

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import Funcao from '#core/models/funcao.js';
import 'dotenv/config';

function norm(str=''){ return str.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim(); }

function scoreMatch(nomeNorm, tituloNorm){
  if (nomeNorm === tituloNorm) return 1.0; // match perfeito
  if (tituloNorm.startsWith(nomeNorm) || nomeNorm.startsWith(tituloNorm)) return 0.85;
  if (tituloNorm.includes(nomeNorm)) return 0.75;
  // similaridade simples por interseção de tokens
  const a = new Set(nomeNorm.split(/[^a-z0-9]+/).filter(Boolean));
  const b = new Set(tituloNorm.split(/[^a-z0-9]+/).filter(Boolean));
  if (!a.size || !b.size) return 0;
  let inter = 0; a.forEach(t=>{ if (b.has(t)) inter++; });
  const ratio = inter / Math.max(a.size,b.size);
  return ratio >= 0.6 ? 0.6 + (ratio-0.6) : ratio; // escala simples
}

async function main(){
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/gestor';
  await mongoose.connect(uri);
  const cboPath = path.resolve('public','data','cbo_full.json');
  if (!fs.existsSync(cboPath)) { console.error('[enriquecer] Arquivo cbo_full.json não encontrado em public/data'); process.exit(1); }
  const cbo = JSON.parse(fs.readFileSync(cboPath,'utf8'));
  const cboNorm = cbo.map(c=>({ codigo:c.codigo, titulo:c.titulo, tituloNorm:norm(c.titulo) }));
  const funcoes = await Funcao.find({ $or:[ { descricao: { $exists:false } }, { descricao:'' }, { $expr: { $eq: ['$descricao','$codigo'] } } ] }).lean();
  console.log(`[enriquecer] Funções candidatas: ${funcoes.length}`);
  const LIMIAR = 0.75; // pode ajustar
  let updates=[];
  for (const f of funcoes){
    const nomeNorm = norm(f.nome || '');
    if (!nomeNorm) continue;
    let melhor=null;
    for (const c of cboNorm){
      const sc = scoreMatch(nomeNorm, c.tituloNorm);
      if (sc >= LIMIAR && (!melhor || sc > melhor.score)){
        melhor = { score: sc, titulo: c.titulo, codigoCBO: c.codigo };
        if (sc === 1.0) break; // melhor possível
      }
    }
    if (melhor){
      updates.push({ id:f._id, codigo:f.codigo, nome:f.nome, novoDescricao:melhor.titulo, score:melhor.score, cbo:melhor.codigoCBO });
    }
  }
  console.log(`[enriquecer] Matches encontrados: ${updates.length}`);
  console.table(updates.slice(0,20).map(u=>({ codigo:u.codigo, nome:u.nome, novoDescricao:u.novoDescricao, score:u.score.toFixed(2), cbo:u.cbo })));
  if (process.env.APPLY==='1' || process.env.APPLY==='true'){
    let ok=0; for (const u of updates){ await Funcao.findByIdAndUpdate(u.id,{ descricao:u.novoDescricao }); ok++; }
    console.log(`[enriquecer] Updates aplicados: ${ok}`);
  } else {
    console.log('[enriquecer] Modo relatório (não aplicou). Para aplicar: APPLY=1 node scripts/enriquecer_funcoes_com_cbo.js');
  }
  await mongoose.disconnect();
}

main().catch(e=>{ console.error(e); process.exit(1); });
