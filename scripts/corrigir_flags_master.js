#!/usr/bin/env node
// Script para limpar flags de primeiro acesso / senha provisória de usuários master existentes
// Uso: node scripts/corrigir_flags_master.js
import mongoose from 'mongoose';
import 'dotenv/config';
import User from '#modules/gestor/app/models/user.js';

async function run() {
  const uri = process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/wdgestor';
  await mongoose.connect(uri);
  const masters = await User.find({ role: 'master', $or: [ { primeiro_acesso: true }, { senha_provisoria: true } ] });
  if (!masters.length) { console.log('Nenhum master com flags para corrigir.'); await mongoose.disconnect(); return; }
  for (const u of masters) {
    u.primeiro_acesso = false; u.senha_provisoria = false;
    await u.save();
    console.log('Atualizado master', u.email);
  }
  await mongoose.disconnect();
  console.log('Concluído.');
}
run().catch(e => { console.error(e); process.exit(1); });
