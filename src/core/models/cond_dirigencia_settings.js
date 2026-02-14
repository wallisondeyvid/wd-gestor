import mongoose from 'mongoose';

const condDirigenciaSettingsSchema = new mongoose.Schema({
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true, unique: true, index: true },

  // Estado do organograma (roles, assignments, slotStyle, etc.).
  // Usamos Mixed para permitir evolução do schema sem migrações imediatas.
  state: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  schemaVersion: { type: Number, default: 1 },

  updatedBy: { type: String, trim: true, default: '' }
}, { timestamps: true });

condDirigenciaSettingsSchema.index({ unidade_id: 1 }, { unique: true, name: 'unidade_unique' });

const CondDirigenciaSettings = mongoose.models.CondDirigenciaSettings || mongoose.model('CondDirigenciaSettings', condDirigenciaSettingsSchema);
export default CondDirigenciaSettings;
