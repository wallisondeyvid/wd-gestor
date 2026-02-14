// Script utilitário para criar/atualizar o usuário master e definir a senha
// Uso:
//   node scripts/set-master-password.js <email> <senha>
// ou com variáveis de ambiente:
//   set MASTER_EMAIL=wallisondeyvid13@gmail.com && set MASTER_PASSWORD=deyvid2025 && node scripts/set-master-password.js

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectMongo } from '#core/db/connect.js';
import User from '#core/models/user.js';

async function main() {
  try {
    const argEmail = process.argv[2];
    const argPass = process.argv[3];
    const email = (process.env.MASTER_EMAIL || argEmail || '').toLowerCase().trim();
    const senha = process.env.MASTER_PASSWORD || argPass || '';
    if (!email || !senha) {
      console.error('[master-password] Uso: node scripts/set-master-password.js <email> <senha>');
      process.exit(2);
    }

    if (process.env.MONGO_MEMORY === '1') {
      console.warn('[master-password] Aviso: MONGO_MEMORY=1 está ativo; a alteração ficará apenas em memória.');
    }

    await connectMongo(process.env.MONGO_URI);

    let user = await User.findOne({ email });
    const hashed = await bcrypt.hash(senha, 10);

    if (!user) {
      user = new User({ nome: 'Master User', email, senha: hashed, role: 'master', ativo: true, failed_login_attempts: 0, lock_until: null });
      await user.save();
      console.log('[master-password] Usuário master criado com sucesso.');
    } else {
      user.senha = hashed;
      user.role = 'master';
      user.ativo = true;
      user.failed_login_attempts = 0;
      user.lock_until = null;
      await user.save();
      console.log('[master-password] Senha do usuário master atualizada com sucesso.');
    }
    process.exit(0);
  } catch (err) {
    console.error('[master-password] Falha:', err);
    process.exit(1);
  }
}

main();
