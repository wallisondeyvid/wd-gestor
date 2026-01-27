// Corrige o campo unidade_principal_id das funções para garantir vínculo correto com a matriz
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const mongoURI = process.env.MONGODB_URI;
if (!mongoURI) throw new Error('MONGODB_URI não definido');

const Unidade = require('../models/unidade');
const Funcao = require('../models/funcao');

async function corrigirFuncoes() {
  await mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Conectado ao MongoDB');

  // Busca todas as funções
  const funcoes = await Funcao.find().lean();
  let alteradas = 0;

  for (const funcao of funcoes) {
    // Busca a unidade vinculada
    const unidade = await Unidade.findById(funcao.unidade_principal_id).lean();
    if (!unidade) {
      console.warn('Unidade não encontrada para função', funcao._id);
      continue;
    }
    // Se a unidade não for matriz, corrige para a matriz
    let matrizId = unidade.is_principal ? unidade._id : (unidade.unidade_principal_id || unidade.matriz_id);
    if (matrizId && String(funcao.unidade_principal_id) !== String(matrizId)) {
      await Funcao.updateOne({ _id: funcao._id }, { $set: { unidade_principal_id: matrizId } });
      console.log(`Função ${funcao.nome} (${funcao._id}) corrigida para matriz ${matrizId}`);
      alteradas++;
    }
  }
  console.log(`Total de funções corrigidas: ${alteradas}`);
  mongoose.disconnect();
}

corrigirFuncoes().catch(e => {
  console.error('Erro ao corrigir funções:', e);
  mongoose.disconnect();
});
