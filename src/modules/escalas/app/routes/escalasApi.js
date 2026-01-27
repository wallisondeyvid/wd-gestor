import { Router } from 'express';

// Router legado neutralizado. Todas as rotas foram migradas para escalasApi.new.js.
// Este arquivo existe apenas para evitar imports quebrados e garantir uma resposta clara.
const router = Router();

router.use((req, res) => {
  res.status(410).json({ ok: false, error: 'Rotas legadas removidas. Use escalasApi.new.js' });
});

export default router;
// CommonJS fallback
// @ts-ignore
if (typeof module !== 'undefined' && module.exports) module.exports = router;
