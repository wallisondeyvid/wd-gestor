// Lista todas as funções e mostra o vínculo com unidade principal
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const mongoURI = process.env.MONGODB_URI;
if (!mongoURI) throw new Error('MONGODB_URI não definido');

const Unidade = require('#models/unidade');
const Funcao = require('#models/funcao');

async function listarFuncoesVinculos() {
  await mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Conectado ao MongoDB');

  const funcoes = await Funcao.find().lean();
  for (const funcao of funcoes) {
    let unidade = null;
    if (funcao.unidade_principal_id) {
      unidade = await Unidade.findById(funcao.unidade_principal_id).lean();
    }
    console.log(`Função: ${funcao.nome} | Código: ${funcao.codigo} | _id: ${funcao._id}`);
    if (unidade) {
      console.log(`  Vinculada à unidade: ${unidade.nome} | _id: ${unidade._id} | Matriz: ${unidade.is_principal ? 'Sim' : 'Não'}`);
    } else {
      console.log('  Vinculada à unidade: (não encontrada)');
    }
  }
  mongoose.disconnect();
}

listarFuncoesVinculos().catch(e => {
  console.error('Erro ao listar funções:', e);
  mongoose.disconnect();
});
