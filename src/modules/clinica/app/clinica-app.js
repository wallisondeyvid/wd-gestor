import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
// Reutiliza API de usuário do módulo Gestor (perfil, foto, senha), para evitar duplicação
import gestorUserApi from '../../gestor/app/routes/userApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Injeção de basePath dinâmico para as views
app.use((req, res, next) => {
  res.locals.basePath = req.baseUrl || '/clinica';
  // Garante que 'user' exista nas views (mesmo que null) para evitar ReferenceError nas includes compartilhadas
  try {
    res.locals.user = req.user || (req.session && req.session.user) || null;
  } catch { res.locals.user = null; }
  next();
});

// Views: prioriza /views/clinica, com fallback para /views
app.set('views', [
  path.join(__dirname, '../../../../views/clinica'),
  path.join(__dirname, '../../../../views')
]);
app.set('view engine', 'ejs');

// Assets compartilhados (servimos das pastas globais; o prefixo público é adicionado no mount)
const ROOT = path.join(__dirname, '../../../..');
app.use('/css', express.static(path.join(ROOT, 'public/css')));
app.use('/js', express.static(path.join(ROOT, 'public/js')));
app.use('/images', express.static(path.join(ROOT, 'images')));
app.use('/img', express.static(path.join(ROOT, 'public/img')));

// APIs de usuário (perfil) sob /clinica/api/* — reutiliza rotas do Gestor
// Exemplos atendidos: GET /clinica/api/usuario, GET/POST /clinica/api/usuario/foto, PUT /clinica/api/usuario/senha
app.use(gestorUserApi);

// Dashboard inicial do módulo Clínica
app.get('/', (req, res) => res.redirect((req.baseUrl || '/clinica') + '/dashboard'));
app.get('/dashboard', (req, res) => {
  return res.render('dashboard', { moduleLabel: 'Clínica' });
});

export default app;
