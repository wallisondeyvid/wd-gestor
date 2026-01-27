// Script: update_unidade_codigo.js
// Objetivo: Alterar o campo `codigo` de uma Unidade (ex: M0010 -> M0001) com validações.
// Também atualiza campos denormalizados `unidade_codigo` em coleções que guardam o código (ex: Escala).
// Uso:
//   set MONGODB_URI=mongodb://localhost:27017/wdgestor
//   node scripts/update_unidade_codigo.js --from M0010 --to M0001 --dry-run
//   node scripts/update_unidade_codigo.js --from M0010 --to M0001
// Opções:
//   --from <CODIGO_ATUAL>   (obrigatório)
//   --to <NOVO_CODIGO>      (obrigatório)
//   --dry-run               (não persiste alterações)
//   --also-update-escalas 0|1 (default: 1)

import mongoose from 'mongoose';
import 'dotenv/config';
import Unidade from '../src/core/models/unidade.js';
import Escala from '../src/core/models/escala.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { alsoUpdateEscalas: true, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--from' && args[i + 1]) { out.from = String(args[i + 1]); i++; continue; }
    if (a === '--to' && args[i + 1]) { out.to = String(args[i + 1]); i++; continue; }
    if (a === '--dry-run') { out.dryRun = true; continue; }
    if (a === '--also-update-escalas' && args[i + 1]) {
      out.alsoUpdateEscalas = String(args[i + 1]).trim() !== '0';
      i++;
      continue;
    }
  }
  return out;
}

function normCode(v) {
  return String(v || '').trim().toUpperCase();
}

async function run() {
  const { from, to, dryRun, alsoUpdateEscalas } = parseArgs();
  const fromCode = normCode(from);
  const toCode = normCode(to);

  if (!fromCode || !toCode) {
    console.error('Uso: node scripts/update_unidade_codigo.js --from M0010 --to M0001 [--dry-run]');
    process.exit(1);
  }
  if (fromCode === toCode) {
    console.error('`--from` e `--to` são iguais. Nada a fazer.');
    process.exit(1);
  }
  if (!/^M\d{4,}$/i.test(fromCode) || !/^M\d{4,}$/i.test(toCode)) {
    console.warn('[warn] Formato de código inesperado. Prosseguindo mesmo assim:', { fromCode, toCode });
  }

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wdgestor';
  await mongoose.connect(uri);
  console.log('[update_unidade_codigo] Conectado em', uri);

  const src = await Unidade.findOne({ codigo: fromCode }).lean();
  if (!src) {
    console.error('Unidade de origem não encontrada com codigo:', fromCode);
    await mongoose.disconnect();
    process.exit(2);
  }

  const dst = await Unidade.findOne({ codigo: toCode }).lean();
  if (dst) {
    console.error('Já existe uma unidade com o código destino:', toCode, '(_id=' + String(dst._id) + ')');
    await mongoose.disconnect();
    process.exit(3);
  }

  console.log('Origem:', { _id: String(src._id), codigo: src.codigo, nome: src.nome, cnpj: src.cnpj });
  console.log('Destino:', { codigo: toCode });

  if (dryRun) {
    console.log('\n[dry-run] Nenhuma alteração será persistida.');
  }

  if (!dryRun) {
    const upd = await Unidade.updateOne(
      { _id: src._id, codigo: fromCode },
      { $set: { codigo: toCode } }
    );
    if (!upd || upd.modifiedCount !== 1) {
      console.error('Falha ao atualizar Unidade. Resultado:', upd);
      await mongoose.disconnect();
      process.exit(4);
    }
    console.log('Unidade atualizada: codigo', fromCode, '->', toCode);
  }

  if (alsoUpdateEscalas) {
    const escalaFilter = {
      $or: [
        { unidade_id: src._id },
        { unidade_codigo: fromCode }
      ]
    };

    const escalaCount = await Escala.countDocuments(escalaFilter);
    console.log('Escalas candidatas para atualizar unidade_codigo:', escalaCount);

    if (!dryRun && escalaCount) {
      const r = await Escala.updateMany(escalaFilter, { $set: { unidade_codigo: toCode } });
      console.log('Escalas atualizadas:', r?.modifiedCount ?? 0);
    }
  }

  await mongoose.disconnect();
  console.log('Fim.');
}

run().catch((e) => {
  console.error('Erro geral:', e);
  try { mongoose.disconnect(); } catch {}
  process.exit(1);
});
