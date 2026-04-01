import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import requireApiAuth from '#modules/gestor/app/middlewares/requireApiAuth.js';
import { handleFaceBiometriaUpload } from '#modules/gestor/app/controllers/faceBiometriaUploadApiController.js';

const router = express.Router();

router.post('/api/biometria/face/upload', requireLogin, requireApiAuth, handleFaceBiometriaUpload);

export default router;
