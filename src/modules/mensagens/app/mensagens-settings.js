import mongoose from 'mongoose';
import { connectMongo } from '#config/db.js';
import CondMsgSettings from '#models/cond_msg_settings.js';

export async function ensureMongoReady() {
  try {
    if (mongoose.connection.readyState === 1) return true;

    const mongoUrl = (process.env.MONGO_URI || process.env.MONGODB_URI || '').trim();
    if (!mongoUrl) return false;

    await connectMongo(mongoUrl);
    return mongoose.connection.readyState === 1;
  } catch {
    return mongoose.connection.readyState === 1;
  }
}

export async function getOrInitMsgSettingsForUnidade(unidadeId) {
  const uid = String(unidadeId || '').trim();
  if (!uid || !mongoose.isValidObjectId(uid)) return null;

  const unitObjectId = new mongoose.Types.ObjectId(uid);

  const existing = await CondMsgSettings.findOne({ unidade_id: unitObjectId }).lean();
  if (existing) return existing;

  try {
    const created = await CondMsgSettings.create({
      unidade_id: unitObjectId,
      permitir_pessoal_para_pessoal: true
    });

    return created?.toObject ? created.toObject() : created;
  } catch {
    return await CondMsgSettings.findOne({ unidade_id: unitObjectId }).lean();
  }
}

export { mongoose };
