import express from 'express';

const router = express.Router();

router.get('/health', (req, res) => {
  return res.json({
    ok: true,
    module: 'mensagens',
    api: 'msg'
  });
});

export default router;
