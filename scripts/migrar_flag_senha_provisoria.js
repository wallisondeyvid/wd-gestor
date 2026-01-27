// Script de migração: ajusta usuarios antigos para nova flag senha_provisoria
// Uso: node scripts/migrar_flag_senha_provisoria.js
import mongoose from 'mongoose';
import 'dotenv/config';
import User from '../src/core/models/user.js';

async function run(){
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/wdgestor';
  await mongoose.connect(uri);
  console.log('[migracao] Conectado');
  const usuarios = await User.find({ primeiro_acesso: true, $or: [{ senha_provisoria: { $exists: false } }, { senha_provisoria: null }] });
  console.log('[migracao] Usuarios alvo:', usuarios.length);
  for (const u of usuarios){
    u.senha_provisoria = true; // Mantém exigência até troca
    await u.save();
    console.log('[migracao] Atualizado', u.email);
  }
  await mongoose.disconnect();
  console.log('[migracao] Finalizado');
}
run().catch(e=>{ console.error('Erro migração', e); process.exit(1); });
