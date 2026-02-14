// (migrado) biometriaApi
import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { listarDispositivosApi, capturarBiometria, sniffBiometria, diagnosticoBiometria } from '#modules/gestor/app/controllers/biometriaApiController.js';
const router = express.Router();
router.get('/api/biometria/dispositivos', requireLogin, listarDispositivosApi);
router.post('/api/biometria/capturar', requireLogin, capturarBiometria);
router.post('/api/biometria/sniff', requireLogin, sniffBiometria);
router.get('/api/biometria/diagnostico', requireLogin, diagnosticoBiometria);
export default router;
