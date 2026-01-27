export function requireRole(roles = [], opts = {}) {
  const { allowMasterImplicit = true } = opts;
  const normalized = roles.map(r => r.toLowerCase());
  return function(req, res, next){
    if(!req.user){
      return res.status(401).json({ success:false, error:'Não autenticado', code:'UNAUTHORIZED' });
    }
    const role = (req.user.role || '').toLowerCase();
    if(allowMasterImplicit && (req.user.isMaster || role === 'master')) return next();
    if(normalized.includes(role)) return next();
    return res.status(403).json({ success:false, error:'Acesso negado', code:'FORBIDDEN' });
  };
}
export default requireRole;
