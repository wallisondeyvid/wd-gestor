// escalas-app.js - Entry point do módulo Escalas (ESM)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import router from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();

export function buildEscalasApp() {
	const app = express();
	app.set('views', path.join(ROOT, 'views/escalas'));
	app.set('view engine', 'ejs');
	app.use('/js/escalas', express.static(path.join(ROOT, 'public/js/escalas')));
	app.use('/css/escalas', express.static(path.join(ROOT, 'public/css/escalas')));
	app.use('/', router);
	return app;
}

export default buildEscalasApp;
