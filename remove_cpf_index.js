import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function removeGlobalCpfIndex() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/wdgestor');

    console.log('=== REMOVENDO ÍNDICE ÚNICO GLOBAL DE CPF ===');

    const collection = mongoose.connection.db.collection('users');

    // Tentar remover o índice único global de CPF
    try {
      await collection.dropIndex({ cpf: 1 });
      console.log('✅ Índice único global de CPF removido com sucesso!');
    } catch (error) {
      if (error.code === 27) {
        console.log('ℹ️ Índice único global de CPF já foi removido anteriormente');
      } else {
        console.error('❌ Erro ao remover índice único global de CPF:', error.message);
      }
    }

    // Verificar índices restantes
    console.log('\n=== ÍNDICES RESTANTES ===');
    const indexes = await collection.indexes();
    indexes.forEach((index, i) => {
      console.log(`${i + 1}. ${JSON.stringify(index.key)} - Unique: ${index.unique || false}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Operação concluída!');
  } catch (e) {
    console.error('❌ Erro geral:', e.message);
  }
}

removeGlobalCpfIndex();