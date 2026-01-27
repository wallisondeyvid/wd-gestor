#!/usr/bin/env node
/**
 * Script: unlock_users.js
 * Objetivo: Desbloquear usuários que estejam com lock ativo (lock_until) ou limpar tentativas falhas.
 * Uso:
 *   node scripts/unlock_users.js --email usuario@dominio.com   (desbloqueia usuário específico)
 *   node scripts/unlock_users.js --expired                      (desbloqueia apenas locks já expirados)
 *   node scripts/unlock_users.js --all                          (desbloqueia todos)
 *   node scripts/unlock_users.js --threshold 3                  (zera tentativas >= 3)
 * Combinações possíveis (ex: --expired --threshold 2).
 *
 * Variáveis ambiente relevantes (padrão .env / processo):
 *   MONGODB_URI ou DB_URL
 */
import mongoose from 'mongoose';
import User from '#core/models/user.js';

function parseArgs(){
  const args = process.argv.slice(2);
  const out = { flags: {}, raw: args };
  for (let i=0;i<args.length;i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const next = args[i+1] && !args[i+1].startsWith('--') ? args[i+1] : true;
      if (next === true) out.flags[key] = true; else { out.flags[key] = next; i++; }
    }
  }
  return out.flags;
}

async function main(){
  const flags = parseArgs();
  const uri = process.env.MONGODB_URI || process.env.DB_URL || 'mongodb://localhost:27017/wdgestor';
  await mongoose.connect(uri);
  console.log('[unlock_users] conectado ao banco');

  const filter = {};
  const updates = { $set: { failed_login_attempts: 0 }, $unset: { lock_until: 1 } };

  if (flags.email) {
    filter.email = String(flags.email).toLowerCase();
  } else if (flags.expired) {
    filter.lock_until = { $lt: new Date() };
  } else if (!flags.all) {
    console.log('Nenhum alvo definido. Use --email, --expired ou --all');
    await mongoose.disconnect();
    return;
  }

  if (flags.threshold) {
    const t = Number(flags.threshold);
    if (!isNaN(t)) filter.failed_login_attempts = { $gte: t };
  }

  const before = await User.countDocuments(filter);
  if (before === 0) {
    console.log('Nenhum usuário corresponde ao filtro:', filter);
    await mongoose.disconnect();
    return;
  }
  const res = await User.updateMany(filter, updates);
  console.log(`[unlock_users] Usuários afetados: ${res.modifiedCount || res.nModified || 0}`);
  await mongoose.disconnect();
}

main().catch(e => { console.error('[unlock_users] erro:', e); process.exit(1); });
