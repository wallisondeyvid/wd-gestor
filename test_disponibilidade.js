import fetch from 'node-fetch';
import mongoose from 'mongoose';

// Teste simples para verificar se a correção do Map funciona
async function testPutEquipeDisponibilidade() {
  try {
    // Conectar ao MongoDB
    await mongoose.connect('mongodb+srv://wallisondeyvid13:inTE2006@cluster0.s16xqmm.mongodb.net/wdgestor?retryWrites=true&w=majority');

    // Criar uma escala de teste
    const Escala = await import('./src/core/models/escala.js').then(m => m.default);
    const escala = await Escala.create({
      descricao: 'Teste disponibilidade Map',
      classificacao: 'ORDINÁRIA',
      data_inicio: new Date('2025-01-01'),
      data_fim: new Date('2025-01-31'),
      equipes: [{
        id: 'eq_test',
        nome: 'TST',
        descricao: 'Equipe teste',
        componentes: [],
        disponibilidade: new Map([['func1', { dias: { '2025-01-01': false } }]])
      }]
    });

    console.log('Escala criada:', escala._id);

    // Testar PUT com disponibilidade como objeto (simulando JSON do frontend)
    const response = await fetch(`http://localhost:3000/api/escalas/${escala._id}/equipes/eq_test`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        // Simular autenticação básica para teste
        'Cookie': 'escalas.sid=test'
      },
      body: JSON.stringify({
        equipe: {
          nome: 'TST',
          disponibilidade: {
            'func1': { dias: { '2025-01-01': false, '2025-01-02': true } },
            'func2': { dias: { '2025-01-01': true } }
          }
        }
      })
    });

    console.log('PUT status:', response.status);
    const result = await response.json();
    console.log('PUT result:', result);

    // Verificar se foi salvo corretamente
    const updated = await Escala.findById(escala._id);
    console.log('Disponibilidade salva:', updated.equipes[0].disponibilidade);

    // Limpar
    await Escala.deleteOne({ _id: escala._id });
    await mongoose.disconnect();

    if (response.ok) {
      console.log('✅ Teste passou: PUT com Map funcionou');
    } else {
      console.log('❌ Teste falhou');
    }

  } catch (error) {
    console.error('Erro no teste:', error);
  }
}

testPutEquipeDisponibilidade();