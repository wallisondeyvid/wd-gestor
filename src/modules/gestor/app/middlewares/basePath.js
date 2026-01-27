// Middleware para garantir que basePath e moduleBasePath estejam sempre definidos
module.exports = function basePathMiddleware(req, res, next){
  // Caso no futuro base seja configurável, pode vir de config/env
  const defaultPath = '/gestor';
  if (!res.locals.basePath) res.locals.basePath = defaultPath;
  if (!res.locals.moduleBasePath) res.locals.moduleBasePath = res.locals.basePath;
  next();
};