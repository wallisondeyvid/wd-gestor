import mongoose from 'mongoose';

// QR Code persistente por material (um por material)
const qrcodeMaterialSchema = new mongoose.Schema({
  material_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondBemMaterial', required: true, unique: true },
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true },
  // URL pública que o QR aponta (hash com payload base64)
  url: { type: String, trim: true, default: '' },
  // Payload bruto utilizado para geração do QR (útil para validações e regeneração)
  payload: { type: Object, default: {} },
  // Imagem do QR (URL pública do blob)
  img: { type: String, trim: true, default: '' },
  formato: { type: String, enum: ['png','svg'], default: 'png' }
}, { timestamps: true });

qrcodeMaterialSchema.index({ material_id: 1 }, { unique: true });

const CondQRCodeMaterial = mongoose.models.CondQRCodeMaterial || mongoose.model('CondQRCodeMaterial', qrcodeMaterialSchema);
export default CondQRCodeMaterial;
