// Migração: alinhar índices de recursos ao contrato multi-tenant por unidade.
// Remove índices globais legados e garante índices compostos únicos por unidade.

import mongoose from 'mongoose';

const COLLECTION = 'recursos';

const LEGACY_INDEXES = [
  'placa_1',
  'chassi_1',
  'renavam_1',
];

const TARGET_INDEXES = [
  {
    name: 'unidade_id_1_placa_1',
    key: { unidade_id: 1, placa: 1 },
    options: { unique: true, name: 'unidade_id_1_placa_1' },
  },
  {
    name: 'unidade_id_1_chassi_1',
    key: { unidade_id: 1, chassi: 1 },
    options: { unique: true, name: 'unidade_id_1_chassi_1' },
  },
  {
    name: 'unidade_id_1_renavam_1',
    key: { unidade_id: 1, renavam: 1 },
    options: { unique: true, name: 'unidade_id_1_renavam_1' },
  },
];

function sameKey(left, right) {
  const leftEntries = Object.entries(left || {});
  const rightEntries = Object.entries(right || {});
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(([key, value], index) => {
    const rightEntry = rightEntries[index];
    return rightEntry && rightEntry[0] === key && rightEntry[1] === value;
  });
}

async function migrarIndicesRecursosPorUnidade() {
  try {
    console.log('🔄 Iniciando migração de índices de recursos por unidade...');

    const collection = mongoose.connection.db.collection(COLLECTION);
    const indexes = await collection.indexes();

    console.log('📋 Índices atuais em recursos:');
    indexes.forEach((index) => {
      console.log(' -', index.name, JSON.stringify(index.key), index.unique ? '[UNIQUE]' : '');
    });

    for (const target of TARGET_INDEXES) {
      const indexesBeforeCreate = await collection.indexes();
      const existing = indexesBeforeCreate.find((index) => index.name === target.name || sameKey(index.key, target.key));

      if (existing?.unique && sameKey(existing.key, target.key)) {
        console.log(`ℹ️ Índice composto já existe: ${COLLECTION}.${existing.name}`);
        continue;
      }

      if (existing && !existing.unique && sameKey(existing.key, target.key)) {
        console.log(`⚠️ Índice com mesma chave sem unicidade encontrado: ${COLLECTION}.${existing.name}`);
        await collection.dropIndex(existing.name);
        console.log(`✅ Índice incompatível removido: ${COLLECTION}.${existing.name}`);
      }

      await collection.createIndex(target.key, target.options);
      console.log(`✅ Índice composto criado: ${COLLECTION}.${target.name}`);
    }

    for (const legacyName of LEGACY_INDEXES) {
      const indexesBeforeDrop = await collection.indexes();
      const exists = indexesBeforeDrop.some((index) => index.name === legacyName);
      if (!exists) {
        console.log(`ℹ️ Índice legado inexistente: ${COLLECTION}.${legacyName}`);
        continue;
      }

      await collection.dropIndex(legacyName);
      console.log(`✅ Índice legado removido: ${COLLECTION}.${legacyName}`);
    }

    console.log('🎉 Migração de índices de recursos concluída.');
    console.log('Regra aplicada: placa, chassi e renavam únicos por unidade_id.');
  } catch (err) {
    console.error('❌ Erro na migração de índices de recursos:', err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wdgestor';
  mongoose.connect(mongoURI)
    .then(() => migrarIndicesRecursosPorUnidade())
    .then(() => { console.log('✅ Finalizado'); process.exit(0); })
    .catch((error) => { console.error(error); process.exit(1); });
}

export default migrarIndicesRecursosPorUnidade;