import mongoose from 'mongoose';

const actorSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  nome: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, default: '' },
  role: { type: String, trim: true, default: '' },
  source: { type: String, trim: true, default: '' } // gestor|portal|api|system
}, { _id: false });

const requestSchema = new mongoose.Schema({
  ip: { type: String, trim: true, default: '' },
  ua: { type: String, trim: true, default: '' },
  path: { type: String, trim: true, default: '' },
  method: { type: String, trim: true, default: '' }
}, { _id: false });

const auditLogSchema = new mongoose.Schema({
  module: { type: String, trim: true, default: 'condominios', index: true },

  entityType: { type: String, trim: true, default: '', index: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  action: { type: String, trim: true, default: '', index: true },

  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', default: null, index: true },
  assembleia_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondAssembleia', default: null, index: true },

  actor: { type: actorSchema, default: () => ({}) },
  request: { type: requestSchema, default: () => ({}) },

  payload: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true });

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ assembleia_id: 1, createdAt: -1 });

const CondAuditLog = mongoose.models.CondAuditLog || mongoose.model('CondAuditLog', auditLogSchema);
export default CondAuditLog;
