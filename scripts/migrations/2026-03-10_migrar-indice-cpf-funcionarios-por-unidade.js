// Migracao: alinhar indice de cpf de funcionarios ao contrato por unidade.
// Cria primeiro o indice composto unico por unidade_id + cpf.
// Remove depois o indice global legado de cpf, se existir.

import 'dotenv/config';
import mongoose from 'mongoose';

const COLLECTION = 'funcionarios';

const TARGET_INDEX = {
  name: 'unidade_id_1_cpf_1',
  key: { unidade_id: 1, cpf: 1 },
  options: { unique: true, name: 'unidade_id_1_cpf_1' },
};

const LEGACY_CPF_KEY = { cpf: 1 };

function sameKey(left, right) {
  const leftEntries = Object.entries(left || {});
  const rightEntries = Object.entries(right || {});
  if (leftEntries.length !== rightEntries.length) return false;

  return leftEntries.every(([key, value], index) => {
    const rightEntry = rightEntries[index];
    return rightEntry && rightEntry[0] === key && rightEntry[1] === value;
  });
}

function isLegacyGlobalCpfIndex(index) {
  return sameKey(index?.key, LEGACY_CPF_KEY) && index?.unique === true;
}

async function migrarIndiceCpfFuncionariosPorUnidade() {
  console.log('Iniciando migracao do indice de cpf de funcionarios por unidade...');

  const collection = mongoose.connection.db.collection(COLLECTION);
  const indexes = await collection.indexes();

  console.log('Indices atuais em funcionarios:');
  indexes.forEach((index) => {
    console.log(' -', index.name, JSON.stringify(index.key), index.unique ? '[UNIQUE]' : '');
  });

  const existingTarget = indexes.find(
    (index) => index.name === TARGET_INDEX.name || sameKey(index.key, TARGET_INDEX.key)
  );

  const existingTargetByName = indexes.find((index) => index.name === TARGET_INDEX.name);

  if (existingTargetByName && !sameKey(existingTargetByName.key, TARGET_INDEX.key)) {
    throw new Error(
      `Ja existe um indice com o nome alvo ${COLLECTION}.${TARGET_INDEX.name}, mas com shape incompatível: ${JSON.stringify(existingTargetByName.key)}`
    );
  }

  if (existingTarget?.unique && sameKey(existingTarget.key, TARGET_INDEX.key)) {
    console.log(`Indice composto ja existe: ${COLLECTION}.${existingTarget.name}`);
  } else {
    if (existingTarget && sameKey(existingTarget.key, TARGET_INDEX.key) && !existingTarget.unique) {
      console.log(`Indice composto incompatível encontrado sem unicidade: ${COLLECTION}.${existingTarget.name}`);
      await collection.dropIndex(existingTarget.name);
      console.log(`Indice incompatível removido: ${COLLECTION}.${existingTarget.name}`);
    }

    await collection.createIndex(TARGET_INDEX.key, TARGET_INDEX.options);
    console.log(`Indice composto criado: ${COLLECTION}.${TARGET_INDEX.name}`);
  }

  const indexesAfterTarget = await collection.indexes();
  const legacyIndexes = indexesAfterTarget.filter(isLegacyGlobalCpfIndex);

  if (!legacyIndexes.length) {
    console.log(`Nenhum indice global legado de cpf encontrado em ${COLLECTION}.`);
  }

  for (const legacyIndex of legacyIndexes) {
    await collection.dropIndex(legacyIndex.name);
    console.log(`Indice global legado removido: ${COLLECTION}.${legacyIndex.name}`);
  }

  console.log('Migracao concluida. Regra aplicada: cpf unico por unidade_id em funcionarios.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wdgestor';

  (async () => {
    try {
      await mongoose.connect(mongoURI);
      await migrarIndiceCpfFuncionariosPorUnidade();
      await mongoose.disconnect();
      console.log('Finalizado');
      process.exit(0);
    } catch (error) {
      console.error('Erro na migracao do indice de cpf de funcionarios:', error);
      try { await mongoose.disconnect(); } catch {}
      process.exit(1);
    }
  })();
}

export default migrarIndiceCpfFuncionariosPorUnidade;
