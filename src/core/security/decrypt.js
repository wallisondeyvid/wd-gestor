import crypto from 'crypto';

const ENC_PREFIX = 'enc.v1:';
const missingKeyWarned = { value: false };
const invalidKeyWarned = { value: false };

const keyBuffer = resolveKey();

export default function decrypt(value) {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (!trimmed.startsWith(ENC_PREFIX)) return value;
  if (!keyBuffer) {
    warnOnce(missingKeyWarned, '[decrypt] Encryption key not configured; returning cipher text as-is.');
    return value;
  }

  const payload = trimmed.slice(ENC_PREFIX.length);
  const parts = payload.split(':');
  if (parts.length !== 3) return value;
  const [ivHex, tagHex, dataB64] = parts;
  if (!ivHex || !tagHex || !dataB64) return value;

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const ciphertext = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    warnOnce(invalidKeyWarned, '[decrypt] Failed to decode value, returning original.');
    return value;
  }
}

function resolveKey() {
  const raw = process.env.WDG_CRYPTO_KEY || process.env.GESTOR_CRYPTO_KEY || process.env.CRYPTO_MASTER_KEY;
  if (!raw) return null;
  const normalized = raw.startsWith('base64:') ? raw.slice(7) : raw;
  try {
    if (raw.startsWith('base64:')) return Buffer.from(normalized, 'base64');
    if (raw.startsWith('hex:')) return Buffer.from(normalized.slice(4), 'hex');
    const buf = Buffer.from(normalized, 'hex');
    if (buf.length === 32) return buf;
    return Buffer.from(normalized, 'base64');
  } catch (_) {
    return null;
  }
}

function warnOnce(state, message) {
  if (state.value) return;
  state.value = true;
  if (process.env.NODE_ENV !== 'test') console.warn(message);
}
