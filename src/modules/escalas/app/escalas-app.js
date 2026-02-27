import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
// Temporariamente substituir alias por caminho relativo para diagnosticar SyntaxError em runtime.
import User from '#models/user.js';
import authRouter from './routes/auth.js';
import dashboardRouter from './routes/dashboard.js';
import userApiRouter from './routes/userApi.js';
import escalaNovaRouter from './routes/escalaNova.js'; // rota nova escala
import unidadesApiRouter from './routes/unidadesApi.js'; // rota API unidades relacionadas
// Substitui temporariamente escalasApi.js (com erro de parsing) por versão simplificada escalasApi.new.js
import escalasApiRouter from './routes/escalasApi.new.js'; // rota API escalas (persistência simplificada)
import funcionariosRespApiRouter from './routes/funcionariosResponsaveisApi.js'; // rota API funcionarios responsáveis
import popupGrupoTurnosRouter from './routes/popupGrupoTurnos.js'; // rota popup grupos turnos
import funcionarioBuscaCodigoApiRouter from './routes/funcionarioBuscaCodigoApi.js'; // rota API busca funcionário por código
import feriasRouter from './routes/ferias.js'; // rota página férias
import ausenciasRouter from './routes/ausencias.js'; // rota página ausências
import recursosApiRouter from './routes/recursosApi.js'; // rota API recursos (busca por placa/unidade)
import relatoriosRouter from './routes/relatorios.js'; // rota relatórios (PDF)
import notasRouter from './routes/notas.js'; // rota modal notas
import gestorUserApi from '#modules/gestor/app/routes/userApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(process.cwd());

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Views: permitir reutilizar templates do Gestor adicionando múltiplos diretórios
app.set('views', [
  path.join(ROOT, 'views/escalas'),
  path.join(ROOT, 'views/gestor'),
  path.join(ROOT, 'views')
]);
app.set('view engine', 'ejs');

// Static (não repetir prefixo; app será montado em /escalas no createServer)
app.use('/images', express.static(path.join(ROOT, 'images')));      // => /escalas/images
app.use('/css', express.static(path.join(ROOT, 'public/css')));     // => /escalas/css
// Colocar rotas mais específicas antes para não serem engolidas pelo prefixo /js genérico
// 1) Abas/arquitetura nova: public/escalas/js/escalas/* -> /escalas/js/escalas/*
app.use('/js/escalas', express.static(path.join(ROOT, 'public/escalas/js/escalas')));
// 2) Core e demais scripts do módulo: public/escalas/js/* -> /escalas/js/* (deve vir antes do genérico)
app.use('/js', express.static(path.join(ROOT, 'public/escalas/js')));
// 3) Genérico/compartilhado: public/js/* -> /escalas/js/*
app.use('/js', express.static(path.join(ROOT, 'public/js')));
// Alinhar com Gestor: expor /img e /uploads também neste módulo
app.use('/img', express.static(path.join(ROOT, 'public/img')));     // => /escalas/img
app.use('/uploads', express.static(path.join(ROOT, 'public/uploads'))); // => /escalas/uploads

// Compatibilidade: alguns templates esperam /<base>/js/pages/login.js.
// No módulo Escalas o script de login mora em public/js/escalas/login.js.
app.get('/js/pages/login.js', (req,res)=>{
  try {
    res.type('application/javascript');
    return res.sendFile(path.join(ROOT, 'public/js/escalas/login.js'));
  } catch (e) {
    res.status(404).send('// login.js não encontrado para Escalas');
  }
});

// Popular req.user a partir da sessão
app.use(async (req, _res, next) => {
  try {
    if (req.skipAuth) return next();
    if (req.user) return next();
  const sessionUser = req.session?.escalasUser;
    if (!sessionUser?.email) return next();
    const userDoc = await User.findOne({ email: sessionUser.email.toLowerCase() }).lean();
    if (userDoc) {
      req.user = {
        id: userDoc._id,
        nome: userDoc.nome,
        email: userDoc.email,
        role: userDoc.role,
        isMaster: userDoc.role === 'master',
        unidade_id: userDoc.unidade_id || null,
        foto: userDoc.foto || null
      };
    }
  } catch (e) { console.warn('[escalas][populateUser] falha:', e.message); }
  next();
});

// Expor user às views (após popular req.user)
app.use(async (req, res, next) => {
  // Usa somente a sessão específica do módulo
  res.locals.user = req.user || (req.session && req.session.escalasUser) || null;
  next();
});

// Delegação seletiva para API de usuário do Gestor (sem interceptar APIs próprias do módulo Escalas)
app.use((req, res, next) => {
  try {
    const method = String(req.method || 'GET').toUpperCase();
    const pathOnly = String(req.path || (req.originalUrl || req.url || '')).split('?')[0];
    const isObjectId = (s) => /^[0-9a-fA-F]{24}$/.test(String(s || ''));

    const shouldDelegate = (() => {
      if (!pathOnly.startsWith('/api/')) return false;

      if (pathOnly === '/api/usuario') return true;
      if (pathOnly === '/api/usuario/foto') return true;
      if (pathOnly === '/api/usuario/senha') return true;
      if (pathOnly === '/api/modulos' && method === 'GET') return true;

      if (pathOnly === '/api/usuarios' && method === 'POST') return true;

      const m = pathOnly.match(/^\/api\/usuarios\/([^\/]+)\/(update|toggle|delete|status)$/i);
      if (m && isObjectId(m[1])) return true;

      return false;
    })();

    if (!shouldDelegate) return next();
    return gestorUserApi(req, res, next);
  } catch {
    return next();
  }
});

// Rotas (sem prefixo; prefixo é aplicado no index via meta.basePath)
app.use('/', authRouter);
app.use('/', dashboardRouter);
app.use('/', userApiRouter);
app.use('/', escalaNovaRouter); // criação de escala
app.use('/', unidadesApiRouter); // api unidades relacionadas
app.use('/', escalasApiRouter); // api escalas
app.use('/', funcionariosRespApiRouter); // api funcionarios responsáveis
app.use('/', popupGrupoTurnosRouter); // popup grupos de turnos
app.use('/', funcionarioBuscaCodigoApiRouter); // busca funcionário por código
app.use('/', feriasRouter); // página gestão férias
app.use('/', ausenciasRouter); // página gestão ausências
app.use('/', recursosApiRouter); // api recursos (escopada a sessão Escalas)
app.use('/', relatoriosRouter); // relatórios PDF
app.use('/', notasRouter); // modal de notas

// Fallthrough
app.use((req, res, next) => next());

export default app;
