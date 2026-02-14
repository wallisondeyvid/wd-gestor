import mongoose from 'mongoose';

const anexoSchema = new mongoose.Schema({
  nome: { type: String, trim: true, default: '' },
  url: { type: String, trim: true, default: '' },
  mime: { type: String, trim: true, default: '' },
  size: { type: Number, default: 0 },
}, { _id: false });

const feedbackSchema = new mongoose.Schema({
  tipo: { type: String, trim: true, default: 'outro', index: true },
  status: { type: String, trim: true, default: 'novo', index: true },

  mensagem: { type: String, trim: true, required: true, maxlength: 4000 },
  resposta: { type: String, trim: true, default: '', maxlength: 4000 },

  criadoPor: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    email: { type: String, trim: true, default: '', index: true },
    nome: { type: String, trim: true, default: '' },
    role: { type: String, trim: true, default: '' },
  },

  origem: {
    modulo: { type: String, trim: true, default: '' },
    path: { type: String, trim: true, default: '' },
    userAgent: { type: String, trim: true, default: '' },
    timezone: { type: String, trim: true, default: '' },
  },

  anexos: { type: [anexoSchema], default: () => [] },
}, { timestamps: true });

feedbackSchema.index({ createdAt: -1 });
feedbackSchema.index({ 'criadoPor.userId': 1, createdAt: -1 });

const Feedback = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema);
export default Feedback;
