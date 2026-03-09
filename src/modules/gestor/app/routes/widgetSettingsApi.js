import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { requireRole } from '#modules/gestor/app/middlewares/requireRole.js';
import {
  getFeedbackWidgetVisibility,
  listWidgetModules,
  updateFeedbackWidgetVisibility,
} from '#modules/gestor/app/controllers/widgetSettingsApiController.js';

const router = express.Router();

// Lista de módulos conhecidos
router.get('/api/gestor/widgets/modules', requireLogin, requireRole(['admin'], { allowMasterImplicit: true }), listWidgetModules);

// Mapa de visibilidade do widget de feedback (default: true)
// Opcional: ?module=<id> retorna somente 1
router.get('/api/gestor/widgets/feedback', requireLogin, getFeedbackWidgetVisibility);

// Atualizar visibilidade (admin/master)
router.put('/api/gestor/widgets/feedback', requireLogin, requireRole(['admin'], { allowMasterImplicit: true }), updateFeedbackWidgetVisibility);

export default router;
