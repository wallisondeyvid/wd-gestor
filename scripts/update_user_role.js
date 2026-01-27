// Atualiza a role de um usuário via e-mail
// Uso:
//   node scripts/update_user_role.js <email> <role>
// Ex.:
//   node scripts/update_user_role.js wallisondeyvid13@hotmail.com user

import 'dotenv/config';
import { connectMongo } from '../src/core/db/connect.js';
import User from '../src/core/models/user.js';

async function main(){
  try {
    const emailArg = process.argv[2];
    const roleArg = process.argv[3];
    if (!emailArg || !roleArg) {
      console.error('Uso: node scripts/update_user_role.js <email> <role>');
      process.exit(2);
    }
    const email = String(emailArg).trim().toLowerCase();
    const role = String(roleArg).trim().toLowerCase();
    const allowed = new Set(['user','diretor','admin','master']);
    if (!allowed.has(role)) {
      console.error('Role inválida. Use: user | diretor | admin | master');
      process.exit(2);
    }

    await connectMongo(process.env.MONGO_URI);

    const user = await User.findOne({ email });
    if (!user) {
      console.error('Usuário não encontrado:', email);
      process.exit(1);
    }

    // Proteção simples: impedir que a última conta master seja rebaixada
    if (user.role === 'master' && role !== 'master') {
      const totalMasters = await User.countDocuments({ role: 'master' });
      if (totalMasters <= 1) {
        console.error('Não é possível rebaixar: este é o único usuário master. Crie outro master antes.');
        process.exit(3);
      }
    }

    user.role = role;
    await user.save();
    console.log(`[update_user_role] ${email} -> role=${role} OK`);
    process.exit(0);
  } catch (e) {
    console.error('[update_user_role] erro:', e);
    process.exit(1);
  }
}

main();
