// Middleware para APIs: garante autenticação via sessão e popula req.user mínimo
import User from '#models/user.js';

export async function requireApiAuth(req, res, next) {
  if (req.skipAuth) return next();
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success:false, error:'Não autenticado', code:'UNAUTHORIZED' });
  }
  if (!req.user) {
    try {
      const email = (req.session.user.email || '').toLowerCase();
      const userDoc = await User.findOne({ email }).lean();
      if (userDoc) {
        req.user = {
          id: userDoc._id,
            nome: userDoc.nome || req.session.user.nome || 'Usuário',
            email: userDoc.email,
            role: userDoc.role,
            isMaster: userDoc.role === 'master' || userDoc.email === 'wallisondeyvid13@gmail.com'
        };
      } else {
        return res.status(401).json({ success:false, error:'Sessão inválida', code:'UNAUTHORIZED' });
      }
    } catch (e) {
      return res.status(500).json({ success:false, error:'Falha auth', code:'AUTH_ERROR' });
    }
  }
  return next();
}
export default requireApiAuth;
