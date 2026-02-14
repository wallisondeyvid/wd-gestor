// (migrado) debugApi
import express from 'express';
import { debugSession, whoAmI, userByEmail, userByCpf, testUnidades, removeWrongMaster, versionInfo } from '#modules/gestor/app/controllers/debugApiController.js';
import { router as mailerDebugRouter } from '#modules/gestor/app/routes/debugMailer.js';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
const router = express.Router();
router.get('/debug/session', requireLogin, debugSession);
router.get('/debug/whoami', requireLogin, whoAmI);
router.get('/debug/version', versionInfo);
router.get('/debug/user-by-email/:email', requireLogin, userByEmail);
router.get('/debug/user-by-cpf/:cpf', requireLogin, userByCpf);
router.get('/test-unidades', requireLogin, testUnidades);
router.post('/admin/remove-wrong-master', requireLogin, removeWrongMaster);
router.use('/debug/mailer', mailerDebugRouter);
export default router;
