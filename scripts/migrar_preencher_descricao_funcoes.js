// Script de migração para preencher campo descricao de funções ausentes
// Uso: node scripts/migrar_preencher_descricao_funcoes.js
// Preenche descricao = nome quando descricao vazia/nula e nome != codigo.
// Se nome ausente (não deveria) usa codigo.
import mongoose from 'mongoose';
import 'dotenv/config';
import Funcao from '../src/core/models/funcao.js';

async function run(){
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/gestor';
  await mongoose.connect(uri, { autoIndex:false });
  console.log('[migrar_funcoes] conectado');
  const funcoes = await Funcao.find({ $or:[ { descricao: { $exists:false } }, { descricao: null }, { descricao:'' } ] });
  let alteradas=0;
  for(const f of funcoes){
    const codigo = f.codigo || '';
    const nome = f.nome || '';
    if (f.descricao && f.descricao.trim()) continue;
    let nova = '';
    if (nome && nome !== codigo) nova = nome; else nova = codigo || nome || '(sem)';
    f.descricao = nova;
    await f.save();
    alteradas++;
  }
  console.log(`[migrar_funcoes] Funções atualizadas: ${alteradas}`);
  await mongoose.disconnect();
  console.log('[migrar_funcoes] done');
}
run().catch(e=>{ console.error(e); process.exit(1); });
