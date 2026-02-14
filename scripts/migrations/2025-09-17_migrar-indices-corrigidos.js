// Migração original: migrar-indices-corrigidos.js
// Data de reorganização: 2025-09-17
// Mantido para referência e eventual reexecução em ambientes que ainda não aplicaram índices.

import mongoose from 'mongoose';
import Funcionario from '#models/Funcionario.js';
import User from '#models/user.js';

async function migrarIndicesCorrigidos() {
  try {
    console.log('🔄 Iniciando migração corrigida de índices...');

    // Remover índices únicos antigos incorretos (ignorando erros se não existirem)
    const dropIfExists = async (col, name) => {
      try { await mongoose.connection.db.collection(col).dropIndex(name); console.log(`✅ Índice removido: ${col}.${name}`); }
      catch { console.log(`ℹ️ Índice inexistente: ${col}.${name}`); }
    };

    await dropIfExists('funcionarios', 'unidade_email_unique');
    await dropIfExists('users', 'unidade_email_unique');

    console.log('📝 Criando novos índices...');

    const createIfMissing = async (col, spec, opts) => {
      try { await mongoose.connection.db.collection(col).createIndex(spec, opts); console.log(`✅ Índice criado: ${col} => ${opts?.name}`); }
      catch { console.log(`ℹ️ Índice já existe: ${col} => ${opts?.name}`); }
    };

    await createIfMissing('funcionarios', { unidade_id: 1, cpf: 1 }, { unique: true, name: 'unidade_cpf_unique' });
    await createIfMissing('funcionarios', { email: 1 }, { unique: true, name: 'email_unique_global' });
    await createIfMissing('users', { unidade_id: 1, cpf: 1 }, { unique: true, sparse: true, name: 'unidade_cpf_unique' });
    await createIfMissing('users', { email: 1 }, { unique: true, name: 'email_unique_global' });

    console.log('🎉 Migração corrigida concluída.');
    console.log('Regras: CPF único por empresa; email único global.');
  } catch (err) {
    console.error('❌ Erro na migração:', err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wdgestor';
  mongoose.connect(mongoURI)
    .then(() => migrarIndicesCorrigidos())
    .then(() => { console.log('✅ Finalizado'); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
}

export default migrarIndicesCorrigidos;
