import crypto from 'crypto';

export function hashPasswordRecoveryToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

export default {
  hashPasswordRecoveryToken,
};