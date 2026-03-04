// gestor-seeds.js - versão modularizada das rotinas de seed essenciais
import bcrypt from 'bcryptjs';
import User from '#models/user.js';

// Funções copiadas/adaptadas de src/gestor/bootstrap/seeds.js e seed.js
export async function ensureMasterUser() {
  const masterEmail = process.env.MASTER_EMAIL || 'wallisondeyvid13@gmail.com';
  try {
    let masterUser = await User.findOne({ email: masterEmail });
    if (!masterUser) {
      const password = process.env.MASTER_PASSWORD || '123456';
      const hashedPassword = await bcrypt.hash(password, 10);
      masterUser = new User({
        nome: 'Master User',
        email: masterEmail,
        senha: hashedPassword,
        role: 'master',
        ativo: true
      });
      await masterUser.save();
      console.log('[gestor][seed] master user criado');
    } else if (process.env.MASTER_PASSWORD) {
      // Atualizar senha do master se variável estiver definida
      const hashedPassword = await bcrypt.hash(process.env.MASTER_PASSWORD, 10);
      masterUser.senha = hashedPassword;
      masterUser.role = 'master';
      masterUser.ativo = true;
      await masterUser.save();
      console.log('[gestor][seed] master user atualizado (senha/role/ativo)');
    }
  } catch (error) {
    console.error('[gestor][seed] erro ensureMasterUser:', error.message);
  }
}

export async function cleanupWrongEmail() {
  const wrongEmail = process.env.MASTER_WRONG_EMAIL || 'wallisondeyvdi13@gmail.com';
  try {
    const wrongUser = await User.findOne({ email: wrongEmail });
    if (wrongUser) {
      await User.deleteOne({ _id: wrongUser._id });
      console.log('[gestor][seed] usuario com email incorreto removido');
    }
  } catch (error) {
    console.error('[gestor][seed] erro cleanupWrongEmail:', error.message);
  }
}

export async function runBasicSeeds() {
  await ensureMasterUser();
  await cleanupWrongEmail();
}

export default runBasicSeeds;
