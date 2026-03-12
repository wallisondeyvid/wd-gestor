// (migrado) unidadeApi
import express from 'express';
import {
	createUnidade,
	updateUnidade,
	toggleAccessUnidades,
	getUnidadeById,
	getUnidadeModulos,
	getUnidadeProvisioningStatus,
	getUnidadeProvisioningEvents,
	retryUnidadeProvisioning,
	deleteUnidade,
	uploadLogoUnidade,
	uploadLogoUnidadeInline,
	getUnidadeLogo,
	listUnidades,
	getUnidadePublic,
} from '#modules/gestor/app/controllers/unidadeApiController.js';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { requireUnitScope } from '#modules/gestor/app/middlewares/requireUnitScope.js';
const router = express.Router();

function withLoginAndRequiredUnitScope(handler) {
	return (req, res, next) => requireLogin(req, res, () => requireUnitScope(req, res, () => handler(req, res, next)));
}

router.post('/api/unidades', withLoginAndRequiredUnitScope(createUnidade));
// Listagem para hidratação client-side quando SSR vier vazio
router.get('/api/unidades', withLoginAndRequiredUnitScope(listUnidades));
router.put('/api/unidades/:id', withLoginAndRequiredUnitScope(updateUnidade));
// Upload de logo (imagem) da unidade
router.post('/api/unidades/:id/logo', withLoginAndRequiredUnitScope(uploadLogoUnidade));
// Upload inline (DataURL via JSON) — alternativa serverless sem multipart
router.post('/api/unidades/:id/logo-inline', withLoginAndRequiredUnitScope(uploadLogoUnidadeInline));
router.post('/api/unidades/toggle-access', requireLogin, toggleAccessUnidades);
router.get('/api/unidades/:id', withLoginAndRequiredUnitScope(getUnidadeById));
// Público para QR (sem requireLogin) – dados limitados
router.get('/api/public/unidades/:id', getUnidadePublic);
// Leitura da logo (binário) — retorna imagem a partir do armazenamento atual (Data URL ou legado em disco)
router.get('/api/unidades/:id/logo', withLoginAndRequiredUnitScope(getUnidadeLogo));
router.get('/api/unidades/:id/modulos', withLoginAndRequiredUnitScope(getUnidadeModulos));
router.get('/api/unidades/:id/provisioning', withLoginAndRequiredUnitScope(getUnidadeProvisioningStatus));
router.get('/api/unidades/:id/provisioning/events', withLoginAndRequiredUnitScope(getUnidadeProvisioningEvents));
router.post('/api/unidades/:id/provisioning/retry', withLoginAndRequiredUnitScope(retryUnidadeProvisioning));
router.delete('/api/unidades/:id', withLoginAndRequiredUnitScope(deleteUnidade));
export default router;
