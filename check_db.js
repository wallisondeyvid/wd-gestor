import mongoose from 'mongoose';

async function check() {
  try {
    await mongoose.connect('mongodb+srv://wallisondeyvid13:inTE2006@cluster0.s16xqmm.mongodb.net/wdgestor?retryWrites=true&w=majority');
    const Unidade = mongoose.model('Unidade', new mongoose.Schema({}));
    const Funcao = mongoose.model('Funcao', new mongoose.Schema({}));
    const Funcionario = mongoose.model('Funcionario', new mongoose.Schema({}));
    const Setor = mongoose.model('Setor', new mongoose.Schema({}));
    const User = mongoose.model('User', new mongoose.Schema({}));

    const unidades = await Unidade.find({}).lean();
    console.log('Unidades:', unidades.map(u => ({ nome: u.nome, is_principal: u.is_principal })));

    const allUsers = await User.find().lean();
    console.log('Users:', allUsers.map(u => ({ email: u.email, role: u.role, funcionario_id: u.funcionario_id })));

    const allFuncs = await Funcionario.find().lean();
    console.log('Funcionarios:', allFuncs.map(f => ({ nome: f.nome, unidade_id: f.unidade_id })));

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

check();