import mongoose from 'mongoose';

const condAssembleiaSettingsSchema = new mongoose.Schema({
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true, unique: true, index: true },

  // Regras/políticas padrão das assembleias (nível condomínio).
  // Mixed para permitir evolução do schema sem migrações imediatas.
  regras: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  schemaVersion: { type: Number, default: 1 },

  updatedBy: { type: String, trim: true, default: '' }
}, { timestamps: true });

condAssembleiaSettingsSchema.index({ unidade_id: 1 }, { unique: true, name: 'unidade_unique' });

const CondAssembleiaSettings = mongoose.models.CondAssembleiaSettings || mongoose.model('CondAssembleiaSettings', condAssembleiaSettingsSchema);
export default CondAssembleiaSettings;
