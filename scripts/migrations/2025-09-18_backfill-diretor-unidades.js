// Migração: backfill-diretor-unidades
// Data: 2025-09-18
// Objetivo: Preencher o campo diretor_usuario_id nas unidades principais (is_principal=true)
//           com base no usuário com role 'diretor' cujo unidade_id corresponda à unidade.

import 'dotenv/config';
import mongoose from 'mongoose';
import Unidade from '#core/models/unidade.js';
import User from '#core/models/user.js';
import { fileURLToPath } from 'url';

function parseArgs(argv) {
  const args = new Set();
  const kv = new Map();
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) {
        kv.set(a.slice(2, eq), a.slice(eq + 1));
      } else {
        args.add(a);
      }
    } else if (a.startsWith('-')) {
      args.add(a);
    }
  }
  return { args, kv };
}

async function backfillDiretorUnidades({ dryRun = false, onlyUnitId = null } = {}) {
  try {
    console.log('🔄 Iniciando backfill de diretor_usuario_id em Unidades principais...');
    if (dryRun) console.log('🧪 Modo DRY-RUN: nenhuma alteração será gravada.');
    if (onlyUnitId) console.log(`🎯 Limitado à unidade: ${onlyUnitId}`);

    const filtroUnidades = { is_principal: true };
    if (onlyUnitId) Object.assign(filtroUnidades, { _id: new mongoose.Types.ObjectId(onlyUnitId) });

    const unidades = await Unidade
      .find(filtroUnidades)
      .select('_id diretor_usuario_id nome')
      .lean();

    console.log(`Encontradas ${unidades.length} unidade(s) principal(is).`);

    let atualizadas = 0; let semDiretorEncontrado = 0; let jaPreenchidas = 0;

    for (const u of unidades) {
      if (u.diretor_usuario_id) { jaPreenchidas++; continue; }

      const diretor = await User
        .findOne({ role: 'diretor', ativo: true, unidade_id: u._id })
        .sort({ createdAt: -1 })
        .select('_id nome email')
        .lean();

      if (!diretor) { semDiretorEncontrado++; continue; }

      if (!dryRun) {
        await Unidade.updateOne({ _id: u._id }, { $set: { diretor_usuario_id: diretor._id } });
      }
      atualizadas++;
      console.log(`✅ Unidade ${u._id} (${u.nome || ''}) vinculada ao diretor ${diretor._id} ${dryRun ? '(simulado)' : ''}`);
    }

    console.log('📊 Resumo backfill:');
    console.log(` - Atualizadas: ${atualizadas}${dryRun ? ' (simulado)' : ''}`);
    console.log(` - Já preenchidas: ${jaPreenchidas}`);
    console.log(` - Sem diretor correspondente: ${semDiretorEncontrado}`);

    console.log('🎉 Backfill concluído.');
  } catch (err) {
    console.error('❌ Erro no backfill:', err);
    throw err;
  }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && process.argv[1] === __filename) {
  (async () => {
    const { args, kv } = parseArgs(process.argv.slice(2));
    const dryRun = args.has('--dry-run') || args.has('-n');
    const onlyUnitId = kv.get('unit') || kv.get('unidade') || null;

    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wdgestor';
    try {
      await mongoose.connect(mongoURI);
      await backfillDiretorUnidades({ dryRun, onlyUnitId });
      console.log('✅ Finalizado');
      await mongoose.disconnect();
      process.exit(0);
    } catch (e) {
      console.error(e);
      try { await mongoose.disconnect(); } catch {}
      process.exit(1);
    }
  })();
}

export default backfillDiretorUnidades;
